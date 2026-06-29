import { useState, useEffect, useRef, useCallback } from "react";
import {
  MapPin, Camera, Save, WifiOff, Wifi, RefreshCw,
  ChevronDown, ChevronUp, Check, AlertTriangle, Trash2, FileText, X,
  FolderOpen, Clock, ExternalLink
} from "lucide-react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { supabase } from "../../lib/supabase";

// ─── 型定義 ───────────────────────────────────────────
interface FormData {
  // 申込区分
  appKind: '仮設' | '本設';
  voltageClass: '低圧' | '高圧';
  // ①契約需給先
  needsName: string;
  needsAddress: string;
  needsPhone: string;
  needsPerson: string;
  // ②請求先
  billingSame: boolean;
  billingName: string;
  billingAddress: string;
  billingPerson: string;
  billingPhone: string;
  // ③申込内容
  startDate: string;
  completionDate: string;
  powerDate: string;
  powerAsap: boolean;
  // 電灯
  hasDentou: boolean;
  dentouType: string;
  dentouCapacity: string;
  dentouCapacityUnit: 'A' | 'kVA';
  // 動力
  hasDouryoku: boolean;
  douryokuCapacity: string;
  douryokuCapacityUnit: 'A' | 'kVA';
  // ④引込線
  poleName: string;
  poleLength: string;
  poleHeight: string;
  // メモ
  memo: string;
}

interface PhotoSlot {
  id: string;
  label: string;
  desc: string;
  preview: string | null;
  file: File | null;
}

interface Project {
  id: string;
  project_name: string;
  project_number: string | null;
  client_name: string | null;
  site_name: string | null;
}
interface HistoryItem {
  id: string;
  date: string;
  poleName: string;
  needsName: string;
  address: string;
  projectName: string;
  appKind: string;
  voltageClass: string;
}

// ─── 定数 ────────────────────────────────────────────
const STORAGE_KEY = "tepco_form_v1";
const HISTORY_KEY = "tepco_history_v1";
const PARENT_FOLDER_ID = "11dSzDLfM_iJsvCQPQ7pi6z0m1zagc_B2";
const MAPS_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string;
const OAUTH_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";

const INITIAL_FORM: FormData = {
  appKind: '仮設', voltageClass: '低圧',
  needsName: "", needsAddress: "", needsPhone: "", needsPerson: "",
  billingSame: false,
  billingName: "", billingAddress: "", billingPerson: "", billingPhone: "",
  startDate: "", completionDate: "", powerDate: "", powerAsap: true,
  hasDentou: true, dentouType: "単相3線式100/200V", dentouCapacity: "50", dentouCapacityUnit: 'A',
  hasDouryoku: false, douryokuCapacity: "3", douryokuCapacityUnit: 'kVA',
  poleName: "", poleLength: "", poleHeight: "",
  memo: "",
};

const SLOT_DEFS = [
  { id: "main",   label: "📸 当該柱（電柱番号）", desc: "申込対象の電柱番号プレートを含む全景" },
  { id: "right",  label: "📸 右柱（電柱番号）",   desc: "右隣の電柱番号プレート" },
  { id: "left",   label: "📸 左柱（電柱番号）",   desc: "左隣の電柱番号プレート" },
  { id: "site1",  label: "📸 現場状況①",          desc: "現場全体の状況" },
  { id: "site2",  label: "📸 現場状況②",          desc: "引込位置・建物周辺など" },
];

// ─── ユーティリティ ───────────────────────────────────
function toBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

async function driveCreateFolder(name: string, parentId: string, token: string): Promise<string> {
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const data = await res.json();
  return data.id as string;
}

async function driveUploadFile(
  name: string, content: string | Blob, mimeType: string, folderId: string, token: string
): Promise<void> {
  const meta = JSON.stringify({ name, parents: [folderId] });
  const body = typeof content === "string" ? new Blob([content], { type: mimeType }) : content;
  const form = new FormData();
  form.append("metadata", new Blob([meta], { type: "application/json" }));
  form.append("file", body);
  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
}

