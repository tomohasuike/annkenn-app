import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { SignJWT, importPKCS8 } from "https://deno.land/x/jose@v4.14.4/index.ts"

serve(async (req: Request) => {
  try {
    const email = Deno.env.get('GOOGLE_SA_EMAIL')!
    const pk = Deno.env.get('GOOGLE_SA_PRIVATE_KEY')!.replace(/\\n/g, '\n')

    const privateKeyObj = await importPKCS8(pk, "RS256");
    const jwt = await new SignJWT({
      iss: email, scope: "https://www.googleapis.com/auth/drive", aud: "https://oauth2.googleapis.com/token",
    }).setProtectedHeader({ alg: "RS256", typ: "JWT" }).setIssuedAt().setExpirationTime("1h").sign(privateKeyObj);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
    });
    
    if (!tokenRes.ok) {
       return new Response("Auth Error: " + await tokenRes.text(), { status: 500 })
    }
    
    const { access_token } = await tokenRes.json();

    // List all folders in the Shared Drive
    const sharedDriveId = "0AEEgKEmqEoodUk9PVA";
    const query = encodeURIComponent(`'${sharedDriveId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`);
    const fileRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&corpora=drive&driveId=${sharedDriveId}&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=files(id,name)`, {
      headers: { "Authorization": `Bearer ${access_token}` }
    });
    
    const fileBody = await fileRes.text();

    return new Response(JSON.stringify({
      status: fileRes.status,
      response: JSON.parse(fileBody)
    }, null, 2), { status: 200, headers: { 'Content-Type': 'application/json'} });

  } catch (err: any) {
    return new Response(err.message, { status: 500 })
  }
})
