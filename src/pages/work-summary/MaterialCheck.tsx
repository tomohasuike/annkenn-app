import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { toast } from 'sonner';
import { CheckCircle2, Pencil, Trash2, ClipboardCheck, Loader2, ImageOff } from 'lucide-react';

// Google Driveの様々なURL形式を、画像を直接返す形式に統一する
function toDirectImageUrl(url: string): string {
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}`;
  }
  return url;
}

type ExtractedItem = {
  id: string;
  name: string;
  manufacturer?: string;
  quantity?: string;
  unit?: string;
  note?: string;
  checked?: boolean;
  deleted?: boolean;
};

type ReviewItem = {
  key: string; // report_material_id or report_material_id + extracted item id
  reportMaterialId: string;
  source: 'manual' | 'extracted';
  extractedItemId?: string;
  name: string;
  quantity: string;
  projectName: string;
  date: string;
  imageUrls: string[];
  manualEntry: { name: string; quantity: string } | null;
  allExtracted: ExtractedItem[];
};

export default function MaterialCheck() {
  const [loading, setLoading] = useState(true);
  const [queue, setQueue] = useState<ReviewItem[]>([]);
  const [current, setCurrent] = useState(0);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [imgError, setImgError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchQueue();
  }, []);

  const fetchQueue = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('report_materials')
        .select(`
          id, material_name, quantity, material_checked, documentation, extracted_materials,
          daily_reports!inner ( report_date, project_id, projects ( project_name ) )
        `)
        .or('material_checked.eq.false,extracted_materials.not.is.null')
        .order('created_at', { ascending: false });

      if (error) throw error;

      const items: ReviewItem[] = [];

      (data || []).forEach((row: any) => {
        const report = Array.isArray(row.daily_reports) ? row.daily_reports[0] : row.daily_reports;
        const project = report?.projects ? (Array.isArray(report.projects) ? report.projects[0] : report.projects) : null;
        const projectName = project?.project_name || '不明な案件';
        const d = report?.report_date ? new Date(report.report_date) : null;
        const dateStr = d && !isNaN(d.getTime())
          ? `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}(${['日', '月', '火', '水', '木', '金', '土'][d.getDay()]})`
          : '不明';

        let imageUrls: string[] = [];
        try {
          const parsed = JSON.parse(row.documentation || '[]');
          imageUrls = Array.isArray(parsed) ? parsed : [row.documentation];
        } catch {
          imageUrls = row.documentation ? [row.documentation] : [];
        }
        imageUrls = imageUrls.filter(Boolean);

        const allExtracted: ExtractedItem[] = Array.isArray(row.extracted_materials) ? row.extracted_materials : [];
        const manualEntry = row.material_name ? { name: row.material_name, quantity: row.quantity || '' } : null;

        // 手入力分(未確認のみ)
        if (row.material_name && !row.material_checked) {
          items.push({
            key: `${row.id}-manual`,
            reportMaterialId: row.id,
            source: 'manual',
            name: row.material_name,
            quantity: row.quantity || '',
            projectName,
            date: dateStr,
            imageUrls,
            manualEntry,
            allExtracted,
          });
        }

        // 資料からの抽出分(未確認・未削除のみ)
        allExtracted.forEach((ex) => {
          if (ex.checked || ex.deleted) return;
          items.push({
            key: `${row.id}-${ex.id}`,
            reportMaterialId: row.id,
            source: 'extracted',
            extractedItemId: ex.id,
            name: ex.name,
            quantity: [ex.quantity, ex.unit].filter(Boolean).join(''),
            projectName,
            date: dateStr,
            imageUrls,
            manualEntry,
            allExtracted,
          });
        });
      });

      setQueue(items);
      setCurrent(0);
    } catch (err: any) {
      console.error(err);
      toast.error('取得に失敗しました: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const item = queue[current];

  useEffect(() => {
    setImgError(false);
    setEditing(false);
    if (item) {
      setEditName(item.name);
      setEditQuantity(item.quantity);
    }
  }, [current, item?.key]);

  const advance = () => {
    setQueue(prev => prev.filter((_, i) => i !== current));
    setCurrent(c => Math.min(c, queue.length - 2 < 0 ? 0 : c));
  };

  const markManualChecked = async (materialName?: string) => {
    if (!item) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('report_materials')
        .update({
          material_checked: true,
          ...(materialName !== undefined ? { material_name: materialName, quantity: editQuantity } : {}),
        })
        .eq('id', item.reportMaterialId);
      if (error) throw error;
      advance();
    } catch (err: any) {
      toast.error('更新に失敗しました: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const updateExtractedItem = async (patch: Partial<ExtractedItem>) => {
    if (!item || !item.extractedItemId) return;
    setSaving(true);
    try {
      // item.allExtractedは一覧取得時点のスナップショットのため、同じ資料から複数品目を
      // 連続で処理すると古い内容で上書きしてしまう。書き込み直前にDBから最新値を読み直す。
      const { data: fresh, error: fetchErr } = await supabase
        .from('report_materials')
        .select('extracted_materials')
        .eq('id', item.reportMaterialId)
        .single();
      if (fetchErr) throw fetchErr;

      const freshList: ExtractedItem[] = Array.isArray(fresh?.extracted_materials) ? fresh.extracted_materials : item.allExtracted;
      const updated = freshList.map(ex =>
        ex.id === item.extractedItemId ? { ...ex, ...patch } : ex
      );
      const { error } = await supabase
        .from('report_materials')
        .update({ extracted_materials: updated })
        .eq('id', item.reportMaterialId);
      if (error) throw error;
      advance();
    } catch (err: any) {
      toast.error('更新に失敗しました: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleOk = () => {
    if (!item) return;
    if (item.source === 'manual') markManualChecked();
    else updateExtractedItem({ checked: true });
  };

  const handleSaveEdit = () => {
    if (!item) return;
    if (item.source === 'manual') markManualChecked(editName);
    else updateExtractedItem({ name: editName, quantity: editQuantity, checked: true });
  };

  const handleDelete = () => {
    if (!item) return;
    if (item.source === 'manual') markManualChecked('');
    else updateExtractedItem({ deleted: true });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="max-w-xl mx-auto text-center py-24">
        <ClipboardCheck className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold mb-2">確認する材料はありません</h2>
        <p className="text-muted-foreground text-sm">すべての材料が確認済みです。</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto pb-12">
      <header className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-primary" /> 材料チェック
        </h1>
        <p className="text-muted-foreground text-sm font-medium">残り {queue.length} 件</p>
      </header>

      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* 元資料 */}
          <div className="bg-muted/30 flex items-center justify-center p-4 min-h-[280px] border-b md:border-b-0 md:border-r">
            {item.imageUrls.length > 0 && !imgError ? (
              <a href={item.imageUrls[0]} target="_blank" rel="noreferrer">
                <img
                  src={toDirectImageUrl(item.imageUrls[0])}
                  alt="元資料"
                  onError={() => setImgError(true)}
                  className="max-h-[400px] max-w-full object-contain rounded-lg shadow-sm hover:opacity-90 transition-opacity cursor-zoom-in"
                />
              </a>
            ) : (
              <div className="text-muted-foreground text-sm flex flex-col items-center gap-2">
                <ImageOff className="w-8 h-8" />
                元資料なし
              </div>
            )}
          </div>

          {/* 情報・操作 */}
          <div className="p-6 space-y-4">
            <div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.source === 'extracted' ? 'bg-indigo-100 text-indigo-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {item.source === 'extracted' ? 'AI抽出' : '手入力'}
              </span>
            </div>

            {editing ? (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-muted-foreground">品名</label>
                  <input
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-muted-foreground">数量</label>
                  <input
                    value={editQuantity}
                    onChange={e => setEditQuantity(e.target.value)}
                    className="w-full border rounded-md px-3 py-2 text-sm mt-1"
                  />
                </div>
              </div>
            ) : (
              <div>
                <div className="text-lg font-bold">{item.name}</div>
                <div className="text-sm text-muted-foreground mt-1">数量：{item.quantity || '-'}</div>
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
              <div>案件：{item.projectName}</div>
              <div>日付：{item.date}</div>
            </div>

            {item.source === 'extracted' && item.manualEntry && (
              <div className="text-xs bg-emerald-50 border border-emerald-100 rounded-lg p-3">
                <div className="font-bold text-emerald-700 mb-1">同じ日報の手入力内容</div>
                <div>{item.manualEntry.name} {item.manualEntry.quantity && `(${item.manualEntry.quantity})`}</div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 p-4 border-t bg-muted/10">
          {editing ? (
            <>
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg h-11 font-bold text-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> 保存して確認済みにする
              </button>
              <button
                onClick={() => setEditing(false)}
                className="px-4 h-11 rounded-lg border text-sm font-bold"
              >
                キャンセル
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleOk}
                disabled={saving}
                className="flex-1 inline-flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white rounded-lg h-11 font-bold text-sm disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" /> これでOK
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg h-11 px-4 font-bold text-sm disabled:opacity-50"
              >
                <Pencil className="w-4 h-4" /> 修正する
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="inline-flex items-center justify-center gap-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg h-11 px-4 font-bold text-sm disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> 材料じゃない/削除
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
