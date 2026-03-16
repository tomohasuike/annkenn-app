import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v4.14.4/index.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { projectId } = await req.json()

    if (!projectId) {
      return new Response(JSON.stringify({ error: "Missing projectId" }), { headers: corsHeaders, status: 400 })
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // 1. Fetch project details to get folder_url
    const { data: project, error: fetchError } = await supabase
      .from('projects')
      .select('folder_url')
      .eq('id', projectId)
      .single()

    if (fetchError) throw fetchError

    // 2. Check Google Drive if folder_url exists
    if (project && project.folder_url) {
      // Extract folder ID from URL (e.g., https://drive.google.com/drive/folders/12345abcde)
      const urlMatches = project.folder_url.match(/folders\/([-a-zA-Z0-9_]+)/)
      const folderId = urlMatches ? urlMatches[1] : null

      if (folderId) {
        // Authenticate with Google
        const googleServiceAccountEmail = Deno.env.get('GOOGLE_SA_EMAIL')
        const googlePrivateKey = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') || '').replace(/\\n/g, '\n')
        
        if (googleServiceAccountEmail && googlePrivateKey) {
          const token = await getGoogleOAuthToken(googleServiceAccountEmail, googlePrivateKey)
          
          // Check if folder is empty
          const hasFiles = await checkFolderHasUserFiles(token, folderId)
          
          if (hasFiles) {
            return new Response(
              JSON.stringify({ error: "Cannot delete project: Google Drive folder contains files." }), 
              { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
            )
          } else {
            // Folder is empty (only default subfolders), safe to delete from Drive
            await deleteDriveFile(token, folderId)
          }
        }
      }
    }

    // 3. Delete the project from Supabase
    // Note: Depends on ON DELETE CASCADE for related tables in DB schema
    const { error: deleteError } = await supabase
      .from('projects')
      .delete()
      .eq('id', projectId)

    if (deleteError) throw deleteError

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error deleting project:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

// --- Helper Functions ---

async function getGoogleOAuthToken(email: string, privateKey: string): Promise<string> {
  const privateKeyObj = await importPKCS8(privateKey, "RS256")
  const jwt = await new SignJWT({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKeyObj)

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(`Google Auth Error: ${JSON.stringify(data)}`)
  return data.access_token
}

async function checkFolderHasUserFiles(token: string, folderId: string): Promise<boolean> {
  // Query 1: Check root project folder for any non-folder files
  const rootQuery = encodeURIComponent(`'${folderId}' in parents and mimeType != 'application/vnd.google-apps.folder' and trashed = false`)
  const url1 = `https://www.googleapis.com/drive/v3/files?q=${rootQuery}&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true`
  
  const res1 = await fetch(url1, { headers: { "Authorization": `Bearer ${token}` } })
  if (!res1.ok) throw new Error(`Failed to list root files: ${await res1.text()}`)
  const data1 = await res1.json()
  
  if (data1.files && data1.files.length > 0) return true // Found actual files in root folder

  // Query 2: Get all subfolders
  const subFolderQuery = encodeURIComponent(`'${folderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`)
  const url2 = `https://www.googleapis.com/drive/v3/files?q=${subFolderQuery}&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true`
  
  const res2 = await fetch(url2, { headers: { "Authorization": `Bearer ${token}` } })
  if (!res2.ok) throw new Error(`Failed to list subfolders: ${await res2.text()}`)
  const data2 = await res2.json()

  // Query 3: Check inside each subfolder (Level 2)
  for (const subfolder of (data2.files || [])) {
    const checkQuery = encodeURIComponent(`'${subfolder.id}' in parents and trashed = false`)
    const url3 = `https://www.googleapis.com/drive/v3/files?q=${checkQuery}&corpora=allDrives&supportsAllDrives=true&includeItemsFromAllDrives=true`
    
    const res3 = await fetch(url3, { headers: { "Authorization": `Bearer ${token}` } })
    if (res3.ok) {
      const data3 = await res3.json()
      if (data3.files && data3.files.length > 0) return true // Found files inside a subfolder
    }
  }

  return false // No user files found
}

async function deleteDriveFile(token: string, fileId: string): Promise<void> {
  // Instead of permanent DELETE, we move it to the trash
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: { 
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  })
  
  if (!response.ok) {
    console.error(`Failed to trash Drive folder ${fileId}:`, await response.text())
    // We log but don't strictly throw if it's already deleted or 404
  }
}
