import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v4.14.4/index.ts"

const FOLDER_NISSHI = "1KstQFkbu18x0Z8vnaZgW02drHp2ZFOhu"      // 日報写真（現場写真）
const FOLDER_MATERIAL = "1-dPi7oHiY73nrtg0dN-HR7OuJHDOTrWJ"   // 材料・資料（材料写真・添付資料）

function extractFileId(url: string): string | null {
  const lh3 = url.match(/lh3\.googleusercontent\.com\/d\/([\w-]+)/)
  if (lh3) return lh3[1]
  const drive = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/)
  if (drive) return drive[1]
  return null
}

function parseUrls(raw: string | null): string[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [raw]
  } catch {
    return raw.includes('http') ? [raw] : []
  }
}

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

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }).toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Google Auth Error: ${JSON.stringify(data)}`)
  return data.access_token
}

async function moveFile(token: string, fileId: string, targetFolderId: string): Promise<boolean> {
  // Get current parents
  const infoRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (!infoRes.ok) {
    console.warn(`Could not get file info for ${fileId}: ${infoRes.status}`)
    return false
  }
  const info = await infoRes.json()
  const currentParents: string[] = info.parents || []

  if (currentParents.includes(targetFolderId)) {
    console.log(`Already in target folder: ${fileId}`)
    return true
  }

  const removeParents = currentParents.join(',')
  const moveRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetFolderId}&removeParents=${removeParents}&supportsAllDrives=true`,
    { method: "PATCH", headers: { Authorization: `Bearer ${token}` } }
  )
  if (!moveRes.ok) {
    console.warn(`Failed to move ${fileId}: ${await moveRes.text()}`)
    return false
  }
  return true
}

serve(async () => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const email = Deno.env.get('GOOGLE_SA_EMAIL')!
    const rawKey = (Deno.env.get('GOOGLE_SA_PRIVATE_KEY') || '').replace(/\\n/g, '\n')

    const supabase = createClient(supabaseUrl, serviceKey)
    const token = await getGoogleOAuthToken(email, rawKey)

    let moved = 0, skipped = 0, failed = 0

    // 1. 日報現場写真
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('id, site_photos')
      .not('site_photos', 'is', null)
      .neq('site_photos', '')
      .neq('site_photos', '[]')

    for (const r of reports || []) {
      for (const url of parseUrls(r.site_photos)) {
        const fileId = extractFileId(url)
        if (!fileId) { skipped++; continue }
        const ok = await moveFile(token, fileId, FOLDER_NISSHI)
        ok ? moved++ : failed++
      }
    }

    // 2. 材料写真・資料
    const { data: materials } = await supabase
      .from('report_materials')
      .select('id, photo, documentation')

    for (const m of materials || []) {
      for (const url of [...parseUrls(m.photo), ...parseUrls(m.documentation)]) {
        const fileId = extractFileId(url)
        if (!fileId) { skipped++; continue }
        const ok = await moveFile(token, fileId, FOLDER_MATERIAL)
        ok ? moved++ : failed++
      }
    }

    return new Response(JSON.stringify({ success: true, moved, skipped, failed }), {
      headers: { "Content-Type": "application/json" },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { "Content-Type": "application/json" },
    })
  }
})
