import { useEffect, useState } from "react";
import { License } from "../services/api";
import { Key, Shield, Users, QrCode, UserCheck, UserX, Edit2, Save, X, TrendingUp, Layers, ChevronDown } from "lucide-react";

const ROLE_CONFIG: Record<string, { label: string; icon: any; color: string; bgLight: string; accent: string }> = {
  super_admin: { label: "Super Admin", icon: Shield, color: "text-rose-600", bgLight: "bg-rose-50", accent: "#e11d48" },
  admin: { label: "Admin", icon: Key, color: "text-amber-600", bgLight: "bg-amber-50", accent: "#d97706" },
  agent: { label: "Agent", icon: Users, color: "text-violet-600", bgLight: "bg-violet-50", accent: "#7c3aed" },
  dock: { label: "Dock Officer", icon: QrCode, color: "text-blue-600", bgLight: "bg-blue-50", accent: "#2563eb" },
};

const CUSTOM_ROLE_STYLE = { label: "", icon: Layers, color: "text-teal-600", bgLight: "bg-teal-50", accent: "#0d9488" };

export default function LicensePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; isError?: boolean } | null>(null);
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const currentUserRole = localStorage.getItem("role") || "agent";
  const isSuperAdmin = currentUserRole === "super_admin";
  const isAdmin = currentUserRole === "admin" || isSuperAdmin;

  const showMsg = (text: string, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const load = async () => {
    try {
      setLoading(true);
      const res = await License.getInfo();
      setData(res);
    } catch (e: any) {
      showMsg(e.message, true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const startEdit = (role: string, current: number) => {
    setEditingRole(role);
    setEditValue(String(current));
  };

  const saveLimit = async (role: string) => {
    setSaving(true);
    try {
      await License.updateLimits({ [role]: parseInt(editValue) });
      const label = ROLE_CONFIG[role]?.label || formatRoleName(role);
      showMsg(`License limit for ${label} updated`);
      setEditingRole(null);
      load();
    } catch (e: any) {
      showMsg(e.message, true);
    } finally {
      setSaving(false);
    }
  };

  const toggleUser = async (user: any) => {
    try {
      if (user.is_active) {
        await License.deactivateUser(user.id);
        showMsg(`${user.first_name || user.email} deactivated`);
      } else {
        await License.activateUser(user.id);
        showMsg(`${user.first_name || user.email} reactivated`);
      }
      load();
    } catch (e: any) {
      showMsg(e.message, true);
    }
  };

  const formatRoleName = (name: string) => name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-slate-700">Admin access required</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <span className="text-[13px] font-medium text-slate-500">Loading license information...</span>
        </div>
      </div>
    );
  }

  const builtInRoles = data.builtInRoles || ["super_admin", "admin", "agent", "dock"];
  const customRoleNames = Object.keys(data.customRoles || {});

  /* ═══════════════════════ ADMIN SUMMARY VIEW ═══════════════════════ */
  if (!isSuperAdmin) {
    const visibleRoles = ["admin", "agent", "dock", ...customRoleNames];
    const totalLimit = visibleRoles.reduce((a, r) => a + (data.limits[r] || 0), 0);
    const totalActive = visibleRoles.reduce((a, r) => a + (data.active[r] || 0), 0);
    const totalInactive = visibleRoles.reduce((a, r) => a + (data.inactive[r] || 0), 0);
    const overallPct = totalLimit > 0 ? Math.min(100, (totalActive / totalLimit) * 100) : 0;

    return (
      <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
        <div>
          <h1 className="text-xl font-bold text-slate-900">License Overview</h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Current license usage across your organization</p>
        </div>

        {message && (
          <div className={`card p-3.5 ${message.isError ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
            <div className="flex items-center gap-2.5">
              <div className={`w-2 h-2 rounded-full ${message.isError ? "bg-rose-500" : "bg-emerald-500"}`} />
              <span className={`text-[13px] font-medium ${message.isError ? "text-rose-700" : "text-emerald-700"}`}>{message.text}</span>
            </div>
          </div>
        )}

        {/* Total Usage */}
        <div className="card p-5 sm:p-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-violet-50/60 -translate-y-16 translate-x-16" />
          <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-blue-50/40 translate-y-12 -translate-x-12" />
          <div className="relative">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total System Usage</p>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-4xl font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{totalActive}</span>
                  <span className="text-lg text-slate-400">/</span>
                  <span className="text-2xl font-semibold text-slate-500" style={{ fontVariantNumeric: "tabular-nums" }}>{totalLimit}</span>
                  <span className="text-[12px] text-slate-400 ml-1">active users</span>
                </div>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-violet-600" />
              </div>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallPct}%`, background: "linear-gradient(90deg, #a78bfa, #7c3aed)" }} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{overallPct.toFixed(0)}% capacity used</span>
              <span>{totalLimit - totalActive} seats available · {totalInactive} deactivated</span>
            </div>
          </div>
        </div>

        {/* Unified Role List */}
        <div className="card overflow-hidden">
          {visibleRoles.map((role, idx) => {
            const isCustom = !builtInRoles.includes(role);
            const cfg = ROLE_CONFIG[role] || { ...CUSTOM_ROLE_STYLE };
            const Icon = cfg.icon;
            const limit = data.limits[role] || 0;
            const act = data.active[role] || 0;
            const inact = data.inactive[role] || 0;
            const pct = limit > 0 ? Math.min(100, (act / limit) * 100) : 0;
            const pctColor = pct < 70 ? cfg.accent : pct < 90 ? "#d97706" : "#e11d48";
            const overLimit = act > limit;
            const isExpanded = expandedRole === role;
            const usersInRole = data.users.filter((u: any) => u.role === role);

            return (
              <div key={role} className={idx > 0 ? "border-t border-slate-100" : ""}>
                <div className="px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl ${cfg.bgLight} flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-5 h-5 ${cfg.color}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-[14px] font-semibold text-slate-900">{isCustom ? formatRoleName(role) : cfg.label}</h3>
                        {isCustom && <span className="text-[9px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">CUSTOM</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${pct}%`, backgroundColor: overLimit ? "#e11d48" : pctColor }}
                          />
                        </div>
                        <span className={`text-[11px] font-semibold ${overLimit ? "text-rose-600" : "text-slate-500"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                          {act} / {limit}
                        </span>
                        {inact > 0 && <span className="text-[10px] text-slate-400">({inact} inactive)</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-[11px] text-slate-400">Limit <strong className="text-slate-700">{limit}</strong></span>
                      <button
                        onClick={() => setExpandedRole(isExpanded ? null : role)}
                        className={`p-2 rounded-lg transition-all ${isExpanded ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"}`}
                        title={`${usersInRole.length} user${usersInRole.length !== 1 ? "s" : ""}`}
                      >
                        <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </button>
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="px-5 pb-4">
                    <div className="bg-slate-50 rounded-xl p-3">
                      {usersInRole.length === 0 ? (
                        <p className="text-[12px] text-slate-400 italic text-center py-3">No users in this role</p>
                      ) : (
                        <div className="space-y-1">
                          {usersInRole.map((u: any) => {
                            const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email;
                            return (
                              <div key={u.id} className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${u.is_active ? "hover:bg-white" : "opacity-50"}`}>
                                <div className="flex items-center gap-2.5 min-w-0">
                                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${u.is_active ? `${cfg.bgLight} ${cfg.color}` : "bg-slate-200 text-slate-400"}`}>
                                    {(u.first_name || u.email)[0].toUpperCase()}
                                  </div>
                                  <div className="min-w-0">
                                    <p className={`text-[13px] font-medium truncate ${u.is_active ? "text-slate-700" : "text-slate-500 line-through"}`}>{name}</p>
                                    <p className="text-[11px] text-slate-400 truncate">{u.email} · T-{u.terminal_id || "??"}</p>
                                  </div>
                                </div>
                                {!u.is_active && <span className="text-[10px] font-semibold text-rose-600 bg-rose-50 px-2 py-0.5 rounded">Deactivated</span>}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  /* ═══════════════════════ SUPER ADMIN MANAGEMENT VIEW ═══════════════════════ */
  const allRoles = [...builtInRoles, ...customRoleNames];
  const totalLimitAll = allRoles.reduce((a, r) => a + (data.limits[r] || 0), 0);
  const totalActiveAll = allRoles.reduce((a, r) => a + (data.active[r] || 0), 0);
  const totalInactiveAll = allRoles.reduce((a, r) => a + (data.inactive[r] || 0), 0);
  const overallPctAll = totalLimitAll > 0 ? Math.min(100, (totalActiveAll / totalLimitAll) * 100) : 0;

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-slate-900">License Management</h1>
        <p className="text-[12px] text-slate-500 mt-0.5">Control user seats per role and manage active accounts. Create new roles in Configuration &rarr; Roles & Permissions.</p>
      </div>

      {message && (
        <div className={`card p-3 ${message.isError ? "bg-rose-50 border-rose-200" : "bg-emerald-50 border-emerald-200"}`}>
          <div className="flex items-center gap-2.5">
            <div className={`w-2 h-2 rounded-full ${message.isError ? "bg-rose-500" : "bg-emerald-500"}`} />
            <span className={`text-[13px] font-medium ${message.isError ? "text-rose-700" : "text-emerald-700"}`}>{message.text}</span>
          </div>
        </div>
      )}

      {/* Total System Usage */}
      <div className="card p-5 sm:p-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-40 h-40 rounded-full bg-violet-50/60 -translate-y-16 translate-x-16" />
        <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full bg-blue-50/40 translate-y-12 -translate-x-12" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total System Usage</p>
              <div className="flex items-baseline gap-2 mt-1">
                <span className="text-4xl font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{totalActiveAll}</span>
                <span className="text-lg text-slate-400">/</span>
                <span className="text-2xl font-semibold text-slate-500" style={{ fontVariantNumeric: "tabular-nums" }}>{totalLimitAll}</span>
                <span className="text-[12px] text-slate-400 ml-1">active users</span>
              </div>
            </div>
            <div className="w-12 h-12 rounded-2xl bg-violet-50 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-violet-600" />
            </div>
          </div>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-2">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${overallPctAll}%`, background: "linear-gradient(90deg, #a78bfa, #7c3aed)" }} />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-500">
            <span>{overallPctAll.toFixed(0)}% capacity used</span>
            <span>{totalLimitAll - totalActiveAll} seats available · {totalInactiveAll} deactivated</span>
          </div>
        </div>
      </div>

      {/* Unified Role List */}
      <div className="card overflow-hidden">
        {allRoles.map((role, idx) => {
          const isCustom = !builtInRoles.includes(role);
          const cfg = ROLE_CONFIG[role] || { ...CUSTOM_ROLE_STYLE };
          const Icon = cfg.icon;
          const limit = data.limits[role] || 0;
          const act = data.active[role] || 0;
          const inact = data.inactive[role] || 0;
          const pct = limit > 0 ? Math.min(100, (act / limit) * 100) : 0;
          const pctColor = pct < 70 ? cfg.accent : pct < 90 ? "#d97706" : "#e11d48";
          const overLimit = act > limit;
          const isExpanded = expandedRole === role;
          const usersInRole = data.users.filter((u: any) => u.role === role);

          return (
            <div key={role} className={idx > 0 ? "border-t border-slate-100" : ""}>
              {/* Role Row */}
              <div className="px-5 py-4">
                <div className="flex items-center gap-4">
                  {/* Icon + Name */}
                  <div className={`w-10 h-10 rounded-xl ${cfg.bgLight} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-5 h-5 ${cfg.color}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-slate-900">{isCustom ? formatRoleName(role) : cfg.label}</h3>
                      {isCustom && <span className="text-[9px] font-semibold text-teal-600 bg-teal-50 px-1.5 py-0.5 rounded">CUSTOM</span>}
                    </div>
                    {/* Progress bar inline */}
                    <div className="flex items-center gap-3 mt-1.5">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%`, backgroundColor: overLimit ? "#e11d48" : pctColor }}
                        />
                      </div>
                      <span className={`text-[11px] font-semibold ${overLimit ? "text-rose-600" : "text-slate-500"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
                        {act} / {limit}
                      </span>
                      {inact > 0 && <span className="text-[10px] text-slate-400">({inact} inactive)</span>}
                    </div>
                  </div>

                  {/* Limit edit */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingRole === role ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min="0"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="input w-16 text-center text-[13px] font-bold px-2"
                          autoFocus
                          onKeyDown={(e) => e.key === "Enter" && saveLimit(role)}
                        />
                        <button onClick={() => saveLimit(role)} disabled={saving} className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors">
                          <Save className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingRole(null)} className="p-1.5 text-slate-400 hover:bg-slate-50 rounded-lg transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => startEdit(role, limit)} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors">
                        <span className="text-[11px] text-slate-400">Limit</span>
                        <span className="text-[14px] font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{limit}</span>
                        <Edit2 className="w-3 h-3 text-slate-400" />
                      </button>
                    )}

                    {/* Expand users */}
                    <button
                      onClick={() => setExpandedRole(isExpanded ? null : role)}
                      className={`p-2 rounded-lg transition-all ${isExpanded ? "bg-slate-100 text-slate-700" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"}`}
                      title={`${usersInRole.length} user${usersInRole.length !== 1 ? "s" : ""}`}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded User List */}
              {isExpanded && (
                <div className="px-5 pb-4">
                  <div className="bg-slate-50 rounded-xl p-3">
                    {usersInRole.length === 0 ? (
                      <p className="text-[12px] text-slate-400 italic text-center py-3">No users in this role</p>
                    ) : (
                      <div className="space-y-1">
                        {usersInRole.map((u: any) => {
                          const name = `${u.first_name || ""} ${u.last_name || ""}`.trim() || u.email;
                          return (
                            <div key={u.id} className={`flex items-center justify-between p-2.5 rounded-lg transition-colors ${u.is_active ? "hover:bg-white" : "opacity-50"}`}>
                              <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold flex-shrink-0 ${u.is_active ? `${cfg.bgLight} ${cfg.color}` : "bg-slate-200 text-slate-400"}`}>
                                  {(u.first_name || u.email)[0].toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-[13px] font-medium truncate ${u.is_active ? "text-slate-700" : "text-slate-500 line-through"}`}>{name}</p>
                                  <p className="text-[11px] text-slate-400 truncate">{u.email} · T-{u.terminal_id || "??"}</p>
                                </div>
                              </div>
                              <button
                                onClick={() => toggleUser(u)}
                                className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${u.is_active ? "text-slate-400 hover:text-rose-600 hover:bg-rose-50" : "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"}`}
                                title={u.is_active ? "Deactivate" : "Reactivate"}
                              >
                                {u.is_active ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
