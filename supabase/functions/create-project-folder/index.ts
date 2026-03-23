import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

// Define folder structure constants based on legacy AppSheet structure
const SUBFOLDERS = [
  "01_資料",
  "02_見積",
  "03_CAD"
]

serve(async (req: Request) => {
  try {
    // 1. Parse incoming webhook payload from Supabase
    const payload = await req.json()
    const record = payload.record // The inserted row in the projects table

    if (!record || !record.project_number || !record.project_name) {
      return new Response(JSON.stringify({ error: "Invalid payload from webhook" }), { status: 400 })
    }

    // Skip folder creation if the project already has a Google Drive folder URL assigned
    if (record.folder_url && record.folder_url.includes('drive.google.com')) {
      return new Response(JSON.stringify({ message: "Project already has a folder, skipping creation." }), { status: 200 })
    }

    // --- Branch Project Logic ---
    // If it's a branch project (has parent_project_id), inherit the parent's folder instead of creating a new one.
    if (record.parent_project_id) {
      console.log(`Branch project detected: ${record.project_number}. Inheriting parent folder...`)
      
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      const supabase = createClient(supabaseUrl, supabaseKey)

      const { data: parentRecord, error: parentError } = await supabase
        .from('projects')
        .select('folder_url')
        .eq('id', record.parent_project_id)
        .single()
        
      if (!parentError && parentRecord?.folder_url) {
        // Update this record with parent's folder_url
        const { error: updateError } = await supabase
          .from('projects')
          .update({ folder_url: parentRecord.folder_url })
          .eq('id', record.id)
          
        if (updateError) throw updateError
        
        return new Response(JSON.stringify({ 
          message: "Branch project: Copied parent folder URL, skipped new folder creation.", 
          folder_url: parentRecord.folder_url 
        }), { status: 200 })
      } else {
        console.warn(`Could not find folder_url for parent project (${record.parent_project_id}). Proceeding to create a new folder...`)
      }
    }
    // ----------------------------

    // 2. Load Environment Variables for Google Drive API
    const googleServiceAccountEmail = Deno.env.get('GOOGLE_SA_EMAIL')
    const googlePrivateKey = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') || '').replace(/\\n/g, '\n')
    
    // Determine the root folder ID based on category and status
    const category = record.category || "一般"
    const isCompleted = record.status_flag === "完工"

    const PARENT_FOLDERS: Record<string, { active: string, completed: string }> = {
      "一般": { active: "0AEEgKEmqEoodUk9PVA", completed: "1CsftKlRsu1dIYgMW3fHBoGoEdS1mRwvq" },
      "役所": { active: "0AEEgKEmqEoodUk9PVA", completed: "1CsftKlRsu1dIYgMW3fHBoGoEdS1mRwvq" },
      "川北": { active: "11-se3sjX78JlzYo_tShSGdEAaZkY1JGa", completed: "1G82W7jQymLIYXOYXsvnqMfUYBNSPnZoa" },
      "BPE":  { active: "1kcn5ZafuLs45GBWu51073nsMF436Cmgc", completed: "12D97lObfGL-deXPRumoPnKLFyumfhqOV" }
    }

    const driveParentFolderId = isCompleted 
      ? PARENT_FOLDERS[category]?.completed 
      : PARENT_FOLDERS[category]?.active

    if (!googleServiceAccountEmail || !googlePrivateKey || !driveParentFolderId) {
      console.error(`Missing config or folder mapping for category: ${category}, status: ${record.status_flag}`)
      return new Response(JSON.stringify({ error: "Missing config or valid category mapping" }), { status: 500 })
    }

    // 3. Authenticate with Google (Using a lightweight JWT implementation for Deno)
    // Note: To use Google APIs securely in Deno Edge Functions, we typically format a JWT 
    // and exchange it for a Bearer token without needing the full Node.js `googleapis` SDK.
    const token = await getGoogleOAuthToken(googleServiceAccountEmail, googlePrivateKey)

    // 4. Create the main project folder
    const suffix = record.site_name || record.client_name || ""
    const folderName = suffix 
      ? `${record.project_number}${record.project_name}-${suffix}`
      : `${record.project_number}${record.project_name}`
    const projectFolderId = await createDriveFolder(token, folderName, driveParentFolderId)

    // 5. Create the standard subfolders
    for (const subfolder of SUBFOLDERS) {
      await createDriveFolder(token, subfolder, projectFolderId)
    }

    // 6. Update the Supabase record with the generated Google Drive Link
    const folderUrl = `https://drive.google.com/drive/folders/${projectFolderId}`
    
    // Create Supabase Client (bypassing RLS with Service Role Key for background processing)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error: updateError } = await supabase
      .from('projects')
      .update({ folder_url: folderUrl })
      .eq('id', record.id)

    if (updateError) throw updateError

    return new Response(JSON.stringify({ success: true, folder_url: folderUrl }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error creating project folder:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})

// --- Helper Functions for Google Drive API (Deno compatible) ---

// Create a Google OAuth Token
async function getGoogleOAuthToken(email: string, privateKey: string): Promise<string> {
  // Use jose library to create a JWT for Google Service Account auth
  const { SignJWT, importPKCS8 } = await import("https://deno.land/x/jose@v4.14.4/index.ts");
  
  const privateKeyObj = await importPKCS8(privateKey, "RS256");
  const jwt = await new SignJWT({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive",
    aud: "https://oauth2.googleapis.com/token",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKeyObj);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Google Auth Error: ${JSON.stringify(data)}`);
  }
  
  return data.access_token;
}

// Drive API to create a folder
async function createDriveFolder(token: string, name: string, parentId: string): Promise<string> {
  // First, get the driveId of the parent folder to assure we can create inside a Shared Drive
  let driveId = null;
  try {
    const parentRes = await fetch(`https://www.googleapis.com/drive/v3/files/${parentId}?fields=driveId&supportsAllDrives=true`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (parentRes.ok) {
      const parentData = await parentRes.json();
      driveId = parentData.driveId;
    }
  } catch (e) {
    console.error("Could not fetch parent driveId:", e);
  }

  const metadata: any = {
    name: name,
    mimeType: "application/vnd.google-apps.folder",
    parents: [parentId]
  }

  // If we found a driveId (indicating it's in a Shared Drive), we must include it
  // and set some other fields depending on the Drive API version, though parents usually suffices 
  // along with supportsAllDrives=true. We'll explicitly pass it if found.
  if (driveId) {
    metadata.driveId = driveId;
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&includeItemsFromAllDrives=true", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata)
  })

  if (!response.ok) {
    throw new Error(`Failed to create Google Drive folder: ${await response.text()}`)
  }

  const data = await response.json()
  return data.id
}
