import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { ShieldCheck, AlertTriangle, AlertCircle, Home, Users, MapPin, Send, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AutocompleteInput } from '../components/ui/AutocompleteInput';

type SafetyStatus = '無事' | '軽傷' | '重傷';
type FamilyStatus = '全員無事' | '負傷あり' | '連絡待ち';
type HouseStatus = '被害なし' | '一部損壊' | '避難中';
type LocationOption = '自宅' | '会社' | '現場' | 'その他';

export default function SafetyReportForm() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [workerName, setWorkerName] = useState('');
  const [status, setStatus] = useState<SafetyStatus>('無事');
  const [familyStatus, setFamilyStatus] = useState<FamilyStatus>('全員無事');
  const [houseStatus, setHouseStatus] = useState<HouseStatus>('被害なし');
  const [locationType, setLocationType] = useState<LocationOption>('自宅');
  const [locationOther, setLocationOther] = useState('');
  const [memo, setMemo] = useState('');

  // Determine current worker if logged in
  useEffect(() => {
    const fetchCurrentUserWorker = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (user && user.email) {
          const { data: workerMatch } = await supabase
            .from('worker_master')
            .select('name')
            .ilike('email', user.email)
            .single();

          if (workerMatch && workerMatch.name) {
            setWorkerName(workerMatch.name);
          } else {
            setWorkerName(user.email.split('@')[0]);
          }
        }
      } catch (err) {
        console.error("Error fetching user worker:", err);
      }
    };
    fetchCurrentUserWorker();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workerName) {
      setError('報告者名を入力して選択してください。');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Find worker_id from name
      const { data: workers, error: workerErr } = await supabase
        .from('worker_master')
        .select('id')
        .eq('name', workerName)
        .limit(1);

      if (workerErr || !workers || workers.length === 0) {
        throw new Error('指定された報告者名がデータベースに見つかりませんでした。正しい名前を選択してください。');
      }

      const workerId = workers[0].id;
      
      let finalLocation = locationType as string;
      if (locationType === 'その他' && locationOther.trim() !== '') {
        finalLocation = `その他（${locationOther}）`;
      }

      const reportData = {
        worker_id: workerId,
        status,
        family_status: familyStatus,
        house_status: houseStatus,
        location: finalLocation,
        memo: memo
      };

      const { error: insertErr } = await supabase
        .from('safety_reports')
        .insert([reportData]);

      if (insertErr) throw insertErr;

      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || '報告の送信中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden max-w-md w-full border-t-8 border-green-500 p-8 text-center space-y-6 animate-fade-in">
          <div className="flex justify-center">
            <div className="bg-green-100 p-5 rounded-full">
              <ShieldCheck size={48} className="text-green-600" />
            </div>
          </div>
          <h2 className="text-3xl font-bold text-slate-900">報告完了</h2>
          <p className="text-slate-600">安否状況を記録しました。<br/>引き続き安全を確保してください。</p>
          <button
            onClick={() => navigate('/')}
            className="w-full mt-6 h-12 bg-slate-800 hover:bg-slate-700 font-bold rounded-xl text-white transition-colors flex items-center justify-center gap-2"
          >
            <Home size={18} />
            アプリのホームに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-8 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden border-t-8 border-red-600">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 bg-white flex justify-between items-center sticky top-0 z-10">
          <div className="flex flex-col">
            <button 
              onClick={() => navigate('/')} 
              className="text-slate-400 hover:text-slate-600 flex items-center gap-1 text-sm font-bold mb-2 transition-colors"
            >
              <ArrowLeft size={16} /> 戻る
            </button>
            <h1 className="text-xl md:text-2xl font-extrabold text-slate-900 flex items-center gap-2">
              <AlertTriangle size={24} className="text-red-500" fill="currentColor" />
              緊急安否報告
            </h1>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* 報告者 */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 font-bold text-sm text-slate-700">
                <Users size={16} className="text-slate-400" />
                報告者名
              </label>
              <AutocompleteInput
                tableName="worker_master"
                columnName="name"
                value={workerName}
                onChange={setWorkerName}
                notFilters={{ type: '協力会社' }}
                placeholder="名前を入力・選択"
                required
                className="font-bold border-slate-300"
              />
            </div>

            {/* 本人の安否状況 */}
            <div className="space-y-3">
              <label className="font-bold text-sm text-slate-700">自分の安否状況</label>
              <div className="grid grid-cols-3 gap-3">
                <div className="relative">
                  <input type="radio" id="status_ok" name="status" checked={status === '無事'} onChange={() => setStatus('無事')} className="peer hidden" />
                  <label htmlFor="status_ok" className={`block w-full border-2 p-3 rounded-xl text-center cursor-pointer text-sm font-bold transition-all ${
                    status === '無事' ? 'bg-blue-600 border-blue-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                    無事
                  </label>
                </div>
                <div className="relative">
                  <input type="radio" id="status_minor" name="status" checked={status === '軽傷'} onChange={() => setStatus('軽傷')} className="peer hidden" />
                  <label htmlFor="status_minor" className={`block w-full border-2 p-3 rounded-xl text-center cursor-pointer text-sm font-bold transition-all ${
                    status === '軽傷' ? 'bg-yellow-500 border-yellow-500 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                    軽傷
                  </label>
                </div>
                <div className="relative">
                  <input type="radio" id="status_major" name="status" checked={status === '重傷'} onChange={() => setStatus('重傷')} className="peer hidden" />
                  <label htmlFor="status_major" className={`block w-full border-2 p-3 rounded-xl text-center cursor-pointer text-sm font-bold transition-all ${
                    status === '重傷' ? 'bg-red-600 border-red-600 text-white shadow-md' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}>
                    重傷
                  </label>
                </div>
              </div>
            </div>

            {/* 家族・住居 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="font-bold text-sm text-slate-700 flex items-center gap-1">
                  <Users size={14} /> 家族
                </label>
                <select 
                  value={familyStatus} 
                  onChange={(e) => setFamilyStatus(e.target.value as FamilyStatus)}
                  className="w-full p-3 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                >
                  <option value="全員無事">全員無事</option>
                  <option value="負傷あり">負傷あり</option>
                  <option value="連絡待ち">連絡待ち</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="font-bold text-sm text-slate-700 flex items-center gap-1">
                  <Home size={14} /> 住居
                </label>
                <select 
                  value={houseStatus} 
                  onChange={(e) => setHouseStatus(e.target.value as HouseStatus)}
                  className="w-full p-3 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium"
                >
                  <option value="被害なし">被害なし</option>
                  <option value="一部損壊">一部損壊</option>
                  <option value="避難中">避難中</option>
                </select>
              </div>
            </div>

            {/* 現在地 */}
            <div className="space-y-2">
              <label className="font-bold text-sm text-slate-700 flex items-center gap-1">
                <MapPin size={14} /> 現在地
              </label>
              <select 
                value={locationType} 
                onChange={(e) => setLocationType(e.target.value as LocationOption)}
                className="w-full p-3 border border-slate-300 rounded-lg bg-white outline-none focus:ring-2 focus:ring-blue-500 text-slate-700 font-medium transition-all"
              >
                <option value="自宅">自宅</option>
                <option value="会社">会社</option>
                <option value="現場">現場</option>
                <option value="その他">その他</option>
              </select>
              
              {locationType === 'その他' && (
                <div className="mt-2 animate-fade-in">
                  <input 
                    type="text" 
                    placeholder="現在の場所を詳しく入力してください" 
                    value={locationOther}
                    onChange={(e) => setLocationOther(e.target.value)}
                    required
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 transition-all text-slate-700"
                  />
                </div>
              )}
            </div>

            {/* 報告内容（メモ） */}
            <div className="space-y-2">
              <label className="font-bold text-sm text-slate-700">報告内容</label>
              <textarea 
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="会社に伝えておくべきことや、現在の状況など" 
                className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 h-28 resize-none text-slate-700"
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 text-red-800 text-sm font-bold rounded-lg border border-red-200 flex items-start gap-2">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={loading}
              className={`w-full h-14 mt-4 text-lg font-bold text-white rounded-xl shadow-md flex justify-center items-center gap-2 transition-all ${
                loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700 active:scale-95'
              }`}
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <Send size={20} />
                  報告を送信する
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
