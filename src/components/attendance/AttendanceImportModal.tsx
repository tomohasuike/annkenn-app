import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { X, Upload, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

interface Worker {
  id: string;
  name: string;
}

interface AttendanceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  workers: Worker[];
  onSuccess: () => void;
}

export function AttendanceImportModal({ isOpen, onClose, workers, onSuccess }: AttendanceImportModalProps) {
  const [text, setText] = useState('');
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [targetWorkerId, setTargetWorkerId] = useState<string>('');
  const [targetWorkerName, setTargetWorkerName] = useState<string>('');
  const [isParsing, setIsParsing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!isOpen) return null;

  const parseTSV = (text: string) => {
    const rows = [];
    let currentRow = [];
    let currentCell = '';
    let inQuotes = false;
    
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (inQuotes) {
        if (char === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            currentCell += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === '\t') {
          currentRow.push(currentCell.trim());
          currentCell = '';
        } else if (char === '\n' || char === '\r') {
          if (char === '\r' && text[i + 1] === '\n') i++;
          currentRow.push(currentCell.trim());
          rows.push(currentRow);
          currentRow = [];
          currentCell = '';
        } else {
          currentCell += char;
        }
      }
    }
    if (currentRow.length > 0 || currentCell) {
      currentRow.push(currentCell.trim());
      rows.push(currentRow);
    }
    return rows;
  };

  const handleParse = () => {
    setIsParsing(true);
    try {
      const rows = parseTSV(text);
      if (rows.length < 5) {
         toast.error('データが少なすぎます。正しくコピーできているか確認してください。');
         setIsParsing(false);
         return;
      }

      // 1. Try to find the name in the first 5 rows
      let detectedName = '';
      for (let i = 0; i < 5; i++) {
         const rowStr = rows[i]?.join(' ') || '';
         const matchedWorker = workers.find(w => {
           // fuzzy match by removing spaces
           const nameNoSpace = w.name.replace(/\s+/g, '');
           const rowNoSpace = rowStr.replace(/\s+/g, '');
           return rowNoSpace.includes(nameNoSpace);
         });
         if (matchedWorker) {
           detectedName = matchedWorker.name;
           setTargetWorkerId(matchedWorker.id);
           setTargetWorkerName(matchedWorker.name);
           break;
         }
      }

      if (!detectedName) {
         toast.error('作業員名がデータから自動判定できませんでした。スプレッドシートの「氏名」が含まれているか確認してください。');
      }

      // 2. Parse Dates (assuming default year = current or explicit)
      let currentMonth = new Date().getMonth() + 1; // fallback
      const year = 2026; // R8 is 2026
      
      // Try to parse month from header
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
         const joined = rows[i].join('');
         const mMatch = joined.match(/([0-9０-９]+)月分/);
         if (mMatch) {
            currentMonth = parseInt(mMatch[1]);
            break;
         }
      }
      
      const pData = [];
      let lastDay = -1;

      for (const row of rows) {
        if (row.length < 10) continue;
        let dowIdx = row.findIndex(cell => ['月', '火', '水', '木', '金', '土', '日'].includes(cell.trim()));
        if (dowIdx === -1) continue;
        
        const dStr = row[dowIdx - 1]?.trim();
        if (!dStr || isNaN(parseInt(dStr))) continue;
        
        const day = parseInt(dStr);
        const maybeMonth = row[dowIdx - 3]?.trim();
        if (maybeMonth && !isNaN(parseInt(maybeMonth))) {
           currentMonth = parseInt(maybeMonth);
        } else if (lastDay > 20 && day < 10) {
           // Rollover: e.g. 31 -> 1
           currentMonth++;
           if (currentMonth > 12) currentMonth = 1;
        }
        lastDay = day;
        
        // After the Day of Week, all subsequent cells up to the project name contain the times.
        // We join them and extract all numeric groups. This gracefully handles variable columns (e.g. '7', ':', '50' vs '7:50' vs '6: : 20').
        const timeStr = row.slice(dowIdx + 1, dowIdx + 15).join(' ');
        const digits = timeStr.match(/[0-9０-９]+/g);
        
        if (!digits || digits.length < 4) continue; // Not enough numbers to form HH:MM HH:MM
        
        const toNum = (str: string) => parseInt(str.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0)));
        
        const inH = toNum(digits[0]);
        const inM = toNum(digits[1]);
        const outH = toNum(digits[2]);
        const outM = toNum(digits[3]);
        
        let siteInH = NaN, siteInM = NaN, siteOutH = NaN, siteOutM = NaN;
        if (digits.length >= 8) {
           siteInH = toNum(digits[4]);
           siteInM = toNum(digits[5]);
           siteOutH = toNum(digits[6]);
           siteOutM = toNum(digits[7]);
        }
          
        if (!isNaN(inH) && !isNaN(inM) && !isNaN(outH) && !isNaN(outM)) {
            const dateStr = `${year}-${currentMonth.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
            
            let role = '一般';
            const rowStr = row.join('');
            if (rowStr.includes('職長')) role = '職長';
            if (rowStr.includes('現場代理人')) role = '現場代理人';

            let travelTime = 0;
            let siteDecls: any[] = [];
            if (!isNaN(siteInH) && !isNaN(siteInM) && !isNaN(siteOutH) && !isNaN(siteOutM)) {
               const morningCommute = (siteInH * 60 + siteInM) - (inH * 60 + inM);
               const eveningCommute = (outH * 60 + outM) - (siteOutH * 60 + siteOutM);
               travelTime = (morningCommute > 0 ? morningCommute : 0) + (eveningCommute > 0 ? eveningCommute : 0);
 
               const sTime = `${siteInH.toString().padStart(2, '0')}:${siteInM.toString().padStart(2, '0')}`;
               const eTime = `${siteOutH.toString().padStart(2, '0')}:${siteOutM.toString().padStart(2, '0')}`;
               siteDecls = [{
                  project_id: 'imported',
                  project_name: '日報なし',
                  start_time: sTime,
                  end_time: eTime,
                  role: role
               }];
            }
            
            pData.push({
              target_date: dateStr,
              clock_in_time: new Date(`${dateStr}T${inH.toString().padStart(2, '0')}:${inM.toString().padStart(2, '0')}:00+09:00`).toISOString(),
              clock_out_time: new Date(`${dateStr}T${outH.toString().padStart(2, '0')}:${outM.toString().padStart(2, '0')}:00+09:00`).toISOString(),
              role,
              travel_time_minutes: travelTime,
              prep_time_minutes: 0,
              is_locked: false,
              site_declarations: siteDecls
            });
          }
      }

      setParsedData(pData);
      if (pData.length === 0) {
        // Collect debug info from the first 5 non-empty rows
        const debugDump = rows.map((r, i) => `行${i + 1}(長さ${r.length}): [${r.join(', ')}]`).slice(0, 10).join('\n');
        setText(`【デバッグ情報: 読み取り失敗原因の解析】\n${debugDump}\n\n===上書きした部分の下にペーストしたテキストがあります===\n${text}`);
        toast.error('出退勤の時間が読み取れませんでした。テキストエリアにデバッグ情報を表示しました。');
      } else {
        toast.success(`${pData.length}日分のデータを読み込みました`);
      }
    } catch (err: any) {
      toast.error('解析に失敗しました: ' + err.message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = async () => {
    if (!targetWorkerId) {
      toast.error('作業員が選択されていません');
      return;
    }
    setIsSaving(true);
    try {
      // Setup payload
      const payload = parsedData.map(d => ({
        ...d,
        worker_id: targetWorkerId
      }));

      // Find min and max dates to delete existing records for this worker
      const dates = payload.map(p => p.target_date).sort();
      const minDate = dates[0];
      const maxDate = dates[dates.length - 1];

      await supabase.from('daily_attendance')
        .delete()
        .eq('worker_id', targetWorkerId)
        .gte('target_date', minDate)
        .lte('target_date', maxDate);

      // Insert new
      const { error } = await supabase.from('daily_attendance').insert(payload);
      if (error) throw error;

      toast.success(`${targetWorkerName} のデータを保存しました！`);
      setText('');
      setParsedData([]);
      onSuccess();
      onClose();
    } catch(e: any) {
        toast.error('保存エラー: ' + e.message);
    } finally {
        setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Upload className="w-5 h-5 text-primary" />
            スプレッドシートから一括貼り付け
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-4">
          <div className="bg-blue-50 text-blue-800 p-4 rounded-lg text-sm">
            <p className="font-bold mb-1">【使い方】</p>
            <p>1. 該当する作業員のスプレッドシート（全期間）をマウスでぐっと全選択してください。</p>
            <p>2. 「コピー（Ctrl+C）」して、下のテキストエリアに「貼り付け（Ctrl+V）」してください。</p>
            <p>3. AIが氏名や日付、出退勤・移動時間を自動で読み取ります。</p>
          </div>

          <textarea
            className="w-full h-40 p-3 border rounded-lg font-mono text-sm resize-none focus:ring-2 focus:ring-primary/50 outline-none whitespace-pre"
            placeholder="ここにスプレッドシートからコピーしたテキストを貼り付けてください..."
            value={text}
            onChange={e => setText(e.target.value)}
          />

          <div className="flex justify-center">
            <button
              onClick={handleParse}
              disabled={!text || isParsing}
              className="px-6 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-700 disabled:opacity-50 font-medium"
            >
              データを読み取る
            </button>
          </div>

          {parsedData.length > 0 && (
            <div className="mt-4 border rounded-lg p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-lg text-emerald-800 flex items-center gap-2">
                     <CheckCircle className="w-5 h-5" />
                     {targetWorkerName ? `${targetWorkerName} (${parsedData.length}日分)` : '作業員を判定できませんでした'}
                  </h3>
                  <p className="text-sm text-slate-500 mt-1">以下の通りに取り込みます。問題なければ保存を押してください。</p>
                </div>
                {!targetWorkerName && (
                  <select 
                    className="border p-2 rounded"
                    value={targetWorkerId}
                    onChange={(e) => {
                       setTargetWorkerId(e.target.value);
                       const w = workers.find(w => w.id === e.target.value);
                       if (w) setTargetWorkerName(w.name);
                    }}
                  >
                    <option value="">作業員を手動で選択...</option>
                    {workers.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                )}
              </div>
              
              <div className="bg-slate-50 rounded border overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-100 text-slate-600">
                    <tr>
                      <th className="px-3 py-2 font-medium">日付</th>
                      <th className="px-3 py-2 font-medium">出退勤</th>
                      <th className="px-3 py-2 font-medium">移動</th>
                      <th className="px-3 py-2 font-medium">役割</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 5).map((d, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-3 py-2">{d.target_date}</td>
                        <td className="px-3 py-2">
                           {d.clock_in_time ? new Date(d.clock_in_time).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'}) : ''}
                           {' 〜 '}
                           {d.clock_out_time ? new Date(d.clock_out_time).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'}) : ''}
                        </td>
                        <td className="px-3 py-2">{d.travel_time_minutes}分</td>
                        <td className="px-3 py-2">{d.role}</td>
                      </tr>
                    ))}
                    {parsedData.length > 5 && (
                      <tr className="border-t bg-slate-50/50">
                        <td colSpan={4} className="px-3 py-2 text-center text-slate-400">
                          ...他 {parsedData.length - 5}件
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t bg-slate-50 flex justify-end gap-3 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-600 hover:bg-slate-200 rounded-lg font-medium transition-colors"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={parsedData.length === 0 || !targetWorkerId || isSaving}
            className="px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isSaving ? '保存中...' : 'データベースに保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
