import { BrowserRouter, Routes, Route } from "react-router-dom"
import { Toaster } from 'sonner'
import AppLayout from "./components/layout/AppLayout"
import Dashboard from "./pages/Dashboard"
import Projects from "./pages/Projects"
import ProjectForm from "./components/projects/ProjectForm"
import ReportsList from "./pages/reports/ReportsList"
import ReportForm from "./pages/reports/ReportForm"
import CompletionReports from "./pages/CompletionReports"
import { CompletionReportForm } from "./pages/reports/CompletionReportForm"
import TomorrowSchedules from "./pages/TomorrowSchedules"
import TomorrowScheduleForm from "./pages/TomorrowScheduleForm"
import ScheduleManagement from "./pages/ScheduleManagement"
import Billing from "./pages/Billing"
import BillingForm from "./pages/BillingForm"
import WorkSummary from "./pages/work-summary/WorkSummary"
import SafetyReportForm from "./pages/SafetyReportForm"
import SafetyDashboard from "./pages/SafetyDashboard"
import Settings from './pages/Settings'
import VehicleInspection from "./pages/VehicleInspection"
import PdfEditor from "./pages/pdf-editor/PdfEditor"
import AttendanceAdmin from "./pages/attendance/AttendanceAdmin"
import WorkerAttendance from "./pages/attendance/WorkerAttendance"

import Login from "./pages/Login"
import ProtectedRoute from "./components/auth/ProtectedRoute"

import ToolsDashboard from "./pages/tools/ToolsDashboard"
import SiteDesignDashboard from "./pages/tools/SiteDesignDashboard"
import PowerCalc from "./pages/tools/PowerCalc"
import LightingCalc from "./pages/tools/LightingCalc"

function WorkersPlaceholder() {
  return <div className="p-8"><h2 className="text-xl font-bold">作業員マスター</h2></div>
}

function App() {
  return (
    <>
      <Toaster position="top-right" richColors />
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          {/* 安否確認フォーム (レイアウトなし・要認証) */}
          <Route element={<ProtectedRoute />}>
            <Route path="/safety-report" element={<SafetyReportForm />} />
            <Route path="/pdf-editor" element={<PdfEditor />} />
          </Route>
          
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="projects" element={<Projects />} />
              <Route path="projects/new" element={<ProjectForm />} />
              <Route path="projects/:id" element={<ProjectForm />} />
              <Route path="reports" element={<ReportsList />} />
              <Route path="reports/new" element={<ReportForm />} />
              <Route path="reports/:id" element={<ReportForm />} />
              <Route path="completion-reports" element={<CompletionReports />} />
              <Route path="completion-reports/new" element={<CompletionReportForm />} />
              <Route path="completion-reports/:id/edit" element={<CompletionReportForm />} />
              <Route path="tomorrow-schedules" element={<TomorrowSchedules />} />
              <Route path="tomorrow-schedules/new" element={<TomorrowScheduleForm />} />
              <Route path="tomorrow-schedules/:id" element={<TomorrowScheduleForm />} />
              <Route path="schedule-management" element={<ScheduleManagement />} />
              <Route path="billing" element={<Billing />} />
              <Route path="billing/new" element={<BillingForm />} />
              <Route path="billing/:id" element={<BillingForm />} />
              <Route path="work-summary" element={<WorkSummary />} />
              <Route path="attendance" element={<WorkerAttendance />} />
              <Route path="attendance-admin" element={<AttendanceAdmin />} />
              <Route path="workers" element={<WorkersPlaceholder />} />
              <Route path="safety-dashboard" element={<SafetyDashboard />} />
              <Route path="vehicle-inspection" element={<VehicleInspection />} />
              <Route path="settings" element={<Settings />} />

              {/* 現場用ツール群 */}
              <Route path="tools">
                <Route index element={<ToolsDashboard />} />
                <Route path=":projectId/site-design" element={<SiteDesignDashboard />} />
                <Route path=":projectId/power-calc" element={<PowerCalc />} />
                <Route path=":projectId/lighting-calc" element={<LightingCalc />} />
              </Route>
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </>
  )
}

export default App
