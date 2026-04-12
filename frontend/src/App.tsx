// src/App.js
import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/login";
import AppShell from "./components/AppShell";
import Dashboard from "./pages/dashboard";
import BookingPage from "./pages/BookingPage";
import ReportsPage from "./pages/reports";
import ConfigurationPage from "./pages/configuration";
import UsersPage from "./pages/UsersPage";
import TeamsPage from "./pages/TeamsPage";
import ScannerPage from "./pages/ScannerPage";
import VerifyPage from "./pages/VerifyPage";
import ScanHistoryPage from "./pages/ScanHistoryPage";
import TicketsPage from "./pages/TicketsPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LicensePage from "./pages/LicensePage";
import AuditLogsPage from "./pages/AuditLogsPage";
import PermissionGuard, { getFirstPermittedRoute } from "./components/PermissionGuard";
import { Permissions } from "./services/api";

function getRole() {
  // Read role from localStorage, fallback to decoding JWT
  const stored = localStorage.getItem("role");
  if (stored) return stored;
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch { return null; }
}

function ProtectedRoute({ children }) {
  const token = localStorage.getItem("token");
  return token ? children : <Navigate to="/login" replace />;
}

function SuperAdminRoute({ children }) {
  const token = localStorage.getItem("token");
  if (!token) return <Navigate to="/login" replace />;
  const role = getRole();
  if (role !== "super_admin") return <Navigate to="/dashboard" replace />;
  return children;
}

/** Fetches user permissions and redirects to the first page they can access. */
function RoleRedirect() {
  const [target, setTarget] = useState<string | null>(null);
  const token = localStorage.getItem("token");
  const role = getRole();

  useEffect(() => {
    if (!token) { setTarget("/login"); return; }
    if (role === "super_admin") { setTarget("/dashboard"); return; }

    Permissions.getMine()
      .then((data) => {
        const perms = data.permissions || {};
        setTarget(getFirstPermittedRoute(role, Object.keys(perms).length > 0 ? perms : null));
      })
      .catch(() => {
        setTarget(getFirstPermittedRoute(role, null));
      });
  }, [token, role]);

  if (!target) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  return <Navigate to={target} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/" element={<RoleRedirect />} />

        {/* Main app shell (agent + admin) */}
        <Route
          element={
            <ProtectedRoute>
              <AppShell />
            </ProtectedRoute>
          }
        >
          <Route path="/dashboard" element={<PermissionGuard permission="dashboard"><Dashboard /></PermissionGuard>} />
          <Route path="/booking" element={<PermissionGuard permission="booking"><BookingPage /></PermissionGuard>} />
          <Route path="/reports" element={<PermissionGuard permission="reports"><ReportsPage /></PermissionGuard>} />
          <Route path="/tickets" element={<PermissionGuard permission="ticket_search"><TicketsPage /></PermissionGuard>} />
          <Route path="/scanner" element={<PermissionGuard permission="scanner"><ScannerPage /></PermissionGuard>} />
          <Route path="/verify/:ticketId" element={<VerifyPage />} />
          <Route path="/scan-history" element={<PermissionGuard permission="scan_history"><ScanHistoryPage /></PermissionGuard>} />
          <Route path="/configuration" element={<PermissionGuard permission="configuration"><ConfigurationPage /></PermissionGuard>} />
          <Route path="/users" element={<PermissionGuard permission="users"><UsersPage /></PermissionGuard>} />
          <Route path="/teams" element={<PermissionGuard permission="teams"><TeamsPage /></PermissionGuard>} />
          <Route path="/license" element={<PermissionGuard permission="license_overview"><LicensePage /></PermissionGuard>} />
          <Route path="/audit-logs" element={<SuperAdminRoute><AuditLogsPage /></SuperAdminRoute>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
