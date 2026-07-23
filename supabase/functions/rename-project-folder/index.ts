import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v4.14.4/index.ts"

serve(async (req: Request) => {
  try {
    const payload = await req.json()
    const record = payload.record
    const old_record = payload.old_record

    if (!record || !old_record || !record.folder_url) {
      return new Response(JSON.stringify({ message: "No folder URL or invalid payload" }), { status: 200 })
    }

    // 件名名・番号・現場名・顧客名が変わった時だけリネーム
    const nameChanged = record.project_name !== old_record.project_name
    const numberChanged = record.project_number !== old_record.project_number
    const siteChanged = record.site_name !== old_record.site_name
    const clientChanged = record.client_name !== old_record.client_name
    if (!nameChanged && !numberChanged && !siteChanged && !clientChanged) {
      return new Response(JSON.stringify({ message: "Name did not change, skip" }), { status: 200 })
    }

    // フォルダIDをURLから抽出
    const urlMatch = record.folder_url.match(/folders\/([-a-zA-Z0-9_]+)/)
    const folderId = urlMatch ? urlMatch[1] : null
    if (!folderId) {
      return new Response(JSON.stringify({ error: "Could not parse folder ID from URL" }), { status: 400 })
    }

    // 新しいフォルダ名（create-project-folderと同じフォーマット）
    const suffix = record.site_name || record.client_name || ""
    const newName = suffix
      ? `${record.project_number}${record.project_name}-${suffix}`
      : `${record.project_number}${record.project_name}`

    const googleServiceAccountEmail = Deno.env.get('GOOGLE_SA_EMAIL')
    const googlePrivateKey = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') || '').replace(/\\n/g, '\n')

    if (!googleServiceAccountEmail || !googlePrivateKey) {
      return new Response(JSON.stringify({ error: "Missing Google service account credentials" }), { status: 500 })
    }

    const token = await getGoogleOAuthToken(googleServiceAccountEmail, googlePrivateKey)

    const renameRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${folderId}?supportsAllDrives=true`,
      {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: newName }),
      }
    )

    if (!renameRes.ok) {
      throw new Error(`Failed to rename folder: ${await renameRes.text()}`)
    }

    return new Response(JSON.stringify({ success: true, newName }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error renaming project folder:", error)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    })
  }
})

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
