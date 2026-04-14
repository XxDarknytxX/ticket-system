import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useReactToPrint } from "react-to-print";
import { Auth, Bookings } from "../services/api";
import {
  Ticket,
  DollarSign,
  Users as UsersIcon,
  Ship,
  BarChart3,
  QrCode,
  Settings,
  ArrowRight,
  Anchor,
  ChevronRight,
  Calendar,
  Search,
  Printer,
} from "lucide-react";

function AgentDashboard({ todayStats, recentBookings, today, me, formatCurrency, getStatusBadge, navigate }: any) {
  const [salesPeriod, setSalesPeriod] = useState<"today" | "week" | "custom">("today");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sales, setSales] = useState<any>(null);
  const [salesLoading, setSalesLoading] = useState(true);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useReactToPrint({ contentRef: printRef });

  useEffect(() => {
    setSalesLoading(true);
    Bookings.getAgentSales(salesPeriod, dateFrom, dateTo)
      .then((data: any) => setSales(data))
      .catch(() => setSales(null))
      .finally(() => setSalesLoading(false));
  }, [salesPeriod, dateFrom, dateTo]);

  const agentStats = [
    { label: "Today's Bookings", value: todayStats.bookings ?? 0, icon: <Ticket className="w-5 h-5" />, iconBg: "bg-violet-100", iconColor: "text-violet-600" },
    { label: "Passengers Boarded", value: todayStats.boarded ?? 0, icon: <UsersIcon className="w-5 h-5" />, iconBg: "bg-amber-100", iconColor: "text-amber-600" },
  ];

  const agentActions = [
    { title: "New Booking", desc: "Create a passenger booking", path: "/booking", icon: <Ticket className="w-5 h-5 text-violet-600" /> },
    { title: "Search Tickets", desc: "Find and manage tickets", path: "/tickets", icon: <Search className="w-5 h-5 text-emerald-600" /> },
  ];

  const periodLabel = salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : `${dateFrom} to ${dateTo}`;
  const agentName = me ? `${me.first_name || ""} ${me.last_name || ""}`.trim() : "Agent";

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-5 sm:space-y-8 max-w-[1400px] mx-auto overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <p className="text-[12px] text-slate-500 truncate">{today}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Agent</span>
          <button
            onClick={() => navigate("/booking")}
            className="bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Ticket className="w-3.5 h-3.5" />
            New Booking
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {agentStats.map((card) => (
          <div key={card.label} className="card p-3 sm:p-5 flex flex-col items-center sm:items-start text-center sm:text-left">
            <div className="flex items-center sm:items-start sm:gap-3.5 flex-col sm:flex-row w-full">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mb-2 sm:mb-0 ${card.iconBg} ${card.iconColor}`}>
                {card.icon}
              </div>
              <div className="flex-1 min-w-0 w-full">
                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{card.label}</p>
                <p className="text-[18px] sm:text-xl font-bold text-slate-900 mt-0.5 truncate" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {card.value}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em] mb-3">Quick Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {agentActions.map((action) => (
            <button
              key={action.title}
              onClick={() => navigate(action.path)}
              className="group card p-4 text-left flex items-center gap-3.5 hover:border-slate-300 hover:shadow-md transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                {action.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold text-slate-800">{action.title}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{action.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ═══ My Sales ═══ */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-[13px] font-semibold text-slate-800">My Sales</h3>
          <div className="flex items-center gap-2 flex-wrap">
            {(["today", "week", "custom"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setSalesPeriod(p)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                  salesPeriod === p
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {p === "today" ? "Today" : p === "week" ? "This Week" : "Custom"}
              </button>
            ))}
            <button
              onClick={() => handlePrint()}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 transition-colors flex items-center gap-1.5"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
          </div>
        </div>

        {/* Custom date range */}
        {salesPeriod === "custom" && (
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3 flex-wrap bg-slate-50/50">
            <label className="text-[11px] text-slate-500 font-medium">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
            <label className="text-[11px] text-slate-500 font-medium">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="text-[12px] border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
            />
          </div>
        )}

        {/* Sales summary */}
        {!salesLoading && sales && (
          <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-6 bg-slate-50/30">
            <div className="flex items-center gap-2">
              <Ticket className="w-4 h-4 text-violet-500" />
              <span className="text-[11px] text-slate-500 font-medium">Bookings</span>
              <span className="text-[13px] font-bold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{sales.totals?.total_bookings ?? 0}</span>
            </div>
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span className="text-[11px] text-slate-500 font-medium">Revenue</span>
              <span className="text-[13px] font-bold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(sales.totals?.total_revenue)}</span>
            </div>
          </div>
        )}

        {/* Sales table */}
        {salesLoading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !sales?.bookings?.length ? (
          <div className="flex flex-col items-center justify-center py-14 px-5">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
              <DollarSign className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-[13px] font-medium text-slate-500">No sales for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ticket</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Route</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">Payment</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {sales.bookings.map((b: any) => (
                  <tr key={b.ticket_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-2.5 text-[11px] text-slate-500 font-mono">{b.ticket_id}</td>
                    <td className="px-5 py-2.5 text-[12px] text-slate-800 font-medium">{b.customer_name}</td>
                    <td className="px-5 py-2.5 text-[11px] text-slate-500 hidden sm:table-cell">{b.source} → {b.destination}</td>
                    <td className="px-5 py-2.5 text-[11px] text-slate-500 hidden sm:table-cell">{b.payment_method_name || b.payment_method || "—"}</td>
                    <td className="px-5 py-2.5">{getStatusBadge(b.status)}</td>
                    <td className="px-5 py-2.5 text-[12px] font-semibold text-slate-800 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(b.total_price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ═══ Printable Sales Record (hidden on screen) ═══ */}
      <div className="hidden">
        <div ref={printRef} className="p-8 bg-white" style={{ fontFamily: "Inter, sans-serif" }}>
          <div className="mb-6 border-b pb-4">
            <h1 className="text-lg font-bold text-slate-900">Sales Record</h1>
            <p className="text-sm text-slate-600 mt-1">Agent: {agentName}</p>
            <p className="text-sm text-slate-600">Period: {periodLabel}</p>
            <p className="text-sm text-slate-400">Generated: {new Date().toLocaleString()}</p>
          </div>
          {sales && (
            <>
              <div className="flex gap-8 mb-6">
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Total Bookings</p>
                  <p className="text-xl font-bold text-slate-900">{sales.totals?.total_bookings ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase font-semibold">Total Revenue</p>
                  <p className="text-xl font-bold text-slate-900">{formatCurrency(sales.totals?.total_revenue)}</p>
                </div>
              </div>
              <table className="w-full text-left border-collapse" style={{ fontSize: "11px" }}>
                <thead>
                  <tr className="border-b-2 border-slate-200">
                    <th className="py-2 pr-3 font-semibold text-slate-600">Ticket ID</th>
                    <th className="py-2 pr-3 font-semibold text-slate-600">Customer</th>
                    <th className="py-2 pr-3 font-semibold text-slate-600">Route</th>
                    <th className="py-2 pr-3 font-semibold text-slate-600">Payment</th>
                    <th className="py-2 pr-3 font-semibold text-slate-600">Status</th>
                    <th className="py-2 font-semibold text-slate-600 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {sales.bookings?.map((b: any) => (
                    <tr key={b.ticket_id} className="border-b border-slate-100">
                      <td className="py-1.5 pr-3 font-mono text-slate-600">{b.ticket_id}</td>
                      <td className="py-1.5 pr-3 text-slate-800">{b.customer_name}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{b.source} → {b.destination}</td>
                      <td className="py-1.5 pr-3 text-slate-600">{b.payment_method_name || b.payment_method || "—"}</td>
                      <td className="py-1.5 pr-3 text-slate-600 capitalize">{b.status}</td>
                      <td className="py-1.5 text-right font-semibold text-slate-800">{formatCurrency(b.total_price)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300">
                    <td colSpan={5} className="py-2 font-bold text-slate-800 text-right pr-3">Total</td>
                    <td className="py-2 font-bold text-slate-900 text-right">{formatCurrency(sales.totals?.total_revenue)}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>

      {/* Recent Bookings */}
      <div className="card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-[13px] font-semibold text-slate-800">Recent Bookings</h3>
          <button
            onClick={() => navigate("/tickets")}
            className="text-[11px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 transition-colors"
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </div>
        {recentBookings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-5">
            <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
              <Ticket className="w-6 h-6 text-slate-300" />
            </div>
            <p className="text-[13px] font-medium text-slate-500">No recent bookings</p>
            <p className="text-[11px] text-slate-400 mt-1">New bookings will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentBookings.slice(0, 5).map((booking: any, idx: number) => (
              <div key={booking.ticket_id || idx} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-medium text-slate-800">{booking.customer_name}</p>
                      {getStatusBadge(booking.status)}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[11px] text-slate-400 font-mono">{booking.ticket_id}</span>
                      <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                        {booking.source} <ArrowRight className="w-2.5 h-2.5 text-slate-300" /> {booking.destination}
                      </span>
                    </div>
                  </div>
                  <p className="text-[13px] font-semibold text-slate-800 ml-4 flex-shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatCurrency(booking.total_price)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [{ user }, dashboardData] = await Promise.all([Auth.me(), Auth.dashboard()]);
        setMe(user);
        setStats(dashboardData);
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

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Loading Dashboard</span>
            <span className="text-[12px] text-slate-400">Fetching your data...</span>
          </div>
        </div>
      </div>
    );
  }

  const role = me?.role || "agent";
  const isAgent = role === "agent";
  const isAdmin = role === "admin" || role === "super_admin";
  const isAdminOrDock = isAdmin || role === "dock";
  const formatCurrency = (amount: any) => `FJ$${(parseFloat(amount) || 0).toFixed(2)}`;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const getStatusBadge = (status: string) => {
    const s = (status || "").toLowerCase();
    const cls: Record<string, string> = {
      confirmed: "badge-confirmed",
      cancelled: "badge-cancelled",
      completed: "badge-completed",
      boarded: "badge-boarded",
    };
    return <span className={`badge ${cls[s] || "bg-slate-100 text-slate-600"}`}>{status || "N/A"}</span>;
  };

  const roleLabels: Record<string, string> = { super_admin: "Super Admin", admin: "Administrator", agent: "Agent", dock: "Dock Officer" };

  const todayStats = stats?.today || {};
  const totals = stats?.totals || {};
  const recentBookings = stats?.recentBookings || [];
  const todayDepartures = stats?.todayDepartures || [];

  // Agent dashboard — focused on booking tasks + sales
  if (isAgent) {
    return <AgentDashboard
      todayStats={todayStats}
      recentBookings={recentBookings}
      today={today}
      me={me}
      formatCurrency={formatCurrency}
      getStatusBadge={getStatusBadge}
      navigate={navigate}
    />;
  }

  // Admin / Super Admin dashboard — full stats
  const statCards = [
    { label: "Today's Bookings", value: todayStats.bookings ?? 0, icon: <Ticket className="w-5 h-5" />, iconBg: "bg-violet-100", iconColor: "text-violet-600", link: "/booking" },
    { label: "Today's Revenue", value: formatCurrency(todayStats.revenue), icon: <DollarSign className="w-5 h-5" />, iconBg: "bg-emerald-100", iconColor: "text-emerald-600", link: "/reports" },
    { label: "Passengers Boarded", value: todayStats.boarded ?? 0, icon: <UsersIcon className="w-5 h-5" />, iconBg: "bg-amber-100", iconColor: "text-amber-600", link: "/scan-history" },
    { label: "Total Customers", value: totals.unique_customers ?? 0, icon: <Ship className="w-5 h-5" />, iconBg: "bg-blue-100", iconColor: "text-blue-600", link: "/reports" },
  ];

  const quickActions = [
    { title: "New Booking", desc: "Create a passenger booking", path: "/booking", icon: <Ticket className="w-5 h-5 text-violet-600" />, show: true },
    { title: "View Reports", desc: "Analytics and insights", path: "/reports", icon: <BarChart3 className="w-5 h-5 text-emerald-600" />, show: true },
    { title: "Scan Tickets", desc: "Validate boarding passes", path: "/scanner", icon: <QrCode className="w-5 h-5 text-amber-600" />, show: isAdminOrDock },
    { title: "Configuration", desc: "Routes, vessels, pricing", path: "/configuration", icon: <Settings className="w-5 h-5 text-slate-600" />, show: isAdmin },
  ].filter(a => a.show);

  return (
    <div className="p-3 sm:p-6 lg:p-8 space-y-5 sm:space-y-8 max-w-[1400px] mx-auto overflow-hidden">

      {/* ═══ Header: Date + CTA ═══ */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
          <p className="text-[12px] text-slate-500 truncate">{today}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{roleLabels[role] || role}</span>
          <button
            onClick={() => navigate("/booking")}
            className="bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-semibold px-4 py-2 rounded-full flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <Ticket className="w-3.5 h-3.5" />
            New Booking
          </button>
        </div>
      </div>

      {/* ═══ Stat Cards ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((card) => (
          <div key={card.label} className="card p-3 sm:p-5 group hover:border-slate-300 hover:shadow-sm transition-all overflow-hidden flex flex-col items-center sm:items-start text-center sm:text-left">
            {/* Icon on top (mobile: stacked + centered, desktop: side-by-side left-aligned) */}
            <div className="flex items-center sm:items-start sm:gap-3.5 flex-col sm:flex-row w-full">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mb-2 sm:mb-0 ${card.iconBg} ${card.iconColor}`}>
                {card.icon}
              </div>
              <div className="flex-1 min-w-0 w-full">
                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{card.label}</p>
                <p className="text-[18px] sm:text-xl font-bold text-slate-900 mt-0.5 truncate" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {card.value}
                </p>
              </div>
            </div>
            <button
              onClick={() => navigate(card.link)}
              className="text-[11px] text-violet-600 font-medium mt-2 sm:mt-3 inline-flex items-center gap-1 hover:text-violet-700 transition-colors cursor-pointer"
            >
              View details <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {/* ═══ Quick Actions ═══ */}
      <div>
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em] mb-3">Quick Actions</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <button
              key={action.title}
              onClick={() => navigate(action.path)}
              className="group card p-4 text-left flex items-center gap-3.5 hover:border-slate-300 hover:shadow-md transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center flex-shrink-0 group-hover:scale-105 transition-transform">
                {action.icon}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-[13px] font-semibold text-slate-800">{action.title}</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">{action.desc}</p>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-violet-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* ═══ Two Column: Recent Bookings + Departures ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Recent Bookings */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-slate-800">Recent Bookings</h3>
            <button
              onClick={() => navigate("/reports")}
              className="text-[11px] text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 transition-colors"
            >
              View all <ArrowRight className="w-3 h-3" />
            </button>
          </div>
          {recentBookings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-5">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                <Ticket className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-[13px] font-medium text-slate-500">No recent bookings</p>
              <p className="text-[11px] text-slate-400 mt-1">New bookings will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {recentBookings.slice(0, 5).map((booking: any, idx: number) => (
                <div key={booking.ticket_id || idx} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[13px] font-medium text-slate-800">{booking.customer_name}</p>
                        {getStatusBadge(booking.status)}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-[11px] text-slate-400 font-mono">{booking.ticket_id}</span>
                        <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                          {booking.source} <ArrowRight className="w-2.5 h-2.5 text-slate-300" /> {booking.destination}
                        </span>
                      </div>
                    </div>
                    <p className="text-[13px] font-semibold text-slate-800 ml-4 flex-shrink-0" style={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatCurrency(booking.total_price)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Today's Departures */}
        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-[13px] font-semibold text-slate-800">Today's Departures</h3>
            <span className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg font-semibold">
              {todayDepartures.length} passenger{todayDepartures.length !== 1 ? "s" : ""}
            </span>
          </div>
          {todayDepartures.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-5">
              <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mb-3">
                <Anchor className="w-6 h-6 text-slate-300" />
              </div>
              <p className="text-[13px] font-medium text-slate-500">No departures today</p>
              <p className="text-[11px] text-slate-400 mt-1">Scheduled departures will appear here</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {todayDepartures.map((dep: any, idx: number) => (
                <div key={idx} className="px-5 py-3 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-slate-800">{dep.passenger_name || dep.customer_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                          {dep.source} <ArrowRight className="w-2.5 h-2.5 text-slate-300" /> {dep.destination}
                        </span>
                        {dep.vessel_name && (
                          <>
                            <span className="text-slate-200">|</span>
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Ship className="w-3 h-3" /> {dep.vessel_name}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="ml-4 flex-shrink-0">{getStatusBadge(dep.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
