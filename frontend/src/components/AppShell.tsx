import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { Auth, Permissions, Settings as SettingsApi } from "../services/api";
import {
  Home,
  Ticket,
  Search,
  BarChart3,
  QrCode,
  ClipboardList,
  Settings,
  Users,
  UsersRound,
  LogOut,
  Menu,
  X,
  Ship,
  Bell,
  Command,
  ChevronRight,
  Key,
  ShieldCheck,
  Database,
} from "lucide-react";

/* ─── Brand Ship SVG ─── */

const BrandShipSvg = ({ className = "w-5 h-5 text-white" }: { className?: string }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M20 21c-1.39 0-2.78-.47-4-1.32-2.44 1.71-5.56 1.71-8 0C6.78 20.53 5.39 21 4 21H2v2h2c1.38 0 2.74-.35 4-.99 2.52 1.29 5.48 1.29 8 0 1.26.65 2.62.99 4 .99h2v-2h-2zM3.95 19H4c1.6 0 3.02-.88 4-2 .98 1.12 2.4 2 4 2s3.02-.88 4-2c.98 1.12 2.4 2 4 2h.05l1.89-6.68c.08-.26.06-.54-.06-.78s-.34-.42-.6-.5L20 10.62V6c0-1.1-.9-2-2-2h-3V1H9v3H6c-1.1 0-2 .9-2 2v4.62l-1.29.42a1.007 1.007 0 00-.66 1.28L3.95 19zM6 6h12v3.97L12 8 6 9.97V6z" />
  </svg>
);

/* ─── Navigation Configuration ─── */

const allNavItems = {
  dashboard: { label: "Dashboard", to: "/dashboard", icon: Home, perm: "dashboard" },
  booking: { label: "Booking", to: "/booking", icon: Ticket, perm: "booking" },
  tickets: { label: "Ticket Search", to: "/tickets", icon: Search, perm: "ticket_search" },
  reports: { label: "Reports", to: "/reports", icon: BarChart3, perm: "reports" },
  scanner: { label: "Scanner", to: "/scanner", icon: QrCode, perm: "scanner" },
  scanHistory: { label: "Scan History", to: "/scan-history", icon: ClipboardList, perm: "scan_history" },
  configuration: { label: "Configuration", to: "/configuration", icon: Settings, perm: "configuration" },
  users: { label: "Users", to: "/users", icon: Users, perm: "users" },
  teams: { label: "Teams", to: "/teams", icon: UsersRound, perm: "teams" },
  licenseOverview: { label: "License Overview", to: "/license", icon: Key, perm: "license_overview" },
  licenseManagement: { label: "License Management", to: "/license", icon: Key, perm: "license_management" },
  auditLogs: { label: "Audit Logs", to: "/audit-logs", icon: ShieldCheck, perm: "audit_logs" },
};

type NavItem = (typeof allNavItems)[keyof typeof allNavItems];

function getNavSections(role: string, permissions: Record<string, boolean>) {
  const has = (perm: string) => {
    if (role === "super_admin") return true;
    if (permissions && Object.keys(permissions).length > 0) return !!permissions[perm];
    if (role === "dock") return perm === "scanner";
    if (role === "agent") return ["dashboard", "booking", "ticket_search"].includes(perm);
    if (role === "admin") return perm !== "license_management";
    return perm === "dashboard";
  };

  const isSuperAdmin = role === "super_admin";
  const isAdminOnly = role === "admin";
  const main = [allNavItems.dashboard, allNavItems.booking].filter(i => has(i.perm));
  const ops = [allNavItems.tickets, allNavItems.reports, allNavItems.scanner].filter(i => has(i.perm));
  const adminItems = [allNavItems.configuration, allNavItems.users, allNavItems.teams, allNavItems.scanHistory].filter(i => has(i.perm));
  // Admin gets a read-only summary "License Overview"
  if (isAdminOnly) adminItems.push(allNavItems.licenseOverview);
  // Super admin gets full "License Management" + audit logs in their own section
  const superAdmin = isSuperAdmin ? [allNavItems.licenseManagement, allNavItems.auditLogs] : [];

  const sections: { label: string; items: NavItem[] }[] = [];
  if (main.length > 0) sections.push({ label: "NAVIGATION", items: main });
  if (ops.length > 0) sections.push({ label: "OPERATIONS", items: ops });
  if (adminItems.length > 0) sections.push({ label: "ADMIN", items: adminItems });
  if (superAdmin.length > 0) sections.push({ label: "SUPER ADMIN", items: superAdmin });
  return sections;
}

