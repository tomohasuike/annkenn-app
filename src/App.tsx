import { BrowserRouter, Routes, Route } from "react-router-dom"
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

import Login from "./pages/Login"

function WorkersPlaceholder() {
  return <div className="p-8"><h2 className="text-xl font-bold">作業員マスター</h2></div>
}

function SettingsPlaceholder() {
  return <div className="p-8"><h2 className="text-xl font-bold">設定</h2></div>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        {/* 一時的にログイン制限を無効化 */}
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
          <Route path="completion-reports/:id" element={<CompletionReportForm />} />
          <Route path="tomorrow-schedules" element={<TomorrowSchedules />} />
          <Route path="tomorrow-schedules/new" element={<TomorrowScheduleForm />} />
          <Route path="tomorrow-schedules/:id" element={<TomorrowScheduleForm />} />
          <Route path="schedule-management" element={<ScheduleManagement />} />
          <Route path="billing" element={<Billing />} />
          <Route path="billing/new" element={<BillingForm />} />
          <Route path="billing/:id" element={<BillingForm />} />
          <Route path="work-summary" element={<WorkSummary />} />
          <Route path="workers" element={<WorkersPlaceholder />} />
          <Route path="settings" element={<SettingsPlaceholder />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
