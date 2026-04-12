import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Permissions } from "../services/api";
import { ShieldX } from "lucide-react";

const defaultPerms: Record<string, string[]> = {
  super_admin: [], // bypass — always allowed
  admin: [
    "dashboard", "booking", "ticket_search", "reports", "scanner",
    "scan_history", "configuration", "users", "teams", "license_overview",
  ],
  agent: ["dashboard", "booking", "ticket_search"],
  dock: ["scanner"],
};

// Ordered list: permission → route path. First match = landing page.
const permRouteOrder: { perm: string; path: string }[] = [
  { perm: "dashboard", path: "/dashboard" },
  { perm: "booking", path: "/booking" },
  { perm: "ticket_search", path: "/tickets" },
  { perm: "reports", path: "/reports" },
  { perm: "scanner", path: "/scanner" },
  { perm: "scan_history", path: "/scan-history" },
  { perm: "configuration", path: "/configuration" },
  { perm: "users", path: "/users" },
  { perm: "teams", path: "/teams" },
  { perm: "license_overview", path: "/license" },
  { perm: "license_management", path: "/license" },
  { perm: "audit_logs", path: "/audit-logs" },
];

function getRole() {
  const stored = localStorage.getItem("role");
  if (stored) return stored;
  const token = localStorage.getItem("token");
  if (!token) return null;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.role || null;
  } catch { return null; }
}

/** Returns the first route the user has permission to access. */
export function getFirstPermittedRoute(
  role: string | null,
  permissions: Record<string, boolean> | null
): string {
  if (role === "super_admin") return "/dashboard";

  for (const { perm, path } of permRouteOrder) {
    const hasDbPerms = permissions && Object.keys(permissions).length > 0;
    if (hasDbPerms && perm in permissions) {
      if (permissions[perm]) return path;
    } else {
      const defaults = defaultPerms[role || ""] || [];
      if (defaults.includes(perm)) return path;
    }
  }
  return "/login"; // No permission at all — send to login
}

export default function PermissionGuard({ permission, children }: { permission: string; children: ReactNode }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied">("loading");
  const [redirectTo, setRedirectTo] = useState<string | null>(null);
  const token = localStorage.getItem("token");
  const role = getRole();

  useEffect(() => {
    if (!token) { setStatus("denied"); return; }
    if (role === "super_admin") { setStatus("allowed"); return; }

    let cancelled = false;
    Permissions.getMine()
      .then((data) => {
        if (cancelled) return;
        const perms = data.permissions || {};
        const hasDbPerms = Object.keys(perms).length > 0;

        // If DB has this specific permission defined, use it.
        // Otherwise fall back to hardcoded defaults (handles permissions like
        // license_overview that aren't in the toggleable config page).
        const allowed = hasDbPerms && permission in perms
          ? !!perms[permission]
          : (defaultPerms[role || ""] || []).includes(permission);

        if (allowed) {
          setStatus("allowed");
        } else {
          // Find the first page they CAN access
          setRedirectTo(getFirstPermittedRoute(role, hasDbPerms ? perms : null));
          setStatus("denied");
        }
      })
      .catch(() => {
        if (cancelled) return;
        const defaults = defaultPerms[role || ""] || [];
        if (defaults.includes(permission)) {
          setStatus("allowed");
        } else {
          setRedirectTo(getFirstPermittedRoute(role, null));
          setStatus("denied");
        }
      });

    return () => { cancelled = true; };
  }, [token, role, permission]);

  if (!token) return <Navigate to="/login" replace />;

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="w-8 h-8 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (status === "denied") {
    // If we found a permitted page, redirect there silently
    if (redirectTo) {
      return <Navigate to={redirectTo} replace />;
    }
    // No permitted page at all — show access denied
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-3 text-center px-6">
          <div className="w-14 h-14 bg-rose-50 rounded-2xl flex items-center justify-center">
            <ShieldX className="w-7 h-7 text-rose-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-800">Access Denied</h2>
          <p className="text-sm text-slate-500 max-w-sm">
            You don't have permission to access this page. Contact your administrator to request access.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