/* ─── Breadcrumb Helper ─── */

const breadcrumbMap: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/booking": "Booking",
  "/tickets": "Ticket Search",
  "/reports": "Reports",
  "/scanner": "Scanner",
  "/scan-history": "Scan History",
  "/configuration": "Configuration",
  "/users": "Users",
  "/teams": "Teams",
};

function getBreadcrumb(pathname: string) {
  if (breadcrumbMap[pathname]) return breadcrumbMap[pathname];
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return "Home";
  return segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");
}

/* ─── Role Badge ─── */

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    super_admin: "bg-rose-100 text-rose-700",
    admin: "bg-amber-100 text-amber-700",
    agent: "bg-violet-100 text-violet-700",
    dock: "bg-blue-100 text-blue-700",
  };
  const labels: Record<string, string> = { super_admin: "Super Admin", admin: "Admin", agent: "Agent", dock: "Dock" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${styles[role] || "bg-slate-100 text-slate-600"}`}>
      {labels[role] || role}
    </span>
  );
}

/* ─── Profile Dropdown (portaled) ─── */

function ProfileDropdown({ me, onLogout, onClose, anchorRef, anchorRef2, anchorRefMobile }: any) {
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useEffect(() => {
    // Pick the first anchor whose element is actually visible (not display:none)
    const pickVisible = (ref: any) => {
      const el = ref?.current;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return null;
      return r;
    };
    const mobileRect = pickVisible(anchorRefMobile);
    if (mobileRect) {
      setPos({ top: mobileRect.bottom + 8, right: window.innerWidth - mobileRect.right });
      return;
    }
    const rect1 = pickVisible(anchorRef);
    if (rect1) {
      setPos({ top: rect1.bottom + 8, right: window.innerWidth - rect1.right });
      return;
    }
    const rect2 = pickVisible(anchorRef2);
    if (rect2) {
      setPos({ top: rect2.top - 8, right: window.innerWidth - rect2.right });
    }
  }, [anchorRef, anchorRef2, anchorRefMobile]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDropdown = dropdownRef.current?.contains(target);
      const inAnchor1 = anchorRef.current?.contains(target);
      const inAnchor2 = anchorRef2?.current?.contains(target);
      const inAnchorMobile = anchorRefMobile?.current?.contains(target);
      if (!inDropdown && !inAnchor1 && !inAnchor2 && !inAnchorMobile) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose, anchorRef, anchorRef2, anchorRefMobile]);

  const displayName = me?.first_name ? `${me.first_name} ${me.last_name || ''}`.trim() : me?.email;

  return createPortal(
    <div
      ref={dropdownRef}
      className="fixed z-50 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-fade-in"
      style={{ top: pos.top, right: pos.right }}
    >
      <div className="px-4 py-3.5 border-b border-slate-100">
        <p className="text-[13px] font-semibold text-slate-800 truncate">{displayName}</p>
        {me?.first_name && <p className="text-[11px] text-slate-400 truncate mt-0.5">{me?.email}</p>}
        <div className="mt-1.5"><RoleBadge role={me?.role} /></div>
      </div>
      <div className="p-1.5">
        <button
          onClick={() => { onClose(); onLogout(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] text-rose-600 hover:bg-rose-50 rounded-xl transition-colors font-medium"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>,
    document.body
  );
}

/* ─── Main AppShell Component ─── */

export default function AppShell() {
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [userPermissions, setUserPermissions] = useState<Record<string, boolean>>({});
  const profileRef = useRef<HTMLButtonElement>(null);
  const profileRef2 = useRef<HTMLButtonElement>(null);
  const profileRefMobile = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  // Detect instance from URL path — /test/dashboard → "test", /dashboard → null (production)
  const instanceFromPath = (() => {
    const parts = location.pathname.split("/").filter(Boolean);
    const frontendRoutes = ["dashboard", "booking", "tickets", "reports", "scanner", "scan-history",
      "configuration", "users", "teams", "license", "audit-logs", "login", "reset-password", "verify"];
    if (parts.length > 0 && !frontendRoutes.includes(parts[0])) return parts[0];
    return null;
  })();

  useEffect(() => {
    async function load() {
      try {
        const { user } = await Auth.me();
        setMe(user);
        try {
          const permData = await Permissions.getMine();
          setUserPermissions(permData.permissions || {});
        } catch { /* permissions endpoint may not exist yet */ }
        // Load theme color from backend (use public endpoint so all roles get it)
        try {
          const settingsData = await SettingsApi.getPublicSettings();
          const savedColor = settingsData.settings?.primary_color;
          if (savedColor && /^#[0-9a-fA-F]{6}$/.test(savedColor)) {
            localStorage.setItem('theme_primary_color', savedColor);
            // Apply theme
            const r = parseInt(savedColor.slice(1,3),16)/255, g = parseInt(savedColor.slice(3,5),16)/255, b = parseInt(savedColor.slice(5,7),16)/255;
            const max = Math.max(r,g,b), min = Math.min(r,g,b);
            let h = 0; const l = (max+min)/2; let s = 0;
            if (max !== min) { const d = max-min; s = l>0.5?d/(2-max-min):d/(max+min); if(max===r)h=((g-b)/d+(g<b?6:0))/6; else if(max===g)h=((b-r)/d+2)/6; else h=((r-g)/d+4)/6; }
            h *= 360; s *= 100;
            const toHex = (h:number,s:number,l:number) => { s/=100;l/=100;const a=s*Math.min(l,1-l);const f=(n:number)=>{const k=(n+h/30)%12;return l-a*Math.max(Math.min(k-3,9-k,1),-1);};return'#'+[f(0),f(8),f(4)].map(v=>Math.round(v*255).toString(16).padStart(2,'0')).join(''); };
            const shades: Record<string,number> = {'50':97,'100':93,'200':85,'300':72,'400':60,'500':50,'600':42,'700':34,'800':26,'900':18,'950':12};
            const caps: Record<string,number> = {'50':100,'100':95,'200':90,'300':85,'400':80,'500':75,'600':72,'700':70,'800':65,'900':60,'950':55};
            Object.entries(shades).forEach(([k,lv]) => { document.documentElement.style.setProperty(`--color-violet-${k}`, toHex(h, Math.min(s,caps[k]),lv)); });
          }
        } catch { /* settings may not have primary_color */ }
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("role");
        navigate("/login");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [navigate]);

  useEffect(() => {
    setSidebarOpen(false);
    setProfileOpen(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-14 h-14 bg-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
            <BrandShipSvg className="w-7 h-7 text-violet-400" />
          </div>
          <div className="flex flex-col items-center gap-1">
            <span className="text-base font-semibold text-slate-800">Goundar Shipping</span>
            <span className="text-[12px] text-slate-400 font-medium">Loading your workspace...</span>
          </div>
        </div>
      </div>
    );
  }

  const navSections = getNavSections(me?.role, userPermissions);

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("role");
    navigate("/login");
  };

  const displayName = me?.first_name && me?.last_name
    ? `${me.first_name} ${me.last_name}`
    : me?.first_name || me?.email?.split("@")[0] || "User";

  const initials = me?.first_name
    ? `${me.first_name[0]}${(me.last_name || '')[0] || ''}`.toUpperCase()
    : displayName.charAt(0).toUpperCase();

  const sidebarW = isCollapsed ? "lg:w-[68px]" : "lg:w-[272px]";
  const contentPl = isCollapsed ? "lg:pl-[68px]" : "lg:pl-[272px]";

  // Dock role gets a minimal, fullscreen app-like layout (no sidebar, no drawers)
  const isDock = me?.role === "dock";

  // Flatten all nav items for mobile bottom tab bar (up to 4 primary + "More" tab)
  const allItemsFlat = navSections.flatMap(s => s.items);
  const primaryMobileItems = allItemsFlat.slice(0, 4);
  const hasMore = allItemsFlat.length > 4;

  if (isDock) {
    // ═══════ DOCK ROLE: Fullscreen app layout ═══════
    return (
      <div className="bg-slate-50 relative" style={{ minHeight: '100dvh' }}>
        {/* Modern floating top bar — glass, rounded, respects iOS safe area */}
        <div
          className="fixed top-0 left-0 right-0 z-40 px-3"
          style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}
        >
          <div
            className="mx-auto max-w-3xl flex items-center justify-between h-14 px-4 rounded-2xl backdrop-blur-xl"
            style={{
              backgroundColor: 'rgba(255,255,255,0.85)',
              border: '1px solid rgba(226,232,240,0.8)',
              boxShadow: '0 8px 24px -8px rgba(15,23,42,0.12)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{
                  backgroundImage: 'linear-gradient(135deg, var(--color-violet-500) 0%, var(--color-violet-600) 100%)',
                  boxShadow: '0 4px 12px -4px color-mix(in srgb, var(--color-violet-600) 50%, transparent)',
                }}
              >
                <QrCode className="w-[18px] h-[18px] text-white" strokeWidth={2.25} />
              </div>
              <div>
                <p className="text-[13px] font-bold text-slate-900 leading-tight">Dock Scanner</p>
                <p className="text-[10px] text-slate-500 leading-tight">{displayName}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-50 transition-all"
              title="Sign out"
            >
              <LogOut className="w-[17px] h-[17px]" />
            </button>
          </div>
        </div>

        <main
          className="flex flex-col items-stretch justify-center w-full"
          style={{
            minHeight: '100dvh',
            paddingTop: 'calc(max(12px, env(safe-area-inset-top)) + 68px)',
            paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
          }}
        >
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ═══ MOBILE: Modern floating top bar (glass) ═══ */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 px-3 pt-3">
        <div
          className="flex items-center justify-between h-14 px-3 rounded-2xl backdrop-blur-xl"
          style={{
            backgroundColor: 'rgba(255,255,255,0.85)',
            border: '1px solid rgba(226,232,240,0.8)',
            boxShadow: '0 8px 24px -8px rgba(15,23,42,0.1)',
          }}
        >
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                backgroundImage: 'linear-gradient(135deg, var(--color-violet-500) 0%, var(--color-violet-600) 100%)',
                boxShadow: '0 4px 12px -4px color-mix(in srgb, var(--color-violet-600) 50%, transparent)',
              }}
            >
              <BrandShipSvg className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-[13px] font-bold text-slate-900 leading-tight">Goundar Shipping</p>
              <p className="text-[10px] text-slate-500 leading-tight">{getBreadcrumb(location.pathname)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate("/tickets")}
              className="w-9 h-9 flex items-center justify-center text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-100/70 transition-colors"
              title="Search"
            >
              <Search className="w-[17px] h-[17px]" />
            </button>
            <button
              onClick={() => setProfileOpen(!profileOpen)}
              ref={profileRefMobile}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{
                backgroundImage: 'linear-gradient(135deg, var(--color-violet-500) 0%, var(--color-violet-600) 100%)',
              }}
            >
              <span className="text-white font-semibold text-[11px]">{initials}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ═══ MOBILE: Backdrop for "More" drawer ═══ */}
      {sidebarOpen && <div className="lg:hidden fixed inset-0 bg-black/40 backdrop-blur-sm z-40 animate-fade-in" onClick={() => setSidebarOpen(false)} />}

      {/* ═══ MOBILE: Bottom sheet "More" drawer ═══ */}
      <div
        className={`lg:hidden fixed inset-x-0 bottom-0 z-50 transform transition-transform duration-300 ease-out ${sidebarOpen ? "translate-y-0" : "translate-y-full"}`}
      >
        <div className="bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col">
          {/* Drag handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 bg-slate-300 rounded-full" />
          </div>
          <div className="flex items-center justify-between px-5 pt-2 pb-3">
            <h2 className="text-[17px] font-bold text-slate-900">Menu</h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="w-8 h-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <nav className="flex-1 overflow-y-auto px-4 pb-4">
            {navSections.map((section, sIdx) => (
              <div key={section.label} className={sIdx > 0 ? "mt-5" : ""}>
                <p className="px-2 mb-2 text-[10px] font-bold text-slate-400 uppercase tracking-[0.08em]">{section.label}</p>
                <div className="grid grid-cols-4 gap-2">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const isActive = location.pathname === item.to;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setSidebarOpen(false)}
                        className="flex flex-col items-center gap-1.5 p-2.5 rounded-2xl transition-all active:scale-95"
                        style={{
                          backgroundColor: isActive
                            ? 'color-mix(in srgb, var(--color-violet-500) 10%, white)'
                            : '#f8fafc',
                        }}
                      >
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center"
                          style={{
                            backgroundImage: isActive
                              ? 'linear-gradient(135deg, var(--color-violet-500) 0%, var(--color-violet-600) 100%)'
                              : undefined,
                            backgroundColor: isActive ? undefined : 'white',
                            border: isActive ? undefined : '1px solid #e2e8f0',
                            color: isActive ? 'white' : '#64748b',
                            boxShadow: isActive
                              ? '0 4px 12px -4px color-mix(in srgb, var(--color-violet-600) 45%, transparent)'
                              : undefined,
                          }}
                        >
                          <Icon className="w-[18px] h-[18px]" />
                        </div>
                        <span
                          className="text-[10px] font-semibold text-center leading-tight line-clamp-2"
                          style={{ color: isActive ? 'var(--color-violet-700)' : '#475569' }}
                        >
                          {item.label}
                        </span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
          {/* User footer */}
          <div className="border-t border-slate-100 px-5 py-3 flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{
                backgroundImage: 'linear-gradient(135deg, var(--color-violet-500) 0%, var(--color-violet-600) 100%)',
              }}
            >
              <span className="text-white font-semibold text-[12px]">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-slate-800 truncate">{displayName}</p>
              <RoleBadge role={me?.role} />
            </div>
            <button
              onClick={handleLogout}
              className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
          {/* Bottom safe area */}
          <div className="h-[env(safe-area-inset-bottom,0px)]" />
        </div>
      </div>

      {/* ═══ MOBILE: Bottom Tab Bar ═══ */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 px-3 pb-3">
        <div
          className="flex items-center justify-around h-[62px] px-2 rounded-2xl backdrop-blur-xl"
          style={{
            backgroundColor: 'rgba(255,255,255,0.9)',
            border: '1px solid rgba(226,232,240,0.8)',
            boxShadow: '0 -8px 24px -8px rgba(15,23,42,0.12)',
          }}
        >
          {primaryMobileItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.to;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className="flex flex-col items-center justify-center flex-1 gap-0.5 h-full rounded-xl transition-all active:scale-90"
              >
                <div
                  className="w-10 h-[26px] rounded-full flex items-center justify-center transition-all"
                  style={{
                    backgroundColor: isActive
                      ? 'color-mix(in srgb, var(--color-violet-500) 15%, transparent)'
                      : 'transparent',
                  }}
                >
                  <Icon
                    className="w-[18px] h-[18px] transition-colors"
                    style={{ color: isActive ? 'var(--color-violet-600)' : '#64748b' }}
                  />
                </div>
                <span
                  className="text-[9px] font-semibold transition-colors leading-none"
                  style={{ color: isActive ? 'var(--color-violet-700)' : '#64748b' }}
                >
                  {item.label.split(' ')[0]}
                </span>
              </NavLink>
            );
          })}
          {hasMore && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center flex-1 gap-0.5 h-full rounded-xl transition-all active:scale-90"
            >
              <div className="w-10 h-[26px] rounded-full flex items-center justify-center">
                <Menu className="w-[18px] h-[18px] text-slate-500" />
              </div>
              <span className="text-[9px] font-semibold text-slate-500 leading-none">More</span>
            </button>
          )}
        </div>
      </div>

      {/* ═══ DESKTOP: Single Sidebar ═══ */}
      <div
        className={`hidden lg:fixed lg:inset-y-0 lg:left-0 lg:flex lg:flex-col z-30 bg-white border-r border-slate-200 ${sidebarW}`}
        style={{ transition: "width 350ms cubic-bezier(0.32, 0.72, 0, 1)" }}
      >
        <div className="flex flex-col h-full overflow-hidden">

          {/* ── Top: Logo row ── */}
          <div className={`flex items-center h-[52px] flex-shrink-0 mt-3 ${isCollapsed ? "justify-center px-3" : "px-5 gap-3"}`}>
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="w-[38px] h-[38px] bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0 hover:bg-slate-800 transition-colors cursor-pointer"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <BrandShipSvg className="w-[18px] h-[18px] text-violet-400" />
            </button>
            {!isCollapsed && (
              <>
                <h1 className="text-[15px] font-bold text-slate-900 truncate">Goundar Shipping</h1>
                <button
                  onClick={() => setIsCollapsed(true)}
                  className="ml-auto w-7 h-7 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:border-slate-300 transition-colors flex-shrink-0"
                  title="Collapse sidebar"
                >
                  <Menu className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>

          {/* ── Instance Badge (hidden for production) ── */}
          {instanceFromPath && (
            <div className={isCollapsed ? "flex justify-center px-3 pb-1" : "px-4 pb-2"}>
              {isCollapsed ? (
                <div
                  className="w-[40px] h-[24px] rounded-full flex items-center justify-center text-[8px] font-black uppercase text-white bg-amber-500"
                  title={instanceFromPath}
                >
                  {instanceFromPath.slice(0, 3)}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white text-center bg-amber-500">
                  <Database className="w-3 h-3 flex-shrink-0" />
                  <span className="uppercase tracking-wider">{instanceFromPath}</span>
                </div>
              )}
            </div>
          )}

          {/* ── Search ── */}
          <div className={isCollapsed ? "flex justify-center py-1.5 px-3" : "px-4 pb-2"}>
            {isCollapsed ? (
              <button
                onClick={() => navigate("/tickets")}
                className="w-[40px] h-[40px] rounded-xl flex items-center justify-center text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all"
                title="Search tickets"
              >
                <Search className="w-5 h-5" />
              </button>
            ) : (
              <div className="relative cursor-pointer" onClick={() => navigate("/tickets")}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-[15px] h-[15px] text-slate-400" />
                <input type="text" placeholder="Search tickets..." readOnly className="w-full pl-9 pr-10 py-[9px] bg-slate-50 border border-slate-200 rounded-xl text-[13px] text-slate-700 placeholder-slate-400 cursor-pointer hover:border-slate-300 transition-all" />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <kbd className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-md bg-white border border-slate-200 text-[11px] font-medium text-slate-400 shadow-sm">/</kbd>
                </div>
              </div>
            )}
          </div>

          {/* ── Navigation ── */}
          <nav className={`flex-1 overflow-y-auto ${isCollapsed ? "px-[14px]" : "px-3"} py-2`}>
            {navSections.map((section, sIdx) => (
              <div key={section.label}>
                {/* Section label or divider */}
                {!isCollapsed ? (
                  <p className={`px-3 mb-[4px] ${sIdx > 0 ? "mt-3" : ""} text-[10px] font-semibold text-slate-400 uppercase tracking-[0.08em]`}>{section.label}</p>
                ) : (
                  sIdx > 0 && <div className="mb-2 mt-1 border-t border-slate-100" />
                )}
                <div className={isCollapsed ? "flex flex-col items-center gap-0.5" : "space-y-[1px]"}>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    if (isCollapsed) {
                      return (
                        <NavLink key={item.to} to={item.to} title={item.label}
                          className={({ isActive }) =>
                            `flex items-center justify-center w-[36px] h-[36px] rounded-xl transition-all duration-150 ${
                              isActive ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"
                            }`
                          }>
                          <Icon className="w-[18px] h-[18px]" />
                        </NavLink>
                      );
                    }
                    return (
                      <NavLink key={item.to} to={item.to}
                        className={({ isActive }) =>
                          `flex items-center gap-2.5 h-[34px] px-3 rounded-lg text-[13px] font-medium transition-all duration-150 ${
                            isActive ? "bg-slate-100 text-slate-900" : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                          }`
                        }>
                        <Icon className="w-[18px] h-[18px] flex-shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* ── Bottom: Gradient Card (expanded only) ── */}
          {!isCollapsed && (
            <div className="px-4 pb-3 flex-shrink-0">
              <div className="rounded-2xl p-4 relative overflow-hidden bg-gradient-to-br from-violet-600 via-violet-500 to-violet-600">
                {/* Decorative circles */}
                <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-white/10" />
                <div className="absolute -bottom-6 -left-6 w-24 h-24 rounded-full bg-white/5" />

                <div className="relative z-10">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 bg-white/20 rounded-lg flex items-center justify-center">
                      <Ship className="w-4 h-4 text-white" />
                    </div>
                  </div>
                  <p className="text-[12px] font-semibold text-white mb-0.5">Quick Booking</p>
                  <p className="text-[11px] text-white/70 mb-3">Create a new passenger ticket</p>

                  {/* Progress bar */}
                  <div className="mb-3">
                    <div className="h-[6px] bg-white/20 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-white/80" style={{ width: "65%" }} />
                    </div>
                  </div>

                  <button
                    onClick={() => navigate("/booking")}
                    className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-semibold py-2 px-4 rounded-full transition-colors"
                  >
                    New Booking
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Bottom bar ── */}
          <div className={`flex-shrink-0 border-t border-slate-100 ${isCollapsed ? "flex flex-col items-center gap-2 py-3 px-2" : "px-4 py-3"}`}>
            {isCollapsed ? (
              <>
                <button
                  onClick={() => navigate("/configuration")}
                  className="w-[38px] h-[38px] rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-all"
                  title="Settings"
                >
                  <Settings className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setProfileOpen(!profileOpen)}
                  className="w-[38px] h-[38px] bg-violet-600 rounded-xl flex items-center justify-center hover:bg-violet-700 transition-colors"
                  title={displayName}
                  ref={profileRef2}
                >
                  <span className="text-white font-semibold text-[11px]">{initials}</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-violet-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-semibold text-[11px]">{initials}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-slate-800 truncate">{displayName}</p>
                  <RoleBadge role={me?.role} />
                </div>
                <button
                  onClick={handleLogout}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all flex-shrink-0"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div
        className={`min-h-screen pt-[76px] pb-[86px] lg:pt-0 lg:pb-0 ${contentPl}`}
        style={{ transition: "padding-left 350ms cubic-bezier(0.32, 0.72, 0, 1)" }}
      >
        {/* Header Bar */}
        <div className="hidden lg:block bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="px-6 h-14 flex items-center justify-between">
            <h1 className="text-[15px] font-semibold text-slate-800">
              {getBreadcrumb(location.pathname)}
            </h1>
            <div className="flex items-center gap-2">
              <button className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" title="Notifications">
                <Bell className="w-[18px] h-[18px]" />
              </button>
              <button className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition-colors" title="Command">
                <Command className="w-[18px] h-[18px]" />
              </button>
              <div className="w-px h-6 bg-slate-200 mx-1" />
              <button
                ref={profileRef}
                onClick={() => setProfileOpen(!profileOpen)}
                className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center hover:bg-violet-700 transition-colors"
              >
                <span className="text-white font-semibold text-[11px]">{initials}</span>
              </button>
            </div>
          </div>
        </div>

        {profileOpen && (
          <ProfileDropdown me={me} onLogout={handleLogout} onClose={() => setProfileOpen(false)} anchorRef={profileRef} anchorRef2={profileRef2} anchorRefMobile={profileRefMobile} />
        )}

        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
