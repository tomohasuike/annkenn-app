import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function getGoogleOAuthToken(email, privateKey) {
  const { SignJWT, importPKCS8 } = await import('jose');
  const privateKeyObj = await importPKCS8(privateKey, "RS256");
  const jwt = await new SignJWT({
    iss: email,
    scope: "https://www.googleapis.com/auth/drive.readonly",
    aud: "https://oauth2.googleapis.com/token",
  })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(privateKeyObj);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }).toString(),
  });
  const data = await response.json();
  return data.access_token;
}

async function listFiles() {
  const email = process.env.GOOGLE_SA_EMAIL;
  const key = process.env.GOOGLE_SA_PRIVATE_KEY.replace(/\\n/g, '\n');
  const token = await getGoogleOAuthToken(email, key);

  const folderId = "19zRhuDfv--CQNBDtWo6b01IFFDIKNgTd";
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q='${folderId}' in parents&fields=files(id,name,createdTime,thumbnailLink)&orderBy=createdTime desc`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  console.log("Found files:", data.files.length);
  if (data.files.length > 0) {
      console.log(data.files[0]);
  }
}
listFiles();
