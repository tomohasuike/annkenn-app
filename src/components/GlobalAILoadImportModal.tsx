import React, { useState } from 'react';
import { Bot, X, FileJson, AlertCircle } from 'lucide-react';

interface GlobalAILoadImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (jsonText: string, mode: 'overwrite' | 'append') => Promise<void>;
  isImporting: boolean;
}

export const GlobalAILoadImportModal: React.FC<GlobalAILoadImportModalProps> = ({
  isOpen, onClose, onImport, isImporting
}) => {
  const [jsonText, setJsonText] = useState('');
  const [importMode, setImportMode] = useState<'overwrite' | 'append'>('overwrite');

  if (!isOpen) return null;

  const handleImport = async () => {
    if (!jsonText.trim()) return;
    await onImport(jsonText, importMode);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        <div className="bg-emerald-800 p-5 flex justify-between items-center text-white">
          <div className="flex items-center gap-3">
            <Bot className="w-6 h-6 text-emerald-300" />
            <h2 className="text-xl font-bold">AI図面データ 一括自動設計</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-emerald-700 text-white/70 hover:text-white rounded transition-colors"><X className="w-5 h-5"/></button>
        </div>
        <div className="p-6">
          <div className="bg-emerald-50 text-emerald-800 p-4 rounded-lg mb-4 text-sm font-bold flex gap-3">
            <FileJson className="w-5 h-5 shrink-0 text-emerald-600" />
            <p>
              AI（GeminiやChatGPT）に出力させた<strong>現場全体のJSON</strong>を貼り付けてください。キュービクル、分電盤、そして末端の機器負荷までを一気に構築・紐付けします。
            </p>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-bold text-slate-700 mb-2">取り込みモード（上書きか追記か）</label>
            <div className="flex gap-4">
              <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors flex-1 ${importMode === 'overwrite' ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="import_mode" value="overwrite" checked={importMode === 'overwrite'} onChange={() => setImportMode('overwrite')} className="w-4 h-4 text-emerald-600 focus:ring-emerald-500" />
                <div>
                  <div className="font-bold text-slate-800">ツリーを再生成（上書き）</div>
                  <div className="text-xs text-slate-500 mt-0.5">現在のツリーをリセットし、JSONの構成で完全に作り直します</div>
                </div>
              </label>
              <label className={`flex items-center gap-2 p-3 border rounded-lg cursor-pointer transition-colors flex-1 ${importMode === 'append' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="import_mode" value="append" checked={importMode === 'append'} onChange={() => setImportMode('append')} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                <div>
                  <div className="font-bold text-slate-800">ツリーの下の階層に追記</div>
                  <div className="text-xs text-slate-500 mt-0.5">現在のツリー構造は維持し、選択したノード（または大元）の下に追加盤として生成します</div>
                </div>
              </label>
            </div>
          </div>

          <textarea
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
            placeholder={'{\n  "root_nodes": [\n    {\n      "type": "root_cubicle",\n      "name": "高圧受変電設備",\n      "children": [\n        {\n          "type": "power",\n          "name": "屋上動力盤",\n          "loads": [ { "name": "ファン", "capacity_kw": 2.2 } ]\n        }\n...'}
            className="w-full h-64 p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          
          <div className="flex justify-between items-center mt-4">
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-full font-bold">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <span>自動的にデータベースへの盤・負荷の書き込みが行われます</span>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={onClose} 
                disabled={isImporting}
                className="px-5 py-2 text-sm font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50"
              >
                キャンセル
              </button>
              <button 
                onClick={handleImport} 
                disabled={isImporting || !jsonText.trim()}
                className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white text-sm font-bold rounded-lg hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-50"
              >
                {isImporting ? (
                   <>
                     <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                     構築中...
                   </>
                ) : (
                  <>
                    <Bot className="w-4 h-4" />
                    一括設計を開始
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
