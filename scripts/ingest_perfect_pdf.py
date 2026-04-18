import os
import sys
import json
import uuid
import fitz # PyMuPDF
from io import BytesIO
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from supabase import create_client, Client
from dotenv import load_dotenv

if len(sys.argv) < 4:
    print("Usage: python3 ingest_perfect_pdf.py <pdf_path> <manufacturer> <catalog_name>")
    sys.exit(1)

SOURCE_PDF_PATH = sys.argv[1]
MANUFACTURER = sys.argv[2]
CATALOG_NAME = sys.argv[3]

# Load Env
load_dotenv(".env.local")

if os.path.exists("supabase/functions/.env"):
    load_dotenv("supabase/functions/.env", override=True)

SUPABASE_URL = os.environ.get("VITE_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("VITE_SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

GOOGLE_SA_EMAIL = os.environ.get("GOOGLE_SA_EMAIL")
GOOGLE_SA_PRIVATE_KEY = os.environ.get("GOOGLE_SA_PRIVATE_KEY", "").strip('"').strip("'").replace("\\n", "\n")
IMAGES_FOLDER_ID = os.environ.get("VITE_CATALOG_IMAGES_FOLDER_ID")
PARENT_FOLDER_ID = '17DoPV9o8mLQirXFLKsJ3ojHm6W_lrQUf'

creds = Credentials.from_service_account_info({
    "client_email": GOOGLE_SA_EMAIL,
    "private_key": GOOGLE_SA_PRIVATE_KEY,
    "token_uri": "https://oauth2.googleapis.com/token"
}, scopes=["https://www.googleapis.com/auth/drive"])

drive_service = build('drive', 'v3', credentials=creds)

catalog_folder_id = IMAGES_FOLDER_ID

PROGRESS_FILE = f"progress_{CATALOG_NAME}.json"
progress = {}
if os.path.exists(PROGRESS_FILE):
    with open(PROGRESS_FILE, 'r') as f:
        progress = json.load(f)

print(f"Opening PDF: {SOURCE_PDF_PATH}")
doc = fitz.open(SOURCE_PDF_PATH)
total_pages = len(doc)
print(f"Total Pages: {total_pages}")

import time
def upload_to_drive(file_bytes, name, mime_type, folder_id, retries=5):
    for attempt in range(retries):
        try:
            media = MediaIoBaseUpload(BytesIO(file_bytes), mimetype=mime_type, resumable=True)
            body = {'name': name, 'parents': [folder_id]}
            f = drive_service.files().create(body=body, media_body=media, fields='id', supportsAllDrives=True).execute()
            file_id = f.get('id')
            if mime_type == 'image/jpeg':
                drive_service.permissions().create(fileId=file_id, body={'role': 'reader', 'type': 'anyone'}, supportsAllDrives=True).execute()
            return file_id
        except Exception as e:
            if attempt < retries - 1:
                wait_time = 2 ** attempt
                print(f"Rate limit hit, retrying in {wait_time}s... Error: {e}")
                time.sleep(wait_time)
            else:
                raise e

for page_num in range(1, total_pages + 1):
    if str(page_num) in progress:
        print(f"⏭️ Page {page_num} は処理済みのためスキップします")
        continue
    
    print(f"[{page_num}/{total_pages}] プロセス中...")
    page_index = page_num - 1
    
    # 1. Rasterize to JPEG
    page = doc.load_page(page_index)
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    jpg_bytes = pix.tobytes("jpeg")
    
    # 2. Extract strictly to PDF using fitz
    out_doc = fitz.open()
    out_doc.insert_pdf(doc, from_page=page_index, to_page=page_index)
    pdf_bytes = out_doc.write()
    out_doc.close()
    
    pdf_name = f"{CATALOG_NAME}_{page_num}.pdf"
    
    pdf_id = upload_to_drive(pdf_bytes, pdf_name, 'application/pdf', catalog_folder_id)
    
    pg_id = str(uuid.uuid4())
    jpg_name = f"catalog_{pg_id[:8]}.jpg"
    jpg_id = upload_to_drive(jpg_bytes, jpg_name, 'image/jpeg', IMAGES_FOLDER_ID)
    
    img_url = f"https://drive.google.com/uc?id={jpg_id}&export=view"
    
    # Check if exists to update, or insert new
    res = supabase.table('catalog_pages').select('id').eq('manufacturer', MANUFACTURER).eq('catalog_name', CATALOG_NAME).eq('page_number', page_num).execute()
    
    data = {
        'manufacturer': MANUFACTURER,
        'catalog_name': CATALOG_NAME,
        'page_number': page_num,
        'drive_file_id': pdf_id,
        'page_image_url': img_url
    }
    
    try:
        if len(res.data) > 0:
            supabase.table('catalog_pages').update(data).eq('id', res.data[0]['id']).execute()
        else:
            supabase.table('catalog_pages').insert(data).execute()
    except Exception as e:
        print(f"Error inserting/updating DB: {e}")
        
    progress[str(page_num)] = {"pdf": pdf_id, "jpg": jpg_id}
    with open(PROGRESS_FILE, 'w') as f:
        json.dump(progress, f)
        
    print(f"  -> ✅ 完了: PDF={pdf_id}, JPG={jpg_id}")

print("🎉 すべて完了！")
