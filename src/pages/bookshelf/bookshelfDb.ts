const DB_NAME = "hitec_bookshelf_db";
const STORE_NAME = "pdf_files";
const DB_VERSION = 1;

/**
 * IndexedDB データベースを開いて接続します
 */
export function openBookshelfDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "fileId" });
      }
    };
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 指定した書籍（PDF）の Blob データをローカル（IndexedDB）に保存します
 */
export async function saveBookBlob(fileId: string, blob: Blob): Promise<void> {
  const db = await openBookshelfDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.put({ 
      fileId, 
      blob, 
      savedAt: new Date().toISOString() 
    });
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 指定した書籍（PDF）の Blob データをローカル（IndexedDB）からロードします
 */
export async function getBookBlob(fileId: string): Promise<Blob | null> {
  const db = await openBookshelfDB();
  return new Promise<Blob | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.get(fileId);
    
    request.onsuccess = () => resolve(request.result?.blob || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * 指定した書籍（PDF）の実体データをローカル（IndexedDB）から安全に削除します
 */
export async function deleteBookBlob(fileId: string): Promise<void> {
  const db = await openBookshelfDB();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.delete(fileId);
    
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * 現在、ローカル（IndexedDB）に保存されている全ての書籍（PDF）の Google Drive ID 配列を取得します
 */
export async function getSavedBookIds(): Promise<string[]> {
  const db = await openBookshelfDB();
  return new Promise<string[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    
    const request = store.getAllKeys();
    
    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  });
}
