import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { format } from 'date-fns';
import { 
  ArrowLeft, 
  Save, 
  Camera, 
  Image as ImageIcon, 
  X, 
  Check,
  Calendar,
  Clock,
  User,
  FileText
} from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import imageCompression from 'browser-image-compression';
import { AutocompleteInput } from '../../components/ui/AutocompleteInput';

interface CompletionReportFormData {
  id?: string;
  report_id: string; // generated ID string
  reporter: string;
  project_id: string;
  completion_date: string;
  inspection_datetime: string;
  inspector: string;
  witness: string;
  inspection_items: string[];
  inspection_details: string;
  inspection_result: '合格' | '不合格' | '';
  remarks: string;
}

interface PhotoItem {
  id?: string;
  url?: string;
  file?: File;
  preview?: string;
  is_main: boolean;
  display_order: number;
}

const INSPECTION_ITEM_OPTIONS = [
  '外観検査',
  '機能検査',
  '図面との整合検査',
  '絶縁抵抗試験',
  '電圧試験',
  '接地抵抗試験',
  'その他'
];

export function CompletionReportForm() {
  const navigate = useNavigate();
  const { id } = useParams(); // URL might be /reports/completion/:id or /reports/:projectId/completion/new
  const location = useLocation();
  
  // Try to parse out the starting params
  const isEditing = id && id !== 'new';
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [projects, setProjects] = useState<{id: string, name: string}[]>([]);
  
  const [formData, setFormData] = useState<CompletionReportFormData>({
    report_id: uuidv4().split('-')[0], // 8 chars roughly
    reporter: '',
    project_id: '',
    completion_date: format(new Date(), 'yyyy-MM-dd'),
    inspection_datetime: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    inspector: '',
    witness: '',
    inspection_items: [],
    inspection_details: '',
    inspection_result: '',
    remarks: ''
  });

  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchInitialData();
  }, [id]);

  const fetchInitialData = async () => {
    try {
      setLoading(true);
      
      // Fetch projects for dropdown
      const { data: projData } = await supabase.from('projects').select('id, project_name, project_number').order('project_name');
      if (projData) {
        // 工程管理用の特別な案件（VACATIONなど）を除外
        setProjects(projData.filter(p => p.project_number !== 'VACATION' && (!p.project_name || !p.project_name.includes('休暇'))).map(p => ({id: p.id, name: p.project_name || '名称未設定'})));
      }
      
      const { data: { user } } = await supabase.auth.getUser();
      let currentUserEmailName = user?.email?.split('@')[0] || '';
      
      // Attempt to map email to real name using worker_master
      if (user && user.email) {
          const { data: workerMatch } = await supabase
            .from('worker_master')
            .select('name')
            .ilike('email', user.email)
            .single()

          if (workerMatch && workerMatch.name) {
              currentUserEmailName = workerMatch.name;
          }
      }

      if (isEditing) {
        // Load existing report
        const { data: report, error } = await supabase
          .from('completion_reports')
          .select('*')
          .eq('id', id)
          .single();
          
        if (error) throw error;
        if (report) {
          
          let loadedReporter = report.reporter || currentUserEmailName;
          let loadedInspector = report.inspector || currentUserEmailName;
          
          // Retroactive fix for older english prefix records
          if (loadedReporter && /^[a-zA-Z.]+$/.test(loadedReporter)) {
             const { data: workerMatch } = await supabase.from('worker_master').select('name').ilike('email', `${loadedReporter}%`).limit(1).single()
             if (workerMatch && workerMatch.name) loadedReporter = workerMatch.name;
          }
          if (loadedInspector && /^[a-zA-Z.]+$/.test(loadedInspector)) {
             const { data: workerMatch } = await supabase.from('worker_master').select('name').ilike('email', `${loadedInspector}%`).limit(1).single()
             if (workerMatch && workerMatch.name) loadedInspector = workerMatch.name;
          }

          setFormData({
            id: report.id,
            report_id: report.report_id,
            reporter: loadedReporter,
            project_id: report.project_id || '',
            completion_date: report.completion_date || format(new Date(), 'yyyy-MM-dd'),
            inspection_datetime: report.inspection_datetime ? report.inspection_datetime.slice(0, 16) : format(new Date(), "yyyy-MM-dd'T'HH:mm"),
            inspector: loadedInspector,
            witness: report.witness || '',
            inspection_items: report.inspection_items || [],
            inspection_details: report.inspection_details || '',
            inspection_result: report.inspection_result || '',
            remarks: report.remarks || ''
          });
          
          // Fetch photos
          const { data: photosData } = await supabase
            .from('completion_report_photos')
            .select('*')
            .eq('completion_report_id', report.id)
            .order('display_order');
            
          if (photosData) {
            setPhotos(photosData.map(p => ({
              id: p.id,
              url: p.photo_url,
              is_main: p.is_main,
              display_order: p.display_order
            })));
          }
        }
      } else {
        // New report. See if we came via state with a pre-filled project ID
        const state = location.state as { projectId?: string, reporterName?: string };
        const baseReporter = state?.reporterName || currentUserEmailName;
        
        setFormData(prev => ({ 
            ...prev, 
            reporter: baseReporter,
            inspector: baseReporter
        }));

        if (state?.projectId) {
          setFormData(prev => ({ ...prev, project_id: state.projectId as string }));
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      alert('データの読み込みに失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: keyof CompletionReportFormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const toggleInspectionItem = (item: string) => {
    setFormData(prev => {
      const current = [...prev.inspection_items];
      if (current.includes(item)) {
         return { ...prev, inspection_items: current.filter(i => i !== item) };
      } else {
         return { ...prev, inspection_items: [...current, item] };
      }
    });
  };

  // --- Photo Handling ---
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    
    // Check max limit (6)
    if (photos.length + files.length > 6) {
        alert("写真は最大6枚までアップロード可能です。");
        return;
    }

    const newPhotos: PhotoItem[] = [];
    Array.from(files).forEach((file) => {
      const previewUrl = URL.createObjectURL(file);
      // If this is the first photo overall, make it the main photo by default
      const isFirst = photos.length === 0 && newPhotos.length === 0;
      newPhotos.push({
        file,
        preview: previewUrl,
        is_main: isFirst,
        display_order: photos.length + newPhotos.length
      });
    });

    setPhotos(prev => [...prev, ...newPhotos]);
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removePhoto = (index: number) => {
    const photoToRemove = photos[index];
    if (photoToRemove.id) {
        setDeletedPhotoIds(prev => [...prev, photoToRemove.id!]);
    }
    
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    
    // Manage main photo state if the deleted one was main
    if (photoToRemove.is_main && newPhotos.length > 0) {
        newPhotos[0].is_main = true;
    }
    
    setPhotos(newPhotos);
  };
  
  const setMainPhoto = (index: number) => {
      setPhotos(prev => prev.map((p, i) => ({ ...p, is_main: i === index })));
  };

  // --- Save Logic ---
  const uploadFileToSupabase = async (file: File): Promise<string> => {
    const options = {
      maxSizeMB: 0.5,
      maxWidthOrHeight: 1280,
      useWebWorker: true,
    }
    const compressed = await imageCompression(file, options)

    const fileExt = compressed.name.split('.').pop() || 'jpg';
    const fileName = `${uuidv4()}.${fileExt}`;

    const finalFile = new File([compressed], fileName, { type: compressed.type });
    const formData = new FormData();
    formData.append('file', finalFile);

    const { error: uploadError, data: uploadData } = await supabase.functions.invoke('upload-drive-file', {
        body: formData,
    });

    if (uploadError || !uploadData?.success) {
        console.error("Error uploading image:", uploadError || uploadData?.error);
        throw new Error("画像のアップロードに失敗しました");
    }

    // Google Drive URL
    const publicUrl = uploadData.directLink ? uploadData.directLink : uploadData.webViewLink;

    return publicUrl;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.project_id) {
        alert("工事案件を選択してください。");
        return;
    }
    if (!formData.inspection_result) {
        alert("検査結果（合格 / 不合格）を選択してください。");
        return;
    }
    
    try {
      setSaving(true);

      const reportPayload = {
        report_id: formData.report_id,
        reporter: formData.reporter,
        project_id: formData.project_id,
        completion_date: formData.completion_date || null,
        inspection_datetime: formData.inspection_datetime ? `${formData.inspection_datetime.substring(0, 16)}:00+09:00` : null,
        inspector: formData.inspector,
        witness: formData.witness,
        inspection_items: formData.inspection_items,
        inspection_details: formData.inspection_details,
        inspection_result: formData.inspection_result || null,
        remarks: formData.remarks
      };

      let finalReportId = formData.id;

      if (isEditing && finalReportId) {
        const { error } = await supabase
          .from('completion_reports')
          .update(reportPayload)
          .eq('id', finalReportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('completion_reports')
          .insert([reportPayload])
          .select('id')
          .single();
        if (error) throw error;
        finalReportId = data.id;
      }

      // Handle photos deletion
      if (deletedPhotoIds.length > 0) {
          await supabase.from('completion_report_photos').delete().in('id', deletedPhotoIds);
      }

      // Handle photos upload and insertion
      for (let i = 0; i < photos.length; i++) {
          const p = photos[i];
          let finalUrl = p.url;
          
          if (p.file) {
              finalUrl = await uploadFileToSupabase(p.file);
          }
          
          if (finalUrl) {
              const photoPayload = {
                  completion_report_id: finalReportId,
                  photo_url: finalUrl,
                  is_main: p.is_main,
                  display_order: i
              };
              
              if (p.id) {
                  // Update existing
                  await supabase.from('completion_report_photos').update(photoPayload).eq('id', p.id);
              } else {
                  // Insert new
                  await supabase.from('completion_report_photos').insert([photoPayload]);
              }
          }
      }

      // Auto-update project status if inspection result is "合格" 
      if (formData.inspection_result === '合格') {
        const { error: projectStatusError } = await supabase
          .from('projects')
          .update({ status_flag: '完工' })
          .eq('id', formData.project_id);
          
        if (projectStatusError) {
          console.error('Failed to auto-update project status:', projectStatusError);
          // Non-blocking error, we still want to indicate the report saved
        }
      }

      alert("完了報告を保存しました！");
      navigate('/reports'); // Go back to reports list, or maybe a dedicated completion reports list
      
    } catch (err) {
      console.error('Error saving:', err);
      alert('保存に失敗しました。詳細をご確認ください。');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">読み込み中...</div>;

  const mainPhotoIndex = photos.findIndex(p => p.is_main) >= 0 ? photos.findIndex(p => p.is_main) : 0;
  const mainPhoto = photos.length > 0 ? photos[mainPhotoIndex] : null;

  return (
    <div className="max-w-3xl mx-auto pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 pb-4 mb-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => navigate(-1)}
              className="p-2 -ml-2 rounded-full hover:bg-slate-100 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {isEditing ? '完了報告を編集' : '新規完了報告'}
              </h1>
            </div>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <form className="px-4 space-y-6" onSubmit={handleSave}>
          
        {/* Core Info */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            {/* hidden ID field */}
            <input type="hidden" value={formData.report_id} />
            
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                 報告者 <span className="text-blue-500">*</span> 
                 <span className="text-xs font-normal text-slate-500 ml-2">(メールアドレスから自動取得)</span>
              </label>
              <input 
                type="text" 
                value={formData.reporter} 
                onChange={e => handleInputChange('reporter', e.target.value)}
                className="w-full border border-slate-300 bg-slate-50 text-slate-600 cursor-not-allowed rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                required
                disabled
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">工事案件 <span className="text-blue-500">*</span></label>
              <select
                value={formData.project_id}
                onChange={(e) => handleInputChange('project_id', e.target.value)}
                className="w-full border border-slate-300 bg-slate-50 text-slate-600 cursor-not-allowed rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                required
                disabled
              >
                <option value="">選択してください</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
        </div>

        {/* Dates & People */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1"><Calendar className="w-4 h-4"/> 完了日 <span className="text-blue-500">*</span></label>
              <input 
                type="date" 
                value={formData.completion_date} 
                onChange={e => handleInputChange('completion_date', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1"><Clock className="w-4 h-4"/> 検査日時 <span className="text-blue-500">*</span></label>
              <input 
                type="datetime-local" 
                value={formData.inspection_datetime} 
                onChange={e => handleInputChange('inspection_datetime', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-shadow"
                required
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1"><User className="w-4 h-4"/> 検査者 <span className="text-blue-500">*</span></label>
                  <AutocompleteInput 
                    value={formData.inspector} 
                    onChange={val => handleInputChange('inspector', val)}
                    tableName="completion_reports"
                    columnName="inspector"
                    projectId={formData.project_id}
                    className="w-full border-slate-300"
                    required
                  />
               </div>
               <div>
                  <label className="block text-sm font-bold text-slate-700 mb-1 flex items-center gap-1"><User className="w-4 h-4"/> 立会者</label>
                  <AutocompleteInput 
                    value={formData.witness} 
                    onChange={val => handleInputChange('witness', val)}
                    tableName="completion_reports"
                    columnName="witness"
                    projectId={formData.project_id}
                    className="w-full border-slate-300"
                  />
               </div>
            </div>
        </div>

        {/* Inspection Details */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">検査項目 <span className="text-blue-500">*</span></label>
                <div className="flex flex-col gap-2">
                    {INSPECTION_ITEM_OPTIONS.map(item => {
                        const isSelected = formData.inspection_items.includes(item);
                        return (
                            <button
                              key={item}
                              type="button"
                              onClick={() => toggleInspectionItem(item)}
                              className={`py-3 px-4 rounded-lg border-2 text-center font-bold transition-all ${isSelected ? 'border-blue-500 bg-blue-500 text-white shadow-md transform scale-[1.01]' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}
                            >
                                {item}
                                {isSelected && <Check className="w-4 h-4 inline-block ml-2"/>}
                            </button>
                        )
                    })}
                </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 mt-4">検査内容 <span className="text-blue-500">*</span></label>
              <textarea 
                value={formData.inspection_details} 
                onChange={e => handleInputChange('inspection_details', e.target.value)}
                placeholder="例: 電圧確認を実施し異常なし"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 min-h-[100px] outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-y"
                required
              />
            </div>
        </div>

        {/* Photos Module */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
             <label className="block text-sm font-bold text-slate-700 mb-2 flex items-center gap-1"><ImageIcon className="w-4 h-4"/> 代表写真・完了報告写真 (最大6枚) <span className="text-blue-500">*</span></label>
             
             {/* Upload Trigger */}
             {photos.length < 6 && (
                 <div className="flex gap-2 mb-4">
                    <button 
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex-1 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl py-6 flex flex-col items-center justify-center gap-2 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors text-slate-500"
                    >
                        <Camera className="w-6 h-6" />
                        <span className="text-sm font-bold">写真を追加</span>
                    </button>
                    <input 
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                    />
                 </div>
             )}

             {/* Photos Display (Main + Sub) */}
             {photos.length > 0 && (
                 <div className="space-y-4 border border-slate-200 rounded-lg p-3 bg-slate-50">
                    
                    {/* Main Photo Display */}
                    {mainPhoto && (
                        <div className="relative rounded-lg overflow-hidden bg-white shadow-sm border border-slate-200 group">
                            <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold px-2 py-1 rounded shadow-md z-10">
                                代表写真
                            </div>
                            <img 
                                src={mainPhoto.preview || mainPhoto.url} 
                                alt="代表写真" 
                                className="w-full h-auto object-contain max-h-[400px] bg-slate-800"
                            />
                            <button 
                                type="button"
                                onClick={() => removePhoto(mainPhotoIndex)}
                                className="absolute top-2 right-2 bg-black/60 text-white p-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                                title="写真を削除"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                    
                    {/* Thumbnails Row */}
                    <div className="flex flex-wrap gap-2">
                        {photos.map((p, index) => (
                            <div 
                                key={index} 
                                className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 cursor-pointer transition-all ${p.is_main ? 'border-blue-500 shadow-md transform scale-105' : 'border-slate-200 hover:border-blue-300'} group`}
                                onClick={() => setMainPhoto(index)}
                            >
                                <img src={p.preview || p.url} className="w-full h-full object-cover" />
                                {p.is_main && (
                                    <div className="absolute bottom-0 left-0 right-0 bg-blue-500 text-white text-[10px] text-center font-bold py-0.5">
                                        代表
                                    </div>
                                )}
                                {!p.is_main && (
                                    <button 
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); removePhoto(index); }}
                                        className="absolute top-1 right-1 bg-black/60 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-600 transition-opacity"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                 </div>
             )}
        </div>

        {/* Results & Remarks */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">検査結果 <span className="text-blue-500">*</span></label>
              <div className="flex gap-4">
                 <button
                   type="button"
                   onClick={() => handleInputChange('inspection_result', '合格')}
                   className={`flex-1 py-3 border-2 rounded-lg font-bold text-lg transition-all ${formData.inspection_result === '合格' ? 'border-blue-500 bg-blue-500 text-white shadow-md' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                 >
                    合格
                 </button>
                 <button
                   type="button"
                   onClick={() => handleInputChange('inspection_result', '不合格')}
                   className={`flex-1 py-3 border-2 rounded-lg font-bold text-lg transition-all ${formData.inspection_result === '不合格' ? 'border-amber-500 bg-amber-500 text-white shadow-md' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                 >
                    不合格
                 </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1 mt-4 flex items-center gap-1"><FileText className="w-4 h-4"/> 備考</label>
              <textarea 
                value={formData.remarks} 
                onChange={e => handleInputChange('remarks', e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 min-h-[80px] outline-none focus:ring-2 focus:ring-blue-500 transition-shadow resize-y"
              />
            </div>
        </div>
      </form>
    </div>
  );
}
