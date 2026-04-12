import { useEffect, useState } from "react";
import { Audit } from "../services/api";
import { Search, ChevronLeft, ChevronRight, Shield, Filter, X } from "lucide-react";

const ACTION_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  login: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "login.failed": { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  "login.blocked": { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  "user.create": { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  "user.update": { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  "user.delete": { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
  "user.activate": { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  "user.deactivate": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  "user.password_reset": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "user.onboarding_sent": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "booking.create": { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
  "booking.status": { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
  "license.update": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  "settings.update": { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
};

const getColor = (action: string) => {
  if (ACTION_COLORS[action]) return ACTION_COLORS[action];
  const prefix = action.split(".")[0];
  const byPrefix: Record<string, any> = {
    user: { bg: "bg-violet-50", text: "text-violet-700", dot: "bg-violet-500" },
    booking: { bg: "bg-blue-50", text: "text-blue-700", dot: "bg-blue-500" },
    team: { bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
    license: { bg: "bg-rose-50", text: "text-rose-700", dot: "bg-rose-500" },
    ticket: { bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
  };
  return byPrefix[prefix] || { bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-500" };
};

export default function AuditLogsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const currentUserRole = localStorage.getItem("role") || "agent";
  const isSuperAdmin = currentUserRole === "super_admin";

  const load = async () => {
    try {
      setLoading(true);
      const res = await Audit.list({
        page,
        limit: 50,
        action: actionFilter || undefined,
        q: search || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      });
      setData(res);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (isSuperAdmin) load(); /* eslint-disable-next-line */ }, [page, actionFilter]);

  const applyFilters = () => { setPage(1); load(); };
  const clearFilters = () => {
    setSearch(""); setActionFilter(""); setDateFrom(""); setDateTo(""); setPage(1);
    setTimeout(load, 0);
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="text-center">
          <Shield className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-[14px] font-semibold text-slate-700">Super admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-4 max-w-[1400px] mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-[18px] sm:text-xl font-bold text-slate-900">Audit Logs</h1>
        <p className="text-[11px] sm:text-[12px] text-slate-500 mt-0.5">Complete activity history across the entire system</p>
      </div>

      {/* Filters */}
      <div className="card p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-end gap-2 sm:gap-3">
          {/* Search row with filter toggle (mobile) */}
          <div className="flex gap-2 sm:contents">
            <div className="flex-1 sm:min-w-[200px]">
              <label className="hidden sm:block text-[11px] font-medium text-slate-500 mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && applyFilters()}
                  placeholder="Search logs..."
                  className="input w-full pl-9 text-[12px] sm:text-sm"
                />
              </div>
            </div>
            {/* Mobile: Apply button (acts as search submit) */}
            <button
              onClick={applyFilters}
              className="sm:hidden w-10 h-10 flex items-center justify-center rounded-xl bg-slate-900 text-white flex-shrink-0"
              title="Search"
            >
              <Search className="w-4 h-4" />
            </button>
            {/* Mobile: Filters toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`sm:hidden w-10 h-10 flex items-center justify-center rounded-xl border transition-all flex-shrink-0 ${
                showFilters || actionFilter || dateFrom || dateTo
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white border-slate-200 text-slate-500'
              }`}
              style={{
                backgroundColor: (showFilters || actionFilter || dateFrom || dateTo) ? 'var(--color-violet-600)' : undefined,
                borderColor: (showFilters || actionFilter || dateFrom || dateTo) ? 'var(--color-violet-600)' : undefined,
              }}
              title="Filters"
            >
              <Filter className="w-4 h-4" />
            </button>
          </div>

          {/* Filters — always shown on desktop, toggle on mobile */}
          <div className={`${showFilters ? 'block' : 'hidden'} sm:contents w-full`}>
            <div className="grid grid-cols-1 sm:contents gap-2 sm:gap-3 w-full">
              <div className="sm:min-w-[160px]">
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Action</label>
                <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }} className="select w-full text-[12px] sm:text-sm">
                  <option value="">All actions</option>
                  {(data?.actionTypes || []).map((a: string) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:contents">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">From</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="input w-full text-[12px] sm:text-sm" />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">To</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="input w-full text-[12px] sm:text-sm" />
                </div>
              </div>
              <div className="flex gap-2 items-center sm:contents">
                <button onClick={applyFilters} className="hidden sm:flex bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-4 sm:px-5 py-2 sm:py-2.5 text-[12px] sm:text-[13px] items-center gap-1.5 transition-colors justify-center">
                  <Filter className="w-3.5 h-3.5" />
                  Apply
                </button>
                {(search || actionFilter || dateFrom || dateTo) && (
                  <button onClick={clearFilters} className="text-[11px] sm:text-sm text-slate-500 hover:text-slate-700 transition-colors p-2 sm:self-end flex items-center gap-1" title="Clear filters">
                    <X className="w-3.5 h-3.5" />
                    <span className="sm:hidden">Clear filters</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table / Cards */}
      <div className="card overflow-hidden">
        <div className="px-4 sm:px-5 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-slate-800">Activity</h3>
          <span className="text-[11px] text-slate-400">{data?.total || 0} events</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          </div>
        ) : !data?.logs?.length ? (
          <div className="py-12 text-center text-[12px] text-slate-400">No audit logs found</div>
        ) : (
          <>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {data.logs.map((log: any) => {
                const color = getColor(log.action);
                const hasDetails = log.details && Object.keys(log.details).length > 0;
                const isExpanded = expandedId === log.id;
                return (
                  <div key={log.id} className="p-3">
                    <div
                      className={hasDetails ? "cursor-pointer" : ""}
                      onClick={() => hasDetails && setExpandedId(isExpanded ? null : log.id)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold ${color.bg} ${color.text} flex-shrink-0`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                          {log.action}
                        </span>
                        <span className="text-[10px] text-slate-400 whitespace-nowrap flex-shrink-0">
                          {new Date(log.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                      <p className="text-[12px] text-slate-700 font-medium truncate">
                        {log.user_email || <span className="text-slate-400 italic">anonymous</span>}
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-1 text-[10px] text-slate-400">
                        <span className="font-mono truncate">
                          {log.target_type && log.target_id ? `${log.target_type}:${log.target_id}` : "—"}
                        </span>
                        <span className="font-mono flex-shrink-0">{log.ip_address || "—"}</span>
                      </div>
                    </div>
                    {isExpanded && hasDetails && (
                      <pre className="mt-2 p-2 bg-slate-50 rounded-lg text-[10px] text-slate-600 font-mono whitespace-pre-wrap break-all">{JSON.stringify(log.details, null, 2)}</pre>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/50">
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">When</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">User</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Action</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">Target</th>
                    <th className="text-left text-[10px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-2.5">IP</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {data.logs.map((log: any) => {
                    const color = getColor(log.action);
                    const hasDetails = log.details && Object.keys(log.details).length > 0;
                    return (
                      <>
                        <tr key={log.id} onClick={() => hasDetails && setExpandedId(expandedId === log.id ? null : log.id)} className={`${hasDetails ? "cursor-pointer" : ""} hover:bg-slate-50/50 transition-colors`}>
                          <td className="px-4 py-2.5 text-[11px] text-slate-600 whitespace-nowrap">
                            {new Date(log.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </td>
                          <td className="px-4 py-2.5 text-[12px] text-slate-700">
                            {log.user_email || <span className="text-slate-400 italic">anonymous</span>}
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold ${color.bg} ${color.text}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${color.dot}`} />
                              {log.action}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-slate-500 font-mono">
                            {log.target_type && log.target_id ? `${log.target_type}:${log.target_id}` : "—"}
                          </td>
                          <td className="px-4 py-2.5 text-[11px] text-slate-400 font-mono whitespace-nowrap">{log.ip_address || "—"}</td>
                        </tr>
                        {expandedId === log.id && hasDetails && (
                          <tr key={`${log.id}-details`} className="bg-slate-50/50">
                            <td colSpan={5} className="px-4 py-3">
                              <pre className="text-[11px] text-slate-600 font-mono whitespace-pre-wrap break-all">{JSON.stringify(log.details, null, 2)}</pre>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100">
            <span className="text-[11px] text-slate-500">Page {data.page} of {data.totalPages} · {data.total} total</span>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-[12px] text-slate-700 font-medium px-3">{page}</span>
              <button onClick={() => setPage(Math.min(data.totalPages, page + 1))} disabled={page >= data.totalPages} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
