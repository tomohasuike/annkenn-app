from dotenv import load_dotenv
import os
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build

load_dotenv('supabase/functions/.env', override=True)
load_dotenv('.env.local')
pk = os.environ.get('GOOGLE_SA_PRIVATE_KEY', '').strip('"').strip('\'').replace('\\n', '\n')
email = os.environ.get('GOOGLE_SA_EMAIL')

try:
    creds = Credentials.from_service_account_info({
        'client_email': email,
        'private_key': pk,
        'token_uri': 'https://oauth2.googleapis.com/token'
    }, scopes=['https://www.googleapis.com/auth/drive'])
    drive_service = build('drive', 'v3', credentials=creds)
    fid = os.environ.get('VITE_CATALOG_IMAGES_FOLDER_ID')
    print('Checking folder id:', fid)
    res = drive_service.files().get(fileId=fid, fields='id, name', supportsAllDrives=True).execute()
    print('Found:', res)
except Exception as e:
    print(f'Error: {e}')
