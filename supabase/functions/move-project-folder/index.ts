import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v4.14.4/index.ts"

const PARENT_FOLDERS: Record<string, { active: string, completed: string }> = {
  "一般": { active: "0AEEgKEmqEoodUk9PVA", completed: "1CsftKlRsu1dIYgMW3fHBoGoEdS1mRwvq" },
  "役所": { active: "0AEEgKEmqEoodUk9PVA", completed: "1CsftKlRsu1dIYgMW3fHBoGoEdS1mRwvq" },
  "川北": { active: "11-se3sjX78JlzYo_tShSGdEAaZkY1JGa", completed: "1G82W7jQymLIYXOYXsvnqMfUYBNSPnZoa" },
  "BPE":  { active: "1kcn5ZafuLs45GBWu51073nsMF436Cmgc", completed: "12D97lObfGL-deXPRumoPnKLFyumfhqOV" }
}

serve(async (req: Request) => {
  try {
    const payload = await req.json()
    // This function expects to be triggered by a Database Webhook on UPDATE
    const record = payload.record
    const old_record = payload.old_record

    // If this is not an update or no folder_url exists, skip
    if (!record || !old_record || !record.folder_url) {
      return new Response(JSON.stringify({ message: "Not a valid update payload or no folder exists" }), { status: 200 })
    }

    // Check if status changed
    const statusChanged = record.status_flag !== old_record.status_flag
    if (!statusChanged) {
      return new Response(JSON.stringify({ message: "Status did not change, ignore" }), { status: 200 })
    }

    // Determine target state
    const category = record.category || "一般"
    const isCompleted = record.status_flag === "完工"
    const wasCompleted = old_record.status_flag === "完工"
    
    // Check if we need to move (either moving to completed, or moving back to active)
    if (!isCompleted && !wasCompleted) {
       // Moving from active state to another active state (e.g. 着工前 <-> 着工中)
       return new Response(JSON.stringify({ message: "Transition between active states, no move needed" }), { status: 200 })
    }

    // カテゴリが未マップの場合は「一般」にフォールバック（例: null, "電気" など）
    const folderMapping = PARENT_FOLDERS[category] ?? PARENT_FOLDERS["一般"]

    const newParentId = isCompleted ? folderMapping.completed : folderMapping.active

    // Extract folder ID from URL
    const urlMatches = record.folder_url.match(/folders\/([-a-zA-Z0-9_]+)/)
    const folderId = urlMatches ? urlMatches[1] : null

    if (!folderId) {
      return new Response(JSON.stringify({ error: "Could not parse folder ID from URL" }), { status: 400 })
    }

    // Proceed to move in Google Drive
    const googleServiceAccountEmail = Deno.env.get('GOOGLE_SA_EMAIL')
    const googlePrivateKey = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') || '').replace(/\\n/g, '\n')
    
    if (!googleServiceAccountEmail || !googlePrivateKey) {
      return new Response(JSON.stringify({ error: "Missing Google service account credentials" }), { status: 500 })
    }

    const token = await getGoogleOAuthToken(googleServiceAccountEmail, googlePrivateKey)

    // 1. Get current parents
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?fields=parents&supportsAllDrives=true`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}` }
    })
    
    if (!fileRes.ok) {
        throw new Error(`Failed to get folder info: ${await fileRes.text()}`)
    }
    const fileData = await fileRes.json()
    const previousParents = fileData.parents ? fileData.parents.join(',') : ''

    // 2. Move to new parent
    if (previousParents !== newParentId) {
      const moveUrl = `https://www.googleapis.com/drive/v3/files/${folderId}?addParents=${newParentId}&removeParents=${previousParents}&supportsAllDrives=true`
      const moveRes = await fetch(moveUrl, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${token}` }
      })
      
      if (!moveRes.ok) {
          throw new Error(`Failed to move folder: ${await moveRes.text()}`)
      }
    }

    return new Response(JSON.stringify({ success: true, message: `Moved folder to ${isCompleted ? 'completed' : 'active'} directory` }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    })

  } catch (error: any) {
    console.error("Error moving project folder:", error)
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
