import { Outlet, NavLink } from "react-router-dom";
import { useState, useEffect } from "react";
import { FolderOpen, Zap, Lightbulb, Network, List } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Project {
  id: string;
  project_name: string;
  project_number: string | null;
}

export default function ToolsLayout() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return localStorage.getItem('annkenn_active_project_id') || "";
  });

  useEffect(() => {
    if (selectedProjectId) {
      localStorage.setItem('annkenn_active_project_id', selectedProjectId);
    } else {
      localStorage.removeItem('annkenn_active_project_id');
    }
  }, [selectedProjectId]);



  useEffect(() => {
    supabase.from('projects')
      .select('id, project_name, project_number')
      .not('project_number', 'ilike', 'TEMP-%')
      .order('created_at', { ascending: false })
      .limit(300) // 過去の案件も紐付けるために最大300件程度取得
      .then(({ data }) => {
        if (data) {
          setProjects(data);
        }
      });
  }, []);

  const formatProjectName = (p: Project) => {
    return p.project_number ? `[${p.project_number}] ${p.project_name}` : p.project_name;
  };

  const navItems = [
    { name: "HOME (履歴一覧)", path: "/tools", icon: List, end: true },
    { name: "現場総合設計ポータル", path: "/tools/site-design", icon: Network },
    { name: "動力計算", path: "/tools/power-calc", icon: Zap },
    { name: "電灯計算", path: "/tools/lighting-calc", icon: Lightbulb },
  ];

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-950 pb-12">
      {/* ツール共通ヘッダー（タブ＆案件選択） */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex space-x-8 h-full">
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  end={item.end}
                  className={({ isActive }) =>
                    `inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium transition-colors ${
                      isActive
                        ? "border-blue-500 text-blue-600 dark:text-blue-400"
                        : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300"
                    }`
                  }
                >
                  <item.icon className="w-4 h-4 mr-2" />
                  {item.name}
                </NavLink>
              ))}
            </div>
            
            {/* 右側：案件連携セレクター */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <FolderOpen className="w-3.5 h-3.5" />
                紐づけ案件:
              </span>
              <select
                value={selectedProjectId}
                onChange={(e) => setSelectedProjectId(e.target.value)}
                className="text-sm rounded-md border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 py-1.5 pl-3 pr-8 shadow-sm focus:border-blue-500 focus:ring-blue-500 w-64 text-ellipsis overflow-hidden"
              >
                <option value="">== フリー（未紐付け） ==</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{formatProjectName(p)}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* コンテンツ描画エリア */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Outletには選択中のプロジェクトIDをContextとして渡す */}
        <Outlet context={{ selectedProjectId, setSelectedProjectId }} />
      </div>
    </div>
  );
}
