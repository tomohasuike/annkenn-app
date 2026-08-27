import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { Plus, Trash2, Calendar, User, Briefcase, AlertCircle, RefreshCw, Search } from 'lucide-react';
import { toast } from 'sonner';

// 案件・作業員が多いため、選択肢を絞り込める検索付きセレクトボックス
function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = query.trim()
    ? options.filter(o => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={isOpen ? query : (selected?.label || '')}
          onChange={e => { setQuery(e.target.value); setIsOpen(true); }}
          onFocus={() => { setQuery(''); setIsOpen(true); }}
          placeholder={placeholder}
          className="w-full h-10 pl-9 pr-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
      </div>
      {isOpen && (
        <ul className="absolute z-50 w-full mt-1 max-h-64 overflow-auto bg-white border rounded-lg shadow-md">
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-slate-400">該当する項目がありません</li>
          ) : (
            filtered.map(o => (
              <li
                key={o.value}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(o.value); setIsOpen(false); setQuery(''); }}
                className={`px-3 py-2 text-sm cursor-pointer hover:bg-blue-50 ${o.value === value ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-700'}`}
              >
                {o.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}

export interface ProjectRoleAssignment {
  id: string;
  project_id: string;
  worker_id: string;
  role: string;
  start_date: string;
  end_date: string;
  project?: { project_name: string; project_number?: string };
  worker?: { name: string };
}

interface RoleAssignmentAdminProps {
  workers: any[];
}

export default function RoleAssignmentAdmin({ workers }: RoleAssignmentAdminProps) {
  const [assignments, setAssignments] = useState<ProjectRoleAssignment[]>([]);
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    project_id: '',
    worker_id: '',
    role: '現場代理人',
    start_date: '',
    end_date: ''
  });

  const fetchAssignments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_role_assignments')
        .select(`
          id, project_id, worker_id, role, start_date, end_date,
          project:projects(project_name, project_number),
          worker:worker_master(name)
        `)
        .order('start_date', { ascending: false });

      if (error) {
        // Table might not exist yet if migration hasn't run
        if (error.code === '42P01') {
           toast.error('テーブルがまだ作成されていないようです。データベースへの反映をお待ち下さい。');
        } else {
           throw error;
        }
      } else {
        setAssignments((data as any) || []);
      }
    } catch (err: any) {
      console.error(err);
      toast.error('読み込み中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, project_name, project_number')
        .neq('status_flag', '完工') // only active projects
        .not('project_number', 'ilike', 'TEMP-%')
        .not('project_name', 'ilike', '%休暇%')
        .order('project_name');
      if (!error && data) {
         setAllProjects(data);
      }
    } catch (err) {
      console.error("Failed to fetch projects for role assignments", err);
    }
  };

  useEffect(() => {
    fetchAssignments();
    fetchProjects();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.project_id || !form.worker_id || !form.role || !form.start_date || !form.end_date) {
      toast.error('すべての項目を入力してください');
      return;
    }

    const start = new Date(form.start_date);
    const end = new Date(form.end_date);

    if (end < start) {
      toast.error('終了日は開始日以降の日付を指定してください');
      return;
    }

    // 2ヶ月以上のチェック (約60日、厳密には月を加算して比較)
    const minEndDate = new Date(start);
    minEndDate.setMonth(minEndDate.getMonth() + 2);
    minEndDate.setDate(minEndDate.getDate() - 1); // 2ヶ月後の前日

    if (end < minEndDate) {
      toast.error('現場代理人等に指定できるのは期間が2ヶ月以上の案件のみです。');
      return;
    }

    setIsSubmitting(true);
    try {
      if (form.role === '現場代理人') {
        // 1案件につき現場代理人は1人まで(職長の既存ルールと同じ形)
        const { data: overlapping, error: overlapErr } = await supabase
          .from('project_role_assignments')
          .select('worker_id, worker:worker_master(name)')
          .eq('project_id', form.project_id)
          .eq('role', '現場代理人')
          .lte('start_date', form.end_date)
          .gte('end_date', form.start_date);

        if (overlapErr) throw overlapErr;

        if (overlapping && overlapping.length > 0) {
          const existingName = (overlapping[0] as any).worker?.name || '別の方';
          toast.error(`この案件にはすでに${existingName}が現場代理人として指定されています。1案件につき現場代理人は1人までです。`);
          setIsSubmitting(false);
          return;
        }

        // 同一案件で職長との兼任はできない
        const { data: dailyRecords, error: dailyErr } = await supabase
          .from('daily_attendance')
          .select('site_declarations')
          .eq('worker_id', form.worker_id)
          .gte('target_date', form.start_date)
          .lte('target_date', form.end_date);

        if (dailyErr) throw dailyErr;

        const isForemanOnThisProject = (dailyRecords || []).some((row: any) => {
          const decs = Array.isArray(row.site_declarations) ? row.site_declarations : [];
          return decs.some((d: any) => d.id === form.project_id && d.role === '職長');
        });

        if (isForemanOnThisProject) {
          toast.error('この作業員はこの案件で職長として指定されています。同一案件で職長と現場代理人の兼任はできません。');
          setIsSubmitting(false);
          return;
        }
      }

      const { error } = await supabase.from('project_role_assignments').insert([{
        project_id: form.project_id,
        worker_id: form.worker_id,
        role: form.role,
        start_date: form.start_date,
        end_date: form.end_date
      }]);

      if (error) throw error;
      toast.success('役割指定を登録しました');
      setForm({ project_id: '', worker_id: '', role: '現場代理人', start_date: '', end_date: '' });
      fetchAssignments();
    } catch (err: any) {
      console.error(err);
      toast.error('登録に失敗しました: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('この指定を削除してもよろしいですか？')) return;
    
    try {
      const { error } = await supabase.from('project_role_assignments').delete().eq('id', id);
      if (error) throw error;
      toast.success('削除しました');
      setAssignments(assignments.filter(a => a.id !== id));
    } catch (err: any) {
      console.error(err);
      toast.error('削除に失敗しました: ' + err.message);
    }
  };

  return (
    <div className="p-4 sm:p-6 bg-white shrink-0 min-h-full">
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* 新規登録フォーム */}
        <div className="w-full md:w-1/3 min-w-[300px]">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-5 sticky top-6 shadow-sm">
            <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2 mb-4">
              <Plus className="w-5 h-5 text-blue-600"/>
              新しい役割指定を追加
            </h3>
            
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">対象案件</label>
                <SearchableSelect
                  options={allProjects.map(p => ({ value: p.id, label: `${p.project_number ? `[${p.project_number}] ` : ''}${p.project_name}` }))}
                  value={form.project_id}
                  onChange={v => setForm({...form, project_id: v})}
                  placeholder="案件名・工事番号で検索..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">対象作業員</label>
                <SearchableSelect
                  options={workers.map(w => ({ value: w.id, label: w.name }))}
                  value={form.worker_id}
                  onChange={v => setForm({...form, worker_id: v})}
                  placeholder="作業員名で検索..."
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-600 block mb-1">役割</label>
                <select 
                  className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium text-blue-900"
                  value={form.role}
                  onChange={e => setForm({...form, role: e.target.value})}
                  required
                >
                  <option value="現場代理人">現場代理人</option>
                  <option value="現場代理人（主任技術者）">現場代理人（主任技術者）</option>
                  <option value="監理技術者">監理技術者</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1">開始日</label>
                  <input 
                    type="date"
                    required
                    className="w-full h-10 px-3 border border-slate-300 rounded-lg text-sm bg-white shadow-inner focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    value={form.start_date}
                    onChange={e => setForm({...form, start_date: e.target.value})}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 block mb-1 text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      終了日 (必須)
                  </label>
                  <input 
                    type="date"
                    required
                    className="w-full h-10 px-3 border border-red-200 rounded-lg text-sm bg-white shadow-inner focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none"
                    value={form.end_date}
                    min={form.start_date}
                    onChange={e => setForm({...form, end_date: e.target.value})}
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-500">※ 指定期間が2ヶ月未満の場合は適用できずエラーとなります。</p>

              <button 
                type="submit" 
                disabled={isSubmitting}
                className="w-full bg-blue-600 text-white font-bold h-11 rounded-lg shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 mt-2"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin"/> : <Plus className="w-4 h-4"/>}
                この指定で登録する
              </button>
            </form>
          </div>
        </div>

        {/* 登録済みリスト */}
        <div className="w-full md:w-2/3">
          <div className="flex justify-between items-center mb-4">
             <h3 className="font-bold text-lg text-slate-800">登録済みの指定一覧</h3>
             <button onClick={fetchAssignments} className="text-slate-500 hover:text-blue-600 p-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin cursor-not-allowed' : ''}`}/></button>
          </div>

          <div className="bg-white border rounded-xl shadow-sm overflow-hidden min-h-[400px]">
             {loading ? (
                <div className="flex items-center justify-center h-[200px] text-slate-400 gap-2">
                   <RefreshCw className="w-5 h-5 animate-spin"/> 読み込み中...
                </div>
             ) : assignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-[200px] text-slate-400 py-10">
                   <Briefcase className="w-12 h-12 text-slate-200 mb-3" />
                   <p className="font-medium text-sm">役割指定の登録はありません</p>
                </div>
             ) : (
               <table className="w-full text-left text-sm whitespace-nowrap">
                 <thead className="bg-slate-50 border-b">
                   <tr>
                     <th className="p-3 font-bold text-slate-600">作業員</th>
                     <th className="p-3 font-bold text-slate-600">対象案件</th>
                     <th className="p-3 font-bold text-slate-600">役割</th>
                     <th className="p-3 font-bold text-slate-600">指定期間</th>
                     <th className="p-3 font-bold text-slate-600 text-right">操作</th>
                   </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100">
                   {assignments.map(a => {
                     const isExpired = new Date(a.end_date) < new Date();
                     return (
                     <tr key={a.id} className={`hover:bg-slate-50 transition-colors ${isExpired ? 'opacity-50 bg-slate-50' : ''}`}>
                       <td className="p-3 font-medium text-slate-700 flex items-center gap-2">
                          <User className="w-4 h-4 text-slate-400" />
                          {a.worker?.name || '不明なユーザー'}
                       </td>
                       <td className="p-3 text-slate-600 max-w-[200px] truncate" title={a.project?.project_name}>
                          {a.project?.project_name || '不明な案件'}
                       </td>
                       <td className="p-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
                            {a.role}
                          </span>
                       </td>
                       <td className="p-3 text-slate-600 font-mono text-xs">
                          <div className="flex items-center gap-1">
                             <Calendar className="w-3 h-3 text-slate-400" />
                             {a.start_date.replace(/-/g, '/')} 〜 {a.end_date.replace(/-/g, '/')}
                          </div>
                          {isExpired && <span className="text-[10px] text-red-500 font-bold ml-4">期限切れ</span>}
                       </td>
                       <td className="p-3 text-right">
                         <button 
                           onClick={() => handleDelete(a.id)}
                           className="text-slate-300 hover:text-red-500 p-1.5 hover:bg-red-50 rounded"
                           title="割り当てを削除"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </td>
                     </tr>
                     );
                   })}
                 </tbody>
               </table>
             )}
          </div>
        </div>

      </div>
    </div>
  );
}
