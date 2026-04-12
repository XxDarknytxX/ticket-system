import { useState, useEffect } from "react";
import { Scanning } from "../services/api";

export default function ScanHistory() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { loadHistory(); }, []);

  const loadHistory = async () => {
    try {
      setLoading(true);
      const data = await Scanning.getScanHistory();
      setScans(data.scans || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (d) => new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });

  const resultConfig = {
    valid: { badge: "badge badge-confirmed", label: "Boarded", border: "border-l-emerald-500" },
    already_boarded: { badge: "badge badge-expired", label: "Already Boarded", border: "border-l-amber-500" },
    cancelled: { badge: "badge badge-cancelled", label: "Cancelled", border: "border-l-rose-500" },
    not_found: { badge: "badge bg-slate-100/80 text-slate-600 border border-slate-200/50", label: "Not Found", border: "border-l-slate-400" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Loading Scan History</span>
            <span className="text-[12px] text-slate-400">Fetching scan records...</span>
          </div>
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Total Scans", value: scans.length, color: "text-slate-900", gradient: "from-slate-500/10 to-slate-500/5" },
    { label: "Successful Boards", value: scans.filter((s) => s.scan_result === "valid").length, color: "text-emerald-600", gradient: "from-emerald-500/10 to-emerald-500/5" },
    { label: "Re-scans", value: scans.filter((s) => s.scan_result === "already_boarded").length, color: "text-amber-600", gradient: "from-amber-500/10 to-amber-500/5" },
    { label: "Rejected", value: scans.filter((s) => s.scan_result === "cancelled" || s.scan_result === "not_found").length, color: "text-rose-600", gradient: "from-rose-500/10 to-rose-500/5" },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 animate-fade-in-up">
        <div className="min-w-0">
          <h1 className="text-[18px] sm:text-xl font-extrabold text-slate-900 truncate">Scan History</h1>
          <p className="text-[11px] sm:text-sm text-slate-500 mt-0.5 hidden sm:block">Audit log of all ticket scans</p>
          <p className="text-[11px] text-slate-500 mt-0.5 sm:hidden">{scans.length} records</p>
        </div>
        <button onClick={loadHistory} className="btn-secondary text-[12px] sm:text-sm flex items-center gap-1.5 px-3 sm:px-5 flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {error && (
        <div className="glass-card bg-rose-50/60 border-rose-200/50 p-3 animate-scale-in">
          <p className="text-[12px] sm:text-sm font-medium text-rose-700">{error}</p>
        </div>
      )}

      {/* Stats — 2x2 on mobile, 4-col on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {statCards.map((card, idx) => (
          <div key={card.label} className={`glass-card-hover p-3 sm:p-4 bg-gradient-to-br ${card.gradient} animate-fade-in-up`} style={{ animationDelay: `${idx * 75}ms` }}>
            <p className="text-[10px] sm:text-xs text-slate-500 font-medium truncate">{card.label}</p>
            <p className={`text-[20px] sm:text-2xl font-extrabold ${card.color} mt-0.5 sm:mt-1`} style={{ fontVariantNumeric: "tabular-nums" }}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Scan List */}
      <div className="glass-card overflow-hidden animate-fade-in-up delay-300">
        <div className="px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-200">
          <h3 className="text-[13px] sm:text-sm font-semibold text-slate-900">
            All Scans
            <span className="ml-2 text-[10px] sm:text-xs text-slate-400 bg-slate-100/60 px-2 py-0.5 rounded-full">{scans.length}</span>
          </h3>
        </div>
        {scans.length > 0 ? (
          <>
            {/* Mobile: stacked cards */}
            <div className="sm:hidden divide-y divide-slate-100">
              {scans.map((scan) => {
                const cfg = resultConfig[scan.scan_result] || resultConfig.not_found;
                return (
                  <div key={scan.id} className={`p-3 border-l-4 ${cfg.border}`}>
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-bold text-slate-900 truncate">{scan.passenger_name}</p>
                        <p className="text-[10px] font-mono text-slate-400 truncate">{scan.ticket_id}</p>
                      </div>
                      <span className={`${cfg.badge} text-[10px] flex-shrink-0`}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600 mb-1.5">
                      <span className="truncate">{scan.source}</span>
                      <svg className="w-3 h-3 flex-shrink-0" style={{ color: 'var(--color-violet-400)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                      <span className="truncate">{scan.destination}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400">
                      <span className="truncate">{scan.scanned_by_email}</span>
                      <span className="flex-shrink-0">{fmtDate(scan.scanned_at)} &middot; {fmtTime(scan.scanned_at)}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop: Table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-white">
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Ticket ID</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Passenger</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Route</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Result</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Scanned By</th>
                    <th className="px-5 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((scan) => {
                    const cfg = resultConfig[scan.scan_result] || resultConfig.not_found;
                    return (
                      <tr key={scan.id} className={`border-b border-slate-100 hover:bg-white transition-all duration-200 border-l-4 ${cfg.border}`}>
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="text-xs font-mono font-semibold text-slate-900 bg-slate-100/50 px-2 py-0.5 rounded-lg">{scan.ticket_id}</span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm font-medium text-slate-900">{scan.passenger_name}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1">
                            {scan.source}
                            <svg className="w-3 h-3 text-violet-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            {scan.destination}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 whitespace-nowrap"><span className={cfg.badge}>{cfg.label}</span></td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-500">{scan.scanned_by_email}</td>
                        <td className="px-5 py-3.5 whitespace-nowrap text-sm text-slate-500">{fmtDate(scan.scanned_at)} {fmtTime(scan.scanned_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="text-center py-12 sm:py-16">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-slate-100/60 rounded-2xl flex items-center justify-center mx-auto mb-3">
              <svg className="w-7 h-7 sm:w-8 sm:h-8 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <p className="text-[13px] sm:text-sm font-semibold text-slate-900 mb-1">No scans recorded</p>
            <p className="text-[11px] sm:text-xs text-slate-500 px-4">Scans will appear here when tickets are verified at the dock</p>
          </div>
        )}
      </div>
    </div>
  );
}
