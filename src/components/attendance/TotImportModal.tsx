import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { X, Upload, FileBox, AlertCircle, CheckCircle2 } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  workers: any[];
  onComplete: () => void;
}

export default function TotImportModal({ isOpen, onClose, workers, onComplete }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const parseCsvLine = (text: string) => {
    const arr = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        inQuote = !inQuote;
      } else if (c === ',' && !inQuote) {
        arr.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    arr.push(cur);
    return arr.map(s => {
      let v = s.trim();
      if (v.startsWith('"') && v.endsWith('"')) {
        v = v.substring(1, v.length - 1);
      }
      return v;
    });
  };

  const processFile = async () => {
    if (!file) return;
    setIsProcessing(true);
    setLogs(['ファイルを読み込んでいます...']);

    try {
      const arrayBuffer = await file.arrayBuffer();
      // デコーダーでエンコーディングの自動判別（UTF-8の場合はエラーを出させてShift-JISにフォールバック）
      let decodedText = '';
      let detectedEncoding = 'Shift-JIS';
      try {
         decodedText = new TextDecoder('utf-8', { fatal: true }).decode(arrayBuffer);
         detectedEncoding = 'UTF-8';
      } catch (e) {
         decodedText = new TextDecoder('shift_jis').decode(arrayBuffer);
      }
      
      const lines = decodedText.split(/\r?\n/).filter(line => line.trim() !== '');

      const newLogs = [...logs, `ファイルの文字コードを ${detectedEncoding} として解析を開始します。`];
      setLogs(newLogs);

      if (lines.length < 2) {
         toast.error('データが入っていません');
         setIsProcessing(false);
         return;
      }

      const dataRows = lines;
      const upsertPayloads: Record<string, any> = {};
      let skippedRows = 0;
      let matchedCount = 0;

      let hasHeader = false;
      let dateIdx = -1, nameIdx = -1, codeIdx = -1, inIdx = -1, outIdx = -1;

      for (let i = 0; i < dataRows.length; i++) {
        const rowText = dataRows[i];
        if (rowText.trim() === '') continue;

        const columns = parseCsvLine(rowText);

        if (!hasHeader) {
           // ヘッダー行を探す
           for (let c = 0; c < columns.length; c++) {
               const header = columns[c].replace(/"/g, '').trim();
               if (header === '日時' || header === '日付' || header.includes('日')) dateIdx = c;
               if (header === '名前' || header === '氏名' || header.includes('名')) nameIdx = c;
               if (header === '従業員コード' || header.includes('コード')) codeIdx = c;
               if (header === '出勤時刻' || header === '出勤' || header.includes('出勤') || header.includes('出社')) inIdx = c;
               if (header === '退勤時刻' || header === '退勤' || header.includes('退勤') || header.includes('退社')) outIdx = c;
           }
           if (dateIdx !== -1 && nameIdx !== -1) {
               hasHeader = true;
               newLogs.push(`✅ 列構成を自動認識しました: 日付[${dateIdx}], 名前[${nameIdx}], コード[${codeIdx}], 出勤[${inIdx}], 退勤[${outIdx}]`);
           }
           // 今回の行はヘッダー行（または解析不能な冒頭行）としてスキップ
           continue; 
        }

        if (columns.length <= Math.max(dateIdx, nameIdx)) {
           skippedRows++;
           if (skippedRows === 1 && dataRows.length > 0) newLogs.push(`⚠️ 1行目の列数が足りません。検出列数: ${columns.length}`);
           continue;
        }

        const dateStrRaw = columns[dateIdx];
        const nameRaw = columns[nameIdx];
        const codeRaw = codeIdx !== -1 ? columns[codeIdx] : undefined;
        const inStrRaw = inIdx !== -1 ? columns[inIdx] : undefined;
        const outStrRaw = outIdx !== -1 ? columns[outIdx] : undefined;

        if (matchedCount === 0 && skippedRows === 0 && newLogs.length < 5) {
           newLogs.push(`🔍 最初のデータ: 日時="${dateStrRaw}", 名前="${nameRaw}", コード="${codeRaw}", 出勤="${inStrRaw}", 退勤="${outStrRaw}"`);
        }

        if (!dateStrRaw || !nameRaw) {
           skippedRows++;
           continue;
        }

        // "2026/01/26(月)" -> "2026-01-26"
        let targetDate = "";
        const dMatch = dateStrRaw.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
        
        if (dMatch) {
            targetDate = `${dMatch[1]}-${dMatch[2].padStart(2, '0')}-${dMatch[3].padStart(2, '0')}`;
        } else if (dateStrRaw.match(/^\d{4}-\d{2}-\d{2}(T|$)/)) {
            // Already YYYY-MM-DD
            targetDate = dateStrRaw.substring(0, 10);
        } else {
           if (skippedRows < 2) newLogs.push(`⚠️ 日付形式が読めません: "${dateStrRaw}"`);
           skippedRows++;
           continue;
        }

        const normalizeKanji = (str: string) => {
           return str.replace(/\s+/g, '')
                     .replace(/[齋齊斉]/g, '斎')
                     .replace(/[邊邉]/g, '辺')
                     .replace(/濱/g, '浜')
                     .replace(/髙/g, '高')
                     .replace(/﨑/g, '崎');
        };

        // 従業員検索: コード優先、なければ名前で部分一致（空白無視・異体字対応）
        const matchedWorker = workers.find(w => {
           if (w.employee_code_tot && codeRaw && w.employee_code_tot.toString() === codeRaw.toString()) return true;
           const wNameClean = normalizeKanji(w.name);
           const cNameClean = normalizeKanji(nameRaw);
           return wNameClean === cNameClean || wNameClean.includes(cNameClean) || cNameClean.includes(wNameClean);
        });

        if (!matchedWorker) {
           // Skip logging every single not-found row if there are too many, but for now we log it.
           if (skippedRows < 5) newLogs.push(`⚠️ 作業員がマスタに見つかりませんスキップ: [${nameRaw}] コード:[${codeRaw}]`);
           skippedRows++;
           continue;
        }

        // 時刻の抽出: "2026/01/26(月)06:45" の後ろ5文字 or 直接 06:45 の後ろ5文字
        let inTime = null;
        if (inStrRaw && inStrRaw.trim().length >= 4) {
             const mIn = inStrRaw.match(/(\d{1,2}):(\d{2})/);
             if (mIn) inTime = `${mIn[1].padStart(2, '0')}:${mIn[2]}`;
             else inTime = inStrRaw.slice(-5).trim();
        }

        let outTime = null;
        if (outStrRaw && outStrRaw.trim().length >= 4) {
             const mOut = outStrRaw.match(/(\d{1,2}):(\d{2})/);
             if (mOut) outTime = `${mOut[1].padStart(2, '0')}:${mOut[2]}`;
             else outTime = outStrRaw.slice(-5).trim();
        }
        
        const workerId = matchedWorker.id;
        const key = `${workerId}_${targetDate}`;

        matchedCount++;

        // Postgresの timestamp with time zone に保存するため、フル日時のISO形式に変換する
        const fullInTime = inTime ? `${targetDate}T${inTime}:00+09:00` : null;
        const fullOutTime = outTime ? `${targetDate}T${outTime}:00+09:00` : null;

        if (!upsertPayloads[key]) {
            upsertPayloads[key] = {
               worker_id: workerId,
               target_date: targetDate,
               worker_name_debug: matchedWorker.name,
               // DB保存用
               tot_clock_in_time: fullInTime,
               tot_clock_out_time: fullOutTime,
               // site_declarations用には "06:45" をそのまま渡す
               site_in_time: inTime,
               site_out_time: outTime,
               add_site_decl: !!(inTime || outTime)
            };
        } else {
            if (fullInTime) upsertPayloads[key].tot_clock_in_time = fullInTime;
            if (fullOutTime) upsertPayloads[key].tot_clock_out_time = fullOutTime;
            if (inTime) upsertPayloads[key].site_in_time = inTime;
            if (outTime) upsertPayloads[key].site_out_time = outTime;
            if (inTime || outTime) upsertPayloads[key].add_site_decl = true;
        }
      }

      setLogs(prev => [...prev, `🔍 解析結果: 有効な明細=${matchedCount}件, スキップ=${skippedRows}件`]);

      const payloads = Object.values(upsertPayloads);
      let successCount = 0;
      let errorCount = 0;

      if (payloads.length === 0) {
         setLogs(prev => [...prev, `❌ 読み込める有効なデータが1件もありませんでした。ファイル形式が正しいか確認してください。`]);
         toast.error('有効なデータがありません');
         setIsProcessing(false);
         return;
      }

      for (const p of payloads) {
         try {
            // 既存レコードの確認
            const { data: existing, error: errExist } = await supabase
               .from('daily_attendance')
               .select('id, site_declarations')
               .eq('target_date', p.target_date)
               .eq('worker_id', p.worker_id)
               .maybeSingle();
            
            if (errExist) throw errExist;

            let siteDecls = existing && existing.site_declarations ? [...existing.site_declarations] : [];

            // 本人申告（TOT打刻）を上書き更新
            if (p.add_site_decl) {
               const existIdx = siteDecls.findIndex((s: any) => s.project_id === 'imported' || s.project_name === 'TOT打刻');
               if (existIdx >= 0) {
                  siteDecls[existIdx].start_time = p.site_in_time || siteDecls[existIdx].start_time;
                  siteDecls[existIdx].end_time = p.site_out_time || siteDecls[existIdx].end_time;
               } else {
                  siteDecls.push({
                     project_id: 'imported',
                     project_name: 'TOT打刻',
                     start_time: p.site_in_time || "",
                     end_time: p.site_out_time || ""
                  });
               }
            }

            if (existing) {
               const { error: errUp } = await supabase.from('daily_attendance').update({
                  tot_clock_in_time: p.tot_clock_in_time || null,
                  tot_clock_out_time: p.tot_clock_out_time || null,
                  site_declarations: siteDecls
               }).eq('id', existing.id);
               if (errUp) throw errUp;
            } else {
               const { error: errIns } = await supabase.from('daily_attendance').insert({
                  worker_id: p.worker_id,
                  target_date: p.target_date,
                  tot_clock_in_time: p.tot_clock_in_time || null,
                  tot_clock_out_time: p.tot_clock_out_time || null,
                  site_declarations: siteDecls
               });
               if (errIns) throw errIns;
            }

            successCount++;
         } catch (dbErr: any) {
            console.error('DB Upsert error for', p.worker_name_debug, dbErr);
            errorCount++;
         }
      }
      if (errorCount > 0 && successCount === 0) {
         setLogs(prev => [...prev, `❌ インポート失敗: ${errorCount}件の保存エラー`]);
         toast.error('データの保存に失敗しました');
         setIsProcessing(false);
         return;
      } else if (errorCount > 0) {
         setLogs(prev => [...prev, `⚠️ 完了: ${successCount}件成功, ${errorCount}件エラー`]);
         toast.warning('一部のデータ保存に失敗しました');
         setIsProcessing(false);
         return;
      } else {
         setLogs(prev => [...prev, `✅ インポート完了: ${successCount}件 全て正常に保存されました`]);
         toast.success('Touch On Time のデータインポートが完了しました。');
         
         setTimeout(() => {
            onComplete();
            onClose();
         }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('エラーが発生しました: ' + err.message);
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b bg-blue-50">
          <div className="flex items-center gap-2">
             <FileBox className="h-5 w-5 text-blue-600" />
             <h2 className="text-lg font-bold text-slate-800">Touch On Time CSV取込</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-black/5 rounded-full transition-colors text-slate-500 hover:text-slate-700" disabled={isProcessing}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-700 mb-2">CSVファイルを選択</label>
            <div className="border-2 border-dashed border-blue-200 rounded-lg p-6 bg-blue-50/50 hover:bg-blue-50 transition-colors flex flex-col items-center justify-center cursor-pointer relative">
               <input 
                 type="file" 
                 accept=".csv"
                 onChange={handleFileChange}
                 className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                 disabled={isProcessing}
               />
               <Upload className="h-8 w-8 text-blue-400 mb-2" />
               <p className="text-sm text-slate-600 font-medium">ここをクリックするか、ファイルをドラッグ＆ドロップ</p>
               <p className="text-xs text-slate-500 mt-1">.csv 形式のファイルのみ</p>
            </div>
            {file && (
               <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-sm font-medium text-slate-700">{file.name}</span>
               </div>
            )}
          </div>

          <div className="bg-yellow-50 text-yellow-800 p-3 rounded text-xs border border-yellow-200 flex gap-2">
             <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
             <div>
                Touch On Timeの「日別データ出力」で出力した、<strong>5項目（日時, 名前, 従業員コード, 出勤時刻, 退勤時刻）</strong>が含まれるファイルを指定してください。
             </div>
          </div>

          {logs.length > 0 && (
             <div className="mt-4 p-3 bg-slate-900 rounded text-green-400 font-mono text-xs max-h-32 overflow-y-auto">
                {logs.map((log, i) => (
                   <div key={i} className="mb-1">{log}</div>
                ))}
             </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t bg-slate-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded hover:bg-slate-50"
            disabled={isProcessing}
          >
            キャンセル
          </button>
          <button
            onClick={processFile}
            disabled={!file || isProcessing}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isProcessing ? (
               <>
                 <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 処理中...
               </>
            ) : (
               <>
                  <Upload className="h-4 w-4" />
                  取り込む
               </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
