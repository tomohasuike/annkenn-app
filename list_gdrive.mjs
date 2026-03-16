import fs from 'fs';
import { google } from 'googleapis';

const OAUTH_PATH = '/Users/hasuiketomoo/Downloads/client_secret_553571160705-i9pqn1gjv1sh37vpeeknk51v1rp2bdm0.apps.googleusercontent.com.json';
const CREDENTIALS_PATH = '/Users/hasuiketomoo/.gdrive-server-credentials.json';

// Load client secrets from a local file.
let credentials;
try {
  credentials = JSON.parse(fs.readFileSync(OAUTH_PATH));
} catch (err) {
  console.log('Error loading client secret file:', err);
}

const {client_secret, client_id, redirect_uris} = credentials.installed || credentials.web;
const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

// Load existing token
try {
  const token = fs.readFileSync(CREDENTIALS_PATH);
  oAuth2Client.setCredentials(JSON.parse(token));
} catch (err) {
  console.log('Error loading token:', err);
}

const drive = google.drive({version: 'v3', auth: oAuth2Client});

async function listFiles(folderId, label) {
    console.log(`\n--- ${label} (${folderId}) ---`);
    try {
        const res = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'nextPageToken, files(id, name, mimeType, webViewLink, webContentLink)',
            pageSize: 10
        });
        const files = res.data.files;
        if (files.length) {
            console.log(`Found ${files.length} files (showing up to 10):`);
            files.forEach((file) => {
                console.log(`${file.name} (${file.id}) - ${file.mimeType}`);
            });
        } else {
            console.log('No files found.');
        }
    } catch (err) {
        console.error('The API returned an error:', err.message);
    }
}

async function main() {
    await listFiles('1rnb2wmGtAzvs7TkPXrOe_EgNxGJKAhc_', '工事写真');
    await listFiles('170wXaJt_ifcTxD4QH1A2dU-65PrT88zn', '使用材料 写真');
    await listFiles('11GCa4CSJGiSovGJvjtTPDVzVX4I31SDZ', '使用材料 ファイルや写真');
}

main();
