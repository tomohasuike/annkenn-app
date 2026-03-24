import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    let folderId = formData.get('folderId') as string
    
    // Default fallback to the global root directory provided by the user
    if (!folderId) {
      folderId = "19zRhuDfv--CQNBDtWo6b01IFFDIKNgTd"
    }

    if (!file) {
      return new Response(JSON.stringify({ error: "No file uploaded" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // 1. Load Config
    const googleServiceAccountEmail = Deno.env.get('GOOGLE_SA_EMAIL')
    const googlePrivateKeyRaw = Deno.env.get('GOOGLE_SA_PRIVATE_KEY') || ''
    const googlePrivateKey = googlePrivateKeyRaw.replace(/\\n/g, '\n')

    if (!googleServiceAccountEmail || !googlePrivateKey) {
      return new Response(JSON.stringify({ error: "Missing Google Service Account config" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } })
    }

    // 2. Auth token
    const token = await getGoogleOAuthToken(googleServiceAccountEmail, googlePrivateKey)

    // 3. Upload File via Multipart
    const metadata = {
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      parents: [folderId]
    }

    const driveForm = new FormData()
    driveForm.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }))
    driveForm.append('file', file)

    const uploadRes = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`
      },
      body: driveForm
    })

    if (!uploadRes.ok) {
      const errText = await uploadRes.text()
      console.error("Upload Error:", errText)
      throw new Error(`Drive Upload Failed: ${uploadRes.status} ${errText}`)
    }

    const uploadedData = await uploadRes.json()
    const newFileId = uploadedData.id

    // 4. Set Permission to "anyone with link can view" (role: reader, type: anyone)
    const permRes = await fetch(`https://www.googleapis.com/drive/v3/files/${newFileId}/permissions?supportsAllDrives=true`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone"
      })
    })

    if (!permRes.ok) {
        console.error("Failed to set permission", await permRes.text())
        // Continue anyway, maybe it inherited permissions. We'll still return the file id.
    }

    // 5. Fetch File Metadata to get thumbnailLink and webViewLink
    const getRes = await fetch(`https://www.googleapis.com/drive/v3/files/${newFileId}?fields=id,webViewLink,webContentLink,thumbnailLink&supportsAllDrives=true`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    })

    if (!getRes.ok) {
      throw new Error(`Failed to retrieve file metadata after upload: ${await getRes.text()}`)
    }

    const finalDetails = await getRes.json()

    return new Response(JSON.stringify({
      success: true,
      fileId: finalDetails.id,
      webViewLink: finalDetails.webViewLink,
      webContentLink: finalDetails.webContentLink,
      thumbnailLink: finalDetails.thumbnailLink
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error in upload-drive-file:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    })
  }
})

// Create a Google OAuth Token
async function getGoogleOAuthToken(email: string, privateKey: string): Promise<string> {
  const { SignJWT, importPKCS8 } = await import("https://deno.land/x/jose@v4.14.4/index.ts");
  
  const privateKeyObj = await importPKCS8(privateKey, "RS256");
  const jwt = await new SignJWT({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive", // Scope for drive
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
