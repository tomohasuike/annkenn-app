/** lh3形式のURLをdrive.google.com/file/d/...の正規URLに変換 */
export function fixDriveDocUrl(url: string): string {
  if (!url) return '';
  if (url.includes('lh3.googleusercontent.com/d/')) {
    const match = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (match && match[1]) return `https://drive.google.com/file/d/${match[1]}/view?usp=drivesdk`;
  }
  return url;
}

/** <img>タグ用に任意のGoogle Drive URLをlh3直接表示形式に変換 */
export function getDriveImageUrl(url: string): string {
  if (!url) return '';
  if (url.includes('lh3.googleusercontent.com')) return url;
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (driveMatch && driveMatch[1]) return `https://lh3.googleusercontent.com/d/${driveMatch[1]}`;
  const openMatch = url.match(/[?&]id=([a-zA-Z0-9-_]+)/);
  if (openMatch && openMatch[1]) return `https://lh3.googleusercontent.com/d/${openMatch[1]}`;
  return url;
}

/** Google DriveフォルダURLからフォルダIDを抽出 */
export function getFolderIdFromUrl(url?: string): string | null {
  if (!url) return null;
  const match = url.match(/folders\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) return match[1];
  if (/^[a-zA-Z0-9-_]{25,50}$/.test(url)) return url;
  return null;
}