// ─── メインコンポーネント ─────────────────────────────
export default function TepcoForm() {
  const [form, setForm] = useState<FormData>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") ?? INITIAL_FORM; }
    catch { return INITIAL_FORM; }
  });
  const [photos, setPhotos] = useState<PhotoSlot[]>(
    SLOT_DEFS.map(d => ({ ...d, preview: null, file: null }))
  );
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locError, setLocError] = useState<string | null>(null);
  const [mapClipUrl, setMapClipUrl] = useState<string | null>(null);
  // 3電柱の位置
  type PoleKey = 'main' | 'right' | 'left' | 'service';
  const [poleLocations, setPoleLocations] = useState<Record<PoleKey, { lat: number; lng: number } | null>>({
    main: null, right: null, left: null, service: null
  });
  const [poleCapturing, setPoleCapturing] = useState(false);
  const [placingMode, setPlacingMode] = useState<PoleKey>('main');
  const mapDivRef = useRef<HTMLDivElement>(null);
  const lMapRef = useRef<L.Map | null>(null);
  const lMarkersRef = useRef<Record<PoleKey, L.CircleMarker | null>>({ main: null, right: null, left: null, service: null });
  const placingModeRef = useRef<PoleKey>('main');
  const [poleNumbers, setPoleNumbers] = useState<Record<PoleKey, string>>({ main: '', right: '', left: '', service: '' });
  const lLightningRef = useRef<L.Polyline | null>(null);
  const lDistLabelRef = useRef<L.Marker | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // 案件選択
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");

  // 過去の申請履歴
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
  });
  const [showHistory, setShowHistory] = useState(false);

  // オンライン監視
  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);

  // 案件一覧取得
  useEffect(() => {
    supabase.from('projects')
      .select('id, project_name, project_number, client_name, site_name')
      .not('project_number', 'ilike', 'TEMP-%')
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => { if (data) setProjects(data); });
  }, []);

  // 案件検索
  const [projectSearch, setProjectSearch] = useState("");
  const [projectOpen, setProjectOpen] = useState(false);
  const projectRef = useRef<HTMLDivElement>(null);
  const filteredProjects = projects.filter(p => {
    const q = projectSearch.toLowerCase();
    return (
      (p.project_name?.toLowerCase().includes(q)) ||
      (p.project_number?.toLowerCase().includes(q)) ||
      (p.client_name?.toLowerCase().includes(q)) ||
      (p.site_name?.toLowerCase().includes(q))
    );
  });
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // コンボボックス外クリックで閉じる
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (projectRef.current && !projectRef.current.contains(e.target as Node)) {
        setProjectOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // フォーム自動保存
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
  }, [form]);

  // ①→②コピー
  useEffect(() => {
    if (form.billingSame) {
      setForm(p => ({ ...p, billingName: p.needsName, billingAddress: p.needsAddress, billingPhone: p.needsPhone, billingPerson: p.needsName }));
    }
  }, [form.billingSame, form.needsName, form.needsAddress, form.needsPhone]);

  // 現在地取得
  const getLocation = useCallback(() => {
    setLocError(null);
    if (!navigator.geolocation) { setLocError("Geolocationに対応していません"); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        setLocation({ lat, lng });
        setMapClipUrl(`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=17&size=600x400&markers=color:red%7C${lat},${lng}&key=${MAPS_KEY}`);
      },
      (e) => setLocError(`位置情報エラー: ${e.message}`),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // 電柱番号が変わったらマーカーのツールチップを更新
  useEffect(() => {
    (['main', 'right', 'left', 'service'] as PoleKey[]).forEach(key => {
      const marker = lMarkersRef.current[key];
      if (!marker) return;
      if (poleNumbers[key]) {
        marker.bindTooltip(poleNumbers[key], { permanent: true, direction: 'top', className: 'pole-number-label' }).openTooltip();
      } else {
        marker.unbindTooltip();
      }
    });
  }, [poleNumbers]);

  // 引込柱↔当該柱の雷撃ライン描画
  useEffect(() => {
    const map = lMapRef.current;
    if (!map) return;
    if (lLightningRef.current) { lLightningRef.current.remove(); lLightningRef.current = null; }
    if (lDistLabelRef.current) { lDistLabelRef.current.remove(); lDistLabelRef.current = null; }
    const a = poleLocations.main;
    const b = poleLocations.service;
    if (!a || !b) return;
    const dLat = b.lat - a.lat;
    const dLng = b.lng - a.lng;
    const len = Math.sqrt(dLat * dLat + dLng * dLng) || 1;
    const offset = len * 0.35;
    const perpLat = (-dLng / len) * offset;
    const perpLng = (dLat / len) * offset;
    const path: [number, number][] = [
      [a.lat, a.lng],
      [a.lat + dLat * 0.35 + perpLat, a.lng + dLng * 0.35 + perpLng],
      [a.lat + dLat * 0.65 - perpLat, a.lng + dLng * 0.65 - perpLng],
      [b.lat, b.lng],
    ];
    lLightningRef.current = L.polyline(path, {
      color: '#f59e0b', weight: 3, opacity: 0.9, dashArray: '8 4',
    }).addTo(map);
    // ラベルをラインの垂直方向にオフセットして重なりを避ける
    const labelOffset = len * 0.55;
    const labelLat = (a.lat + b.lat) / 2 + (-dLng / len) * labelOffset;
    const labelLng = (a.lng + b.lng) / 2 + (dLat / len) * labelOffset;
    const distText = form.poleLength ? `⚡ ${form.poleLength}m` : '⚡ 引込線';
    const icon = L.divIcon({
      html: `<div style="color:#fbbf24;font-size:14px;font-weight:bold;white-space:nowrap;text-shadow:0 0 4px #000,0 0 4px #000,0 0 4px #000;">${distText}</div>`,
      className: '', iconAnchor: [30, 10],
    });
    lDistLabelRef.current = L.marker([labelLat, labelLng], { icon, interactive: false }).addTo(map);
  }, [poleLocations.main, poleLocations.service, form.poleLength]);

  // GPS取得してマップをその位置に移動（ピンは手動タップ）
  const moveToCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocError("Geolocationに対応していません"); return; }
    setPoleCapturing(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGpsCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setPoleCapturing(false);
      },
      (e) => { setLocError(`位置情報エラー: ${e.message}`); setPoleCapturing(false); },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // placingMode をrefに同期（マップクリックハンドラのクロージャで使う）
  useEffect(() => { placingModeRef.current = placingMode; }, [placingMode]);

  // Leaflet マップ初期化（マウント時一度だけ）
  useEffect(() => {
    if (!mapDivRef.current || lMapRef.current) return;
    const map = L.map(mapDivRef.current, { zoomControl: true }).setView([35.6812, 139.7671], 18);
    // ESRIの衛星タイル（無料・APIキー不要）
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles © Esri',
      maxZoom: 20,
    }).addTo(map);
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      const key = placingModeRef.current;
      if (lMarkersRef.current[key]) lMarkersRef.current[key]!.remove();
      const fillColor = key === 'main' ? '#ef4444' : key === 'right' ? '#3b82f6' : key === 'left' ? '#22c55e' : '#f59e0b';
      const cm = L.circleMarker([lat, lng], {
        radius: key === 'main' ? 12 : 10,
        fillColor,
        fillOpacity: 1,
        color: '#fff',
        weight: 2,
      }).addTo(map);
      // 電柱番号が入力済みならすぐラベル表示
      const num = placingModeRef.current === key
        ? (document.getElementById(`pole-num-${key}`) as HTMLInputElement | null)?.value ?? ''
        : '';
      if (num) cm.bindTooltip(num, { permanent: true, direction: 'top', className: 'pole-number-label' }).openTooltip();
      lMarkersRef.current[key] = cm;
      setPoleLocations(p => ({ ...p, [key]: { lat, lng } }));
    });
    lMapRef.current = map;
    return () => { map.remove(); lMapRef.current = null; };
  }, []);

  // GPS取得時：マップをその位置に移動するだけ（ピンは手動タップで）
  const [gpsCenter, setGpsCenter] = useState<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    if (!lMapRef.current || !gpsCenter) return;
    lMapRef.current.panTo([gpsCenter.lat, gpsCenter.lng]);
  }, [gpsCenter]);

  // 3ピン静的マップURL（Drive保存用サムネイルとして引き続き使用）
  const multiPinMapUrl = (() => {
    const pins = [
      { key: 'main' as PoleKey, color: 'red',   label: '当' },
      { key: 'right' as PoleKey, color: 'blue',  label: '右' },
      { key: 'left' as PoleKey, color: 'green', label: '左' },
    ].filter(p => poleLocations[p.key]);
    if (pins.length === 0) return null;
    const lats = pins.map(p => poleLocations[p.key]!.lat);
    const lngs = pins.map(p => poleLocations[p.key]!.lng);
    const centerLat = (Math.max(...lats) + Math.min(...lats)) / 2;
    const centerLng = (Math.max(...lngs) + Math.min(...lngs)) / 2;
    let url = `https://maps.googleapis.com/maps/api/staticmap?center=${centerLat},${centerLng}&zoom=17&size=600x400&key=${MAPS_KEY}`;
    pins.forEach(p => {
      const loc = poleLocations[p.key]!;
      url += `&markers=color:${p.color}%7Clabel:${encodeURIComponent(p.label)}%7C${loc.lat},${loc.lng}`;
    });
    return url;
  })();

  useEffect(() => { getLocation(); }, [getLocation]);

  const set = (k: keyof FormData, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  // 写真処理
  const onPhoto = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = await toBase64(file);
    setPhotos(p => p.map(s => s.id === id ? { ...s, file, preview } : s));
  };

  const delPhoto = (id: string) => {
    setPhotos(p => p.map(s => s.id === id ? { ...s, file: null, preview: null } : s));
    if (fileRefs.current[id]) fileRefs.current[id]!.value = "";
  };

  // Drive 保存
  const saveToDrive = async () => {
    setSaving(true); setSaveError(null); setSaved(false);
    try {
      // GIS token取得
      const token = await new Promise<string>((res, rej) => {
        const client = (window as any).google?.accounts?.oauth2?.initTokenClient({
          client_id: OAUTH_CLIENT_ID,
          scope: DRIVE_SCOPE,
          callback: (resp: any) => resp.error ? rej(resp.error) : res(resp.access_token),
        });
        if (!client) rej("Google Identity Servicesが読み込まれていません");
        else client.requestAccessToken();
      });

      // フォルダ作成
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const subName = `${form.appKind}_${form.voltageClass}_${poleNumbers.main || "未入力"}_${today}`;
      const tepcoFolderId = await driveCreateFolder("TEPCO申込", PARENT_FOLDER_ID, token);
      const subFolderId = await driveCreateFolder(subName, tepcoFolderId, token);

      // フォームデータ保存
      const dentouText = form.hasDentou ? `[電灯] 電気方式：${form.dentouType} / 契約容量：${form.dentouCapacity}${form.dentouCapacityUnit}` : '';
      const douryokuText = form.hasDouryoku ? `[動力] 電気方式：三相3線式200V / 契約容量：${form.douryokuCapacity}${form.douryokuCapacityUnit}` : '';
      const text = `東京電力 申込依頼書\n作成日：${new Date().toLocaleDateString("ja-JP")}\n\n` +
        `《申込区分》 ${form.appKind} / ${form.voltageClass}\n\n` +
        `《①契約需給先》\n名義：${form.needsName}\n住所：${form.needsAddress}\n担当者：${form.needsPerson}\n連絡先：${form.needsPhone}\n\n` +
        `【②請求先】\n名義：${form.billingName}\n住所：${form.billingAddress}\n担当者：${form.billingPerson}\n連絡先：${form.billingPhone}\n\n` +
        `【③申込内容】\n工事着工日：${form.startDate}\n工事完了日（落成日）：${form.completionDate}\n送電希望日：${form.powerAsap ? "最短日" : form.powerDate}\n電気方式：${form.electricType}\n契約容量：${form.capacity}A\n\n` +
        `【④引込線】\n引込柱NO：${poleNumbers.main}\n電柱〜引込位置の長さ：${form.poleLength}m\n引込点の高さ：${form.poleHeight}m\n\n` +
        `【メモ】\n${form.memo}`;
      await driveUploadFile("申込内容.txt", text, "text/plain", subFolderId, token);

      // 地図クリップ保存
      if (mapClipUrl) {
        const imgRes = await fetch(mapClipUrl);
        const imgBlob = await imgRes.blob();
        await driveUploadFile("地図クリップ.jpg", imgBlob, "image/jpeg", subFolderId, token);
      }

      // 写真アップロード
      for (const slot of photos) {
        if (slot.file) {
          await driveUploadFile(`${slot.label}.jpg`, slot.file, "image/jpeg", subFolderId, token);
        }
      }

      // 履歴に追加
      const selectedProject = projects.find(p => p.id === selectedProjectId);
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        date: new Date().toLocaleDateString('ja-JP'),
        poleName: poleNumbers.main || '未入力',
        needsName: form.needsName,
        address: form.needsAddress,
        projectName: selectedProject ? `[${selectedProject.project_number}] ${selectedProject.project_name}` : '案件未選択',
        appKind: form.appKind,
        voltageClass: form.voltageClass,
      };
      const newHistory = [newItem, ...history].slice(0, 20);
      setHistory(newHistory);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));

      setSaved(true);
    } catch (e: any) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const deleteHistory = (id: string) => {
    const updated = history.filter(h => h.id !== id);
    setHistory(updated);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
  };

  // セクション互換用（常時展開のため無効）
  const toggle = (_: string) => {};
  const openSection = "";

  // ─── UI ────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto pb-24 space-y-4 animate-in fade-in duration-300">
      {/* Google Identity Services 読み込み */}
      {typeof document !== "undefined" && !document.getElementById("gis-script") && (() => {
        const s = document.createElement("script");
        s.id = "gis-script";
        s.src = "https://accounts.google.com/gsi/client";
        s.async = true;
        document.head.appendChild(s);
        return null;
      })()}

      {/* ヘッダー */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-600 to-sky-500 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
              <FileText className="w-5 h-5" /> 東京電力 現場申込フォーム
            </h1>
            <p className="text-blue-100 text-xs mt-1">HITEC依頼用 | 入力内容は自動保存されます</p>
          </div>
          <div className="flex items-center gap-1 text-xs font-bold bg-white/20 rounded-full px-3 py-1">
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {isOnline ? "オンライン" : "オフライン"}
          </div>
        </div>
      </div>

      {/* 案件選択 — 検索コンボボックス */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1 mb-2">
          <FolderOpen className="w-3.5 h-3.5" /> 紐づけ案件
        </label>

        {/* 選択中表示 */}
        {selectedProject && !projectOpen && (
          <div
            className="mb-2 px-3 py-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg cursor-pointer"
            onClick={() => { setProjectOpen(true); setProjectSearch(""); }}
          >
            <p className="text-xs text-blue-500 font-bold">{selectedProject.project_number}</p>
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{selectedProject.project_name}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {[selectedProject.client_name, selectedProject.site_name].filter(Boolean).join(' / ')}
            </p>
          </div>
        )}

        {/* 検索インプット */}
        <div className="relative" ref={projectRef}>
          <input
            type="text"
            placeholder={selectedProject && !projectOpen ? "案件を変更..." : "案件番号・案件名・発注者・現場名で検索"}
            value={projectSearch}
            onFocus={() => setProjectOpen(true)}
            onChange={e => { setProjectSearch(e.target.value); setProjectOpen(true); }}
            className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
          />
          {projectOpen && (
            <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden">
              {/* 未選択オプション */}
              <button
                className="w-full text-left px-4 py-2.5 text-sm text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-100 dark:border-slate-800"
                onClick={() => { setSelectedProjectId(""); setProjectOpen(false); setProjectSearch(""); }}
              >
                == 未選択 ==
              </button>
              <ul className="max-h-64 overflow-y-auto divide-y divide-slate-50 dark:divide-slate-800">
                {filteredProjects.length === 0 ? (
                  <li className="px-4 py-6 text-sm text-slate-400 text-center">該当なし</li>
                ) : filteredProjects.map(p => (
                  <li key={p.id}>
                    <button
                      className={`w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors ${
                        p.id === selectedProjectId ? 'bg-blue-50 dark:bg-blue-900/20' : ''
                      }`}
                      onClick={() => { setSelectedProjectId(p.id); setProjectOpen(false); setProjectSearch(""); }}
                    >
                      <p className="text-xs text-slate-400 font-mono">{p.project_number}</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">{p.project_name}</p>
                      {(p.client_name || p.site_name) && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[p.client_name, p.site_name].filter(Boolean).join(' / ')}
                        </p>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {!selectedProject && (
          <p className="text-xs text-slate-400 mt-2">案件を選択すると保存時に紐づけされます</p>
        )}
      </div>

      {/* 申込区分：仮設/本設 ・ 低圧/高圧 */}
      <div className="bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-xl p-4 shadow-sm">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">申込区分（必須）</p>
        <div className="space-y-3">
          {/* 仮設/本設 */}
          <div className="flex gap-2">
            {(['仮設', '本設'] as const).map(kind => (
              <button
                key={kind}
                onClick={() => set('appKind', kind)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all ${
                  form.appKind === kind
                    ? kind === '仮設'
                      ? 'bg-amber-400 border-amber-500 text-white shadow-md'
                      : 'bg-emerald-500 border-emerald-600 text-white shadow-md'
                    : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                {kind === '仮設' ? '🟡 仮設' : '🟢 本設'}
              </button>
            ))}
          </div>
          {/* 低圧/高圧 */}
          <div className="flex gap-2">
            {(['低圧', '高圧'] as const).map(volt => (
              <button
                key={volt}
                onClick={() => set('voltageClass', volt)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-black border-2 transition-all ${
                  form.voltageClass === volt
                    ? volt === '低圧'
                      ? 'bg-sky-500 border-sky-600 text-white shadow-md'
                      : 'bg-rose-500 border-rose-600 text-white shadow-md'
                    : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800 dark:border-slate-700'
                }`}
              >
                {volt === '低圧' ? '🔵 低圧' : '🔴 高圧'}
              </button>
            ))}
          </div>
        </div>
        {/* 選択状態表示 */}
        <div className="mt-3 flex gap-2">
          <span className={`px-3 py-1 rounded-full text-xs font-black ${
            form.appKind === '仮設' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
          }`}>{form.appKind}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-black ${
            form.voltageClass === '低圧' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
          }`}>{form.voltageClass}</span>
          <span className="text-xs text-slate-400 self-center">← この内容で保存されます</span>
        </div>
      </div>

      {/* 過去の申請履歴 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <button
          onClick={() => setShowHistory(p => !p)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <span className="font-bold text-slate-800 dark:text-slate-100 text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" />
            過去の申請履歴
            {history.length > 0 && (
              <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 px-2 py-0.5 rounded-full font-bold">{history.length}件</span>
            )}
          </span>
          {showHistory ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {showHistory && (
          <div className="border-t border-slate-100 dark:border-slate-800">
            {history.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">まだ申請履歴がありません</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map(item => (
                  <li key={item.id} className="flex items-start justify-between px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-slate-400 mb-1">{item.date} | {item.projectName}</p>
                      <div className="flex gap-1.5 mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          item.appKind === '仮設' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>{item.appKind ?? '-'}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
                          item.voltageClass === '低圧' ? 'bg-sky-100 text-sky-700' : 'bg-rose-100 text-rose-700'
                        }`}>{item.voltageClass ?? '-'}</span>
                      </div>
                      <p className="font-bold text-sm text-slate-800 dark:text-slate-100">引込柱: {item.poleName}</p>
                      <p className="text-xs text-slate-500 truncate">{item.needsName} / {item.address}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={`https://drive.google.com/drive/folders/${PARENT_FOLDER_ID}`}
                        target="_blank" rel="noopener noreferrer"
                        className="p-1.5 text-blue-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Driveで確認"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                      <button
                        onClick={() => deleteHistory(item.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* ①契約需給先 */}
      <Section id="s1" title="① 契約需給先" open={openSection} toggle={toggle}>
        <Field label="名義" value={form.needsName} onChange={v => set("needsName", v)} placeholder="田中 一郎" />
        <Field label="需給箇所住所" value={form.needsAddress} onChange={v => set("needsAddress", v)} placeholder="東京都○○市○○1丁目1番地1" />
        <Field label="担当者" value={form.needsPerson} onChange={v => set("needsPerson", v)} placeholder="山田太郎" />
        <Field label="連絡先" value={form.needsPhone} onChange={v => set("needsPhone", v)} placeholder="090-0000-0000" type="tel" />
      </Section>

      {/* ②請求先 */}
      <Section id="s2" title="② 請求先及び連絡先" open={openSection} toggle={toggle}>
        <label className="flex items-center gap-2 cursor-pointer mb-3">
          <input type="checkbox" checked={form.billingSame} onChange={e => set("billingSame", e.target.checked)}
            className="w-4 h-4 accent-blue-600" />
          <span className="text-sm font-medium text-slate-600 dark:text-slate-400">①契約需給先と同じ</span>
        </label>
        <Field label="名義" value={form.billingName} onChange={v => set("billingName", v)} disabled={form.billingSame} />
        <Field label="住所" value={form.billingAddress} onChange={v => set("billingAddress", v)} disabled={form.billingSame} />
        <Field label="担当者" value={form.billingPerson} onChange={v => set("billingPerson", v)} disabled={form.billingSame} />
        <Field label="連絡先" value={form.billingPhone} onChange={v => set("billingPhone", v)} disabled={form.billingSame} type="tel" />
      </Section>

      {/* ③申込内容 */}
      <Section id="s3" title="③ 申込内容の確認" open={openSection} toggle={toggle}>
        <Field label="工事着工日" value={form.startDate} onChange={v => set("startDate", v)} type="date" />
        <Field label="工事完了日（落成日）" value={form.completionDate} onChange={v => set("completionDate", v)} type="date" />
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-slate-600 dark:text-slate-400">送電希望日</label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.powerAsap} onChange={e => set("powerAsap", e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-slate-600 dark:text-slate-400">最短日</span>
          </label>
          {!form.powerAsap && (
            <Field label="" value={form.powerDate} onChange={v => set("powerDate", v)} type="date" />
          )}
        </div>

        {/* 電灯申込 */}
        <div className="border border-blue-200 dark:border-blue-800 rounded-xl overflow-hidden">
          <label className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-900/20 cursor-pointer">
            <input type="checkbox" checked={form.hasDentou} onChange={e => set("hasDentou", e.target.checked)}
              className="w-4 h-4 accent-blue-600" />
            <span className="font-bold text-sm text-blue-700 dark:text-blue-300">⚡ 電灯申込</span>
          </label>
          {form.hasDentou && (
            <div className="px-4 pb-4 pt-3 space-y-3 border-t border-blue-100 dark:border-blue-800">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">電気方式</label>
                <select value={form.dentouType} onChange={e => set("dentouType", e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500">
                  <option>単相3線式100/200V</option>
                  <option>単相2線式100V</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">契約容量</label>
                <div className="flex gap-2">
                  <input type="number" min="0" value={form.dentouCapacity} onChange={e => set("dentouCapacity", e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                    placeholder="例：50" />
                  <div className="flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-sm font-medium">
                    {(['A', 'kVA'] as const).map(unit => (
                      <button key={unit} type="button" onClick={() => set("dentouCapacityUnit", unit)}
                        className={`px-3 py-2.5 transition-colors ${form.dentouCapacityUnit === unit ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}>
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 動力申込 */}
        <div className="border border-orange-200 dark:border-orange-800 rounded-xl overflow-hidden">
          <label className="flex items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-900/20 cursor-pointer">
            <input type="checkbox" checked={form.hasDouryoku} onChange={e => set("hasDouryoku", e.target.checked)}
              className="w-4 h-4 accent-orange-600" />
            <span className="font-bold text-sm text-orange-700 dark:text-orange-300">⚡ 動力申込</span>
          </label>
          {form.hasDouryoku && (
            <div className="px-4 pb-4 pt-3 space-y-3 border-t border-orange-100 dark:border-orange-800">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">電気方式</label>
                <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-400">
                  三相3線式200V（固定）
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">契約容量</label>
                <div className="flex gap-2">
                  <input type="number" min="0" step="0.1" value={form.douryokuCapacity} onChange={e => set("douryokuCapacity", e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm font-medium focus:ring-2 focus:ring-blue-500"
                    placeholder="例：3" />
                  <div className="flex rounded-lg border border-slate-300 dark:border-slate-600 overflow-hidden text-sm font-medium">
                    {(['A', 'kVA'] as const).map(unit => (
                      <button key={unit} type="button" onClick={() => set("douryokuCapacityUnit", unit)}
                        className={`px-3 py-2.5 transition-colors ${form.douryokuCapacityUnit === unit ? 'bg-orange-500 text-white' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50'}`}>
                        {unit}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {!form.hasDentou && !form.hasDouryoku && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3.5 h-3.5" />電灯または動力を少なくとも一つ選択してください
          </p>
        )}
      </Section>

      {/* ④引込線 */}
      <Section id="s4" title="④ 引込線について" open={openSection} toggle={toggle}>
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">引込柱NO（当該柱）</label>
          <div className="px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300">
            {poleNumbers.main || <span className="text-slate-400 dark:text-slate-500">電柱位置マップの当該柱から自動入力</span>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="電柱〜引込位置の長さ（m）" value={form.poleLength} onChange={v => set("poleLength", v)} type="number" placeholder="15" />
          <Field label="引込点の高さ（m）" value={form.poleHeight} onChange={v => set("poleHeight", v)} type="number" placeholder="4" />
        </div>
      </Section>

      {/* 電柱位置マップ */}
      <Section id="s5" title="📍 電柱位置マップ（3ピン）" open={openSection} toggle={toggle}>
        <div className="space-y-3">
          {locError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {locError}
            </div>
          )}

          {/* GPS：現在地にマップを移動するだけ */}
          <button
            onClick={moveToCurrentLocation}
            disabled={poleCapturing}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {poleCapturing
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 取得中...</>
              : <><MapPin className="w-3.5 h-3.5" /> 現在地にマップを移動</>}
          </button>

          {/* モード選択：3本とも地図タップで配置 */}
          <div className="space-y-2">
            <div className="flex gap-2">
              {([
                { key: 'main' as PoleKey, label: '🔴 当該柱', active: 'bg-red-500 border-red-500 text-white shadow-md', inactive: 'bg-red-50 border-red-200 text-red-700' },
                { key: 'right' as PoleKey, label: '🔵 右柱', active: 'bg-blue-500 border-blue-500 text-white shadow-md', inactive: 'bg-blue-50 border-blue-200 text-blue-700' },
                { key: 'left' as PoleKey, label: '🟢 左柱', active: 'bg-green-500 border-green-500 text-white shadow-md', inactive: 'bg-green-50 border-green-200 text-green-700' },
                { key: 'service' as PoleKey, label: '⚡ 引込柱', active: 'bg-amber-500 border-amber-500 text-white shadow-md', inactive: 'bg-amber-50 border-amber-200 text-amber-700' },
              ]).map(({ key, label, active, inactive }) => (
                <button key={key} onClick={() => setPlacingMode(key)}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${placingMode === key ? active : inactive}`}
                >
                  {label}{poleLocations[key] && <span className="ml-1 opacity-80">✓</span>}
                </button>
              ))}
            </div>
            {/* 電柱番号入力（選択中のモードのみ表示） */}
            {([
              { key: 'main' as PoleKey, placeholder: '例: 千葉１２３４', ring: 'focus:ring-red-300 border-red-200', label: '当該柱' },
              { key: 'right' as PoleKey, placeholder: '例: 千葉１２３５', ring: 'focus:ring-blue-300 border-blue-200', label: '右柱' },
              { key: 'left' as PoleKey, placeholder: '例: 千葉１２３３', ring: 'focus:ring-green-300 border-green-200', label: '左柱' },
              { key: 'service' as PoleKey, placeholder: '例: 千葉１２３６', ring: 'focus:ring-amber-300 border-amber-200', label: '引込柱' },
            ]).map(({ key, placeholder, ring, label }) => placingMode === key && (
              <input
                key={key}
                id={`pole-num-${key}`}
                type="text"
                placeholder={`電柱番号（${label}）　${placeholder}`}
                value={poleNumbers[key]}
                onChange={e => setPoleNumbers(p => ({ ...p, [key]: e.target.value }))}
                className={`w-full px-3 py-2 text-sm border rounded-lg bg-white text-slate-800 focus:outline-none focus:ring-2 ${ring}`}
              />
            ))}
          </div>

          {/* インタラクティブマップ */}
          <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm relative">
            <div ref={mapDivRef} className="w-full h-72" />
            <div className="absolute top-2 left-2 pointer-events-none z-[999]">
              <span className={`inline-block px-2 py-1 rounded text-[11px] font-bold text-white shadow ${
                placingMode === 'main' ? 'bg-red-500' : placingMode === 'right' ? 'bg-blue-500' : 'bg-green-500'
              }`}>
                タップで{placingMode === 'main' ? '🔴当該柱' : placingMode === 'right' ? '🔵右柱' : '🟢左柱'}を置く
              </span>
            </div>
          </div>

          {/* 配置済み座標サマリ */}
          {(poleLocations.main || poleLocations.right || poleLocations.left || poleLocations.service) && (
            <div className="flex flex-col gap-1 text-[11px] font-mono text-slate-500">
              {poleLocations.main && <span className="bg-red-50 border border-red-100 rounded px-2 py-1">🔴 当該柱 {poleLocations.main.lat.toFixed(5)}, {poleLocations.main.lng.toFixed(5)}</span>}
              {poleLocations.right && <span className="bg-blue-50 border border-blue-100 rounded px-2 py-1">🔵 右柱 {poleLocations.right.lat.toFixed(5)}, {poleLocations.right.lng.toFixed(5)}</span>}
              {poleLocations.left && <span className="bg-green-50 border border-green-100 rounded px-2 py-1">🟢 左柱 {poleLocations.left.lat.toFixed(5)}, {poleLocations.left.lng.toFixed(5)}</span>}
              {poleLocations.service && <span className="bg-amber-50 border border-amber-100 rounded px-2 py-1">⚡ 引込柱 {poleLocations.service.lat.toFixed(5)}, {poleLocations.service.lng.toFixed(5)}</span>}
            </div>
          )}
        </div>
      </Section>

      {/* 写真撮影 */}
      <Section id="s6" title="📸 現場写真（5枚）" open={openSection} toggle={toggle}>
        <div className="space-y-3">
          {photos.map((slot) => (
            <div key={slot.id} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
              <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{slot.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{slot.desc}</p>
                </div>
                {slot.preview && (
                  <button onClick={() => delPhoto(slot.id)}
                    className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              {slot.preview ? (
                <img src={slot.preview} alt={slot.label} className="w-full max-h-64 object-cover" />
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 h-32 cursor-pointer hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors">
                  <Camera className="w-8 h-8 text-slate-300" />
                  <span className="text-sm text-slate-400 font-medium">タップして撮影 / 選択</span>
                  <input
                    type="file" accept="image/*" capture="environment"
                    className="hidden"
                    ref={el => { fileRefs.current[slot.id] = el; }}
                    onChange={e => onPhoto(slot.id, e)}
                  />
                </label>
              )}
            </div>
          ))}
        </div>
      </Section>

      {/* メモ */}
      <Section id="s7" title="📝 メモ・備考" open={openSection} toggle={toggle}>
        <textarea value={form.memo} onChange={e => set("memo", e.target.value)}
          rows={4} placeholder="自由記入欄"
          className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
      </Section>

      {/* 保存ボタン */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-t border-slate-200 dark:border-slate-800 px-4 py-3 flex gap-3 max-w-2xl mx-auto">
        {saveError && (
          <div className="absolute bottom-full left-0 right-0 px-4 pb-2">
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveError}</span>
              <button onClick={() => setSaveError(null)} className="ml-auto shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        )}
        {saved && (
          <div className="absolute bottom-full left-0 right-0 px-4 pb-2">
            <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-bold">
              <Check className="w-4 h-4" /> Google Driveへの保存が完了しました！
            </div>
          </div>
        )}
        <button
          onClick={saveToDrive}
          disabled={saving || !isOnline}
          className="flex-1 flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-xl shadow-sm transition-colors text-sm"
        >
          {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /> 保存中...</> : <><Save className="w-4 h-4" /> Google Driveに保存</>}
        </button>
        {!isOnline && <p className="text-xs text-slate-400 self-center">オフライン中はDrive保存できません。入力内容はローカルに保存中。</p>}
      </div>
    </div>
  );
}

// ─── サブコンポーネント ────────────────────────────────
// Section：常時展開（折りたたみなし）
function Section({ title, children }: {
  title: string; children: React.ReactNode;
  // 互換性のためid/open/toggleを受け取るが無視
  id?: string; open?: string; toggle?: (s: string) => void;
}) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
        <span className="font-bold text-slate-700 dark:text-slate-200 text-sm">{title}</span>
      </div>
      <div className="px-5 py-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", disabled = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</label>
      <input
        type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder} disabled={disabled}
        className="w-full px-3 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-medium focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 disabled:bg-slate-50 dark:disabled:bg-slate-900 transition-colors placeholder:text-slate-300"
      />
    </div>
  );
}
