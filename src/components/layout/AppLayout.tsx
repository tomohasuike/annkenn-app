import { useState, useEffect } from "react"
import { Outlet, NavLink } from "react-router-dom"
import { Settings, Menu, Bell, ClipboardList, LayoutDashboard, FileText, CheckSquare, CalendarClock, CalendarDays, PieChart, ShieldAlert, Truck, FileSignature, Wrench } from "lucide-react"
import { ThemeSwitcher } from "../ui/ThemeSwitcher"
import logoImg from "../../assets/logo.png"
import { supabase } from "../../lib/supabase"

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [userInitial, setUserInitial] = useState("U");
  const [allowedApps, setAllowedApps] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [appMode, setAppMode] = useState<'core' | 'tools'>('core');

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user && user.email) {
          // Extract the first character of the name before @
          const namePart = user.email.split('@')[0];
          setUserInitial(namePart.charAt(0).toUpperCase());

        // Fetch user permissions
          supabase.from('worker_master').select('is_admin, allowed_apps').eq('email', user.email).single()
            .then(({ data, error }) => {
                if (!error && data) {
                    setIsAdmin(data.is_admin || false);
                    setAllowedApps(data.allowed_apps || ['dashboard', 'projects', 'reports', 'tomorrow-schedules', 'schedule-management', 'work-summary', 'completion-reports', 'workers']);
                } else {
                    // Default fallback if no record found yet
                    setAllowedApps(['dashboard', 'projects', 'reports', 'tomorrow-schedules', 'schedule-management', 'work-summary', 'completion-reports', 'workers']);
                }
            });
      }
    });
  }, []);

  const hasAccess = (appId: string) => allowedApps.includes(appId);

  const getNavClass = ({ isActive }: { isActive: boolean }) => 
    `flex items-center gap-4 px-5 py-3 text-[15px] font-medium transition-all relative group ${
      isActive 
        ? "text-blue-600" 
        : "text-slate-500 hover:text-slate-800 hover:bg-slate-50/80"
    }`

  return (
    <div className="h-screen w-full bg-background text-foreground flex flex-col overflow-hidden">
      {/* Full-width Top Header */}
      <header className="h-14 sm:h-16 shrink-0 flex items-center justify-between px-2 sm:px-6 border-b bg-card z-40 relative">
        <div className="flex items-center gap-1 sm:gap-4 overflow-hidden">
          <div className="flex items-center gap-1.5 sm:gap-2 mr-1 sm:mr-2 shrink-0">
            <img src={logoImg} alt="HITEC Logo" className="h-6 sm:h-8 w-auto object-contain drop-shadow-sm" />
            <div className="flex flex-col justify-center">
               <span className="font-extrabold text-xs sm:text-base leading-none tracking-wide bg-clip-text text-transparent bg-gradient-to-r from-primary to-blue-600">
                 HITEC
               </span>
               <span className="text-[0.5rem] sm:text-[0.6rem] font-bold text-muted-foreground tracking-widest mt-0.5 whitespace-nowrap">
                 ポータルサイト
               </span>
            </div>
          </div>
          <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-1 sm:p-2 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
              title="メニューの開閉"
          >
            <Menu className="w-5 h-5 sm:w-6 sm:h-6" />
          </button>
        </div>
        <div className="flex items-center gap-2 sm:gap-4 ml-auto shrink-0">
          <ThemeSwitcher />
          <button className="p-1.5 sm:p-2 rounded-full hover:bg-muted text-muted-foreground transition-colors relative">
            <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="absolute top-1 right-1 sm:top-1.5 sm:right-1.5 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-red-500 rounded-full"></span>
          </button>
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-xs sm:text-sm border-2 border-primary/30 ml-1">
            {userInitial}
          </div>
        </div>
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Overlay for mobile when sidebar is open */}
        {isSidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-20 xl:hidden md:hidden" 
            onClick={() => setIsSidebarOpen(false)}
          />
        )}
        
        {/* Sidebar */}
        <aside className={`border-r bg-card flex flex-col transition-all duration-300 ease-in-out z-30 ${
          isSidebarOpen 
            ? 'w-64 fixed inset-y-0 left-0 top-16 md:relative md:top-0 md:translate-x-0 translate-x-0' 
            : 'w-0 overflow-hidden md:w-0 md:border-r-0 fixed inset-y-0 left-0 top-16 md:relative md:top-0 -translate-x-full md:translate-x-0'
        }`}>
          
          <div className="p-3 border-b border-border/50">
            <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-1 flex items-center justify-between text-xs font-medium">
              <button 
                className={`flex-1 py-1.5 px-2 rounded-md transition-colors ${appMode === 'core' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                onClick={() => setAppMode('core')}
              >
                管理システム
              </button>
              <button 
                className={`flex-1 py-1.5 px-2 rounded-md transition-colors ${appMode === 'tools' ? 'bg-white dark:bg-slate-700 shadow-sm text-blue-600 dark:text-blue-400 font-bold' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                onClick={() => setAppMode('tools')}
              >
                現場ツール
              </button>
            </div>
          </div>

          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {appMode === 'tools' && (
              <>
                <NavLink to="/tools" className={getNavClass}>
                  {({ isActive }) => (
                    <>
                      <Wrench className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                      ツールポータル (案件選択)
                      {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                    </>
                  )}
                </NavLink>
              </>
            )}

            {appMode === 'core' && (
              <>
                {hasAccess('dashboard') && (
                <NavLink to="/" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <LayoutDashboard className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  ダッシュボード
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}

            {hasAccess('projects') && (
            <NavLink to="/projects" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <FileText className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  案件管理
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}

            {hasAccess('schedule-management') && (
            <NavLink to="/schedule-management" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <CalendarDays className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  工程管理
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {true && (
            <NavLink to="/attendance" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <ClipboardList className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  勤怠申告
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {hasAccess('reports') && (
            <NavLink to="/reports" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <ClipboardList className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  日報管理
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {hasAccess('tomorrow-schedules') && (
            <NavLink to="/tomorrow-schedules" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <CalendarClock className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  翌日予定
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {hasAccess('completion-reports') && (
            <NavLink to="/completion-reports" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <CheckSquare className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  完了報告
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {hasAccess('work-summary') && (
            <NavLink to="/work-summary" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <PieChart className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  作業集計管理
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {(hasAccess('attendance-admin') || isAdmin) && (
            <NavLink to="/attendance-admin" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <ClipboardList className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  勤怠管理
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {hasAccess('billing') && (
            <NavLink to="/billing" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <FileText className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  請求管理
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {hasAccess('vehicle-inspection') && (
            <NavLink to="/vehicle-inspection" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <Truck className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  車両点検
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {isAdmin && (
            <NavLink to="/settings" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <Settings className={`w-5 h-5 ${isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-700'}`} />
                  設定
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-blue-600 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}
            {hasAccess('safety-dashboard') && (
            <NavLink to="/safety-dashboard" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <ShieldAlert className={`w-5 h-5 ${isActive ? 'text-red-500' : 'text-red-400 group-hover:text-red-500'}`} />
                  安否確認ダッシュボード
                  {isActive && <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-red-500 rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            )}

            <a 
              href="/pdf-editor" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="flex items-center gap-4 px-5 py-3 text-[15px] font-medium transition-all relative group text-slate-500 hover:text-slate-800 hover:bg-slate-50/80"
              title="全画面のPDFエディタを別タブで開きます"
            >
              <FileSignature className="w-5 h-5 text-slate-500 group-hover:text-slate-700" />
              PDFエディタ
            </a>
              </>
            )}
          </nav>
        </aside>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto flex flex-col min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
