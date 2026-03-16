import { useState } from "react"
import { Outlet, NavLink } from "react-router-dom"
import { Users, Settings, Menu, Bell, ClipboardList, LayoutDashboard, FileText, CheckSquare, CalendarClock, CalendarDays, PieChart } from "lucide-react"
import { ThemeSwitcher } from "../ui/ThemeSwitcher"
import logoImg from "../../assets/logo.png"

export default function AppLayout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const getNavClass = ({ isActive }: { isActive: boolean }) => 
    `flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors relative ${
      isActive 
        ? "bg-primary/10 text-primary" 
        : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
            U
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
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            <NavLink to="/" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <LayoutDashboard className="w-5 h-5" />
                  ダッシュボード
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/projects" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <FileText className="w-5 h-5" />
                  案件管理
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/workers" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <Users className="w-5 h-5" />
                  作業員マスター
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/reports" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <ClipboardList className="w-5 h-5" />
                  日報管理
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/completion-reports" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <CheckSquare className="w-5 h-5" />
                  完了報告
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/tomorrow-schedules" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <CalendarClock className="w-5 h-5" />
                  翌日予定
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/schedule-management" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <CalendarDays className="w-5 h-5" />
                  工程管理
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/work-summary" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <PieChart className="w-5 h-5" />
                  作業集計管理
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/billing" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <FileText className="w-5 h-5" />
                  請求管理
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
            <NavLink to="/settings" className={getNavClass}>
              {({ isActive }) => (
                <>
                  <Settings className="w-5 h-5" />
                  設定
                  {isActive && <span className="absolute left-0 top-1 bottom-1 w-1 bg-primary rounded-r-md"></span>}
                </>
              )}
            </NavLink>
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
