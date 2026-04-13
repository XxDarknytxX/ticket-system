// src/components/Reports.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Bookings } from "../services/api";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend, RadialBarChart, RadialBar,
  LineChart, Line,
} from "recharts";
import * as XLSX from "xlsx";

export default function Reports() {
  const [reports, setReports] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");
  const [message, setMessage] = useState("");
  const [salesData, setSalesData] = useState(null);
  const [salesPeriod, setSalesPeriod] = useState("all");
  const [salesLoading, setSalesLoading] = useState(false);
  const [validationData, setValidationData] = useState(null);
  const [selectedTeamId, setSelectedTeamId] = useState(null); // drill-down into team
  const [selectedPaymentCode, setSelectedPaymentCode] = useState<string | null>(null); // payment method filter
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null); // agent filter
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [customDateFrom, setCustomDateFrom] = useState("");
  const [customDateTo, setCustomDateTo] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    loadReportsData();
  }, []);

  const loadReportsData = async () => {
    try {
      setLoading(true);
      const [reportsData, bookingsData, salesRes, validRes] = await Promise.all([
        Bookings.getReports(),
        Bookings.getBookings(),
        Bookings.getSalesReport("all").catch(() => null),
        Bookings.getValidationReport().catch(() => null),
      ]);
      setReports(reportsData);
      setBookings(bookingsData.bookings || []);
      if (salesRes) setSalesData(salesRes);
      if (validRes) setValidationData(validRes);
    } catch (error) {
      setMessage(`Error loading reports: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const exportSalesData = async (format) => {
    if (!salesData) return;
    const periodLabel = salesPeriod === "today" ? "Today" : salesPeriod === "week" ? "This Week" : salesPeriod === "month" ? "This Month" : "All Time";
    const timestamp = new Date().toISOString().slice(0, 10);
    const fmtDate = (d) => d ? new Date(d).toLocaleDateString() : "";
    const fmtDateTime = (d) => d ? new Date(d).toLocaleString() : "";

    // Fetch ALL bookings via getBookings (no pagination), then filter client-side by period
    let allBookings = [];
    try {
      const res = await Bookings.getBookings();
      allBookings = res.bookings || [];
    } catch (err) {
      allBookings = bookings || [];
    }

    // Filter by period using created_at
    const now = new Date();
    let filteredBookings = allBookings;
    if (salesPeriod === "today") {
      const today = now.toDateString();
      filteredBookings = allBookings.filter((b) => new Date(b.created_at).toDateString() === today);
    } else if (salesPeriod === "week") {
      // ISO week: Monday-based
      const weekStart = new Date(now);
      const day = now.getDay() || 7;
      weekStart.setDate(now.getDate() - day + 1);
      weekStart.setHours(0, 0, 0, 0);
      filteredBookings = allBookings.filter((b) => new Date(b.created_at) >= weekStart);
    } else if (salesPeriod === "month") {
      filteredBookings = allBookings.filter((b) => {
        const d = new Date(b.created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
    }

    // ═══ Sheet 1: Summary ═══
    const totalRev = filteredBookings.reduce((a, b) => a + Number(b.total_price || 0), 0);
    const summary = [
      ["Goundar Shipping — Sales Report"],
      ["Period", periodLabel],
      ["Generated", new Date().toLocaleString()],
      [],
      ["KEY METRICS"],
      ["Total Bookings", filteredBookings.length],
      ["Total Revenue (FJ$)", totalRev.toFixed(2)],
      ["Avg Ticket Value (FJ$)", filteredBookings.length > 0 ? (totalRev / filteredBookings.length).toFixed(2) : "0.00"],
      ["Unique Customers", new Set(filteredBookings.map((b) => b.customer_email || b.customer_name).filter(Boolean)).size],
      ["Unique Routes", new Set(filteredBookings.map((b) => `${b.source}→${b.destination}`)).size],
      ["Unique Vessels", new Set(filteredBookings.map((b) => b.vessel_name).filter(Boolean)).size],
      ["Unique Agents", new Set(filteredBookings.map((b) => b.booked_by_email).filter(Boolean)).size],
      [],
      ["SALES BY TEAM"],
      ["Team", "Code", "Bookings", "Revenue (FJ$)", "% of Total"],
    ];
    const totalTeamRev = (salesData.byTeam || []).reduce((a, t) => a + Number(t.revenue), 0) || 1;
    (salesData.byTeam || []).forEach((t) => {
      summary.push([
        t.team_name || "Unassigned",
        t.team_code || "",
        t.bookings,
        Number(t.revenue).toFixed(2),
        ((Number(t.revenue) / totalTeamRev) * 100).toFixed(1) + "%",
      ]);
    });
    summary.push([], ["BOOKINGS BY STATUS"], ["Status", "Count", "Revenue (FJ$)"]);
    (salesData.statusBreakdown || []).forEach((s) => {
      summary.push([s.status, s.count, Number(s.revenue).toFixed(2)]);
    });
    summary.push([], ["SALES BY PAYMENT METHOD"], ["Method", "Code", "Count", "Revenue (FJ$)"]);
    (salesData.byPaymentMethod || []).forEach((p: any) => {
      summary.push([p.name, p.code, p.count, Number(p.revenue).toFixed(2)]);
    });
    summary.push([], ["SALES BY ROUTE"], ["Route", "Bookings", "Revenue (FJ$)"]);
    const routeMap = new Map();
    filteredBookings.forEach((b) => {
      const key = `${b.source} → ${b.destination}`;
      if (!routeMap.has(key)) routeMap.set(key, { count: 0, revenue: 0 });
      const r = routeMap.get(key);
      r.count += 1;
      r.revenue += Number(b.total_price || 0);
    });
    [...routeMap.entries()].sort((a, b) => b[1].revenue - a[1].revenue).forEach(([route, stats]) => {
      summary.push([route, stats.count, stats.revenue.toFixed(2)]);
    });

    // ═══ Sheet 2: Detailed Bookings ═══
    const detailedBookings = [[
      "Ticket ID", "Status", "Booking Date/Time",
      "Travel Date", "Return Date", "Valid Until",
      "Customer Name", "Email", "Phone", "Gender",
      "Passenger Type", "Booking Type",
      "Source", "Destination", "Service Type",
      "Vessel", "Vessel Capacity",
      "Base Price (FJ$)", "VAT (FJ$)", "Total Price (FJ$)",
      "Booked By", "Agent Email", "Terminal ID", "Team", "Team Code",
      "Boarded At", "Boarded By", "Notes", "Payment Method"
    ]];
    // Sort by booking date descending
    const sortedBookings = [...filteredBookings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    sortedBookings.forEach((b) => {
      detailedBookings.push([
        b.ticket_id || "",
        b.status || "",
        fmtDateTime(b.created_at),
        fmtDate(b.travel_date),
        fmtDate(b.return_date),
        fmtDate(b.valid_until),
        b.customer_name || "",
        b.customer_email || "",
        b.customer_phone || "",
        b.customer_gender || "",
        b.passenger_type || "",
        b.booking_type || "",
        b.source || "",
        b.destination || "",
        b.service_type_name || "",
        b.vessel_name || "",
        b.vessel_capacity || "",
        Number(b.base_price || 0).toFixed(2),
        Number(b.vat_amount || 0).toFixed(2),
        Number(b.total_price || 0).toFixed(2),
        `${b.booked_by_first_name || ""} ${b.booked_by_last_name || ""}`.trim(),
        b.booked_by_email || "",
        `T-${b.booked_by_terminal || "??"}`,
        b.booked_by_team_name || "Unassigned",
        b.booked_by_team_code ? `#${b.booked_by_team_code}` : "",
        fmtDateTime(b.boarded_at),
        b.boarded_by_email || "",
        b.notes || "",
        b.payment_method_name || b.payment_method || "",
      ]);
    });

    const fileName = `sales-report-${periodLabel.toLowerCase().replace(/\s+/g, "-")}-${timestamp}`;

    if (format === "csv") {
      const toCsv = (rows) => rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
      const csvContent = [
        toCsv(summary),
        "",
        "=== DETAILED BOOKINGS ===",
        toCsv(detailedBookings),
      ].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fileName}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(detailedBookings), "Detailed Bookings");
      XLSX.writeFile(wb, `${fileName}.xlsx`);
    }
  };

  const loadSales = async (period, teamId, from?, to?, paymentMethod?, agentId?) => {
    setSalesLoading(true);
    try {
      const res = await Bookings.getSalesReport(period, teamId, from, to, paymentMethod, agentId);
      setSalesData((prev) => {
        // Each panel's list is preserved ONLY when its own filter is active,
        // so the other panels update while the selected one stays navigable.
        const byTeam = (teamId !== null && teamId !== undefined && prev?.byTeam) ? prev.byTeam : res.byTeam;
        const byPaymentMethod = (paymentMethod && prev?.byPaymentMethod) ? prev.byPaymentMethod : res.byPaymentMethod;
        const agents = (agentId !== null && agentId !== undefined && prev?.agents) ? prev.agents : res.agents;
        return { ...res, byTeam, byPaymentMethod, agents };
      });
    } catch {} finally { setSalesLoading(false); }
  };

  const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    return `FJ$${num.toFixed(2)}`;
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString();
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed': return 'badge-confirmed';
      case 'cancelled': return 'badge-cancelled';
      case 'completed': return 'badge-completed';
      case 'boarded': return 'badge-boarded';
      case 'invalidated': return 'badge-invalidated';
      default: return 'bg-slate-100/80 text-slate-700 border border-slate-200/50';
    }
  };

  const getStatusBarColor = (status) => {
    switch (status) {
      case 'confirmed': return 'from-emerald-400 to-emerald-600';
      case 'cancelled': return 'from-rose-400 to-rose-600';
      case 'completed': return 'from-violet-400 to-violet-600';
      case 'boarded': return 'from-amber-400 to-amber-600';
      case 'invalidated': return 'from-slate-300 to-slate-500';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  const getStatusDotColor = (status) => {
    switch (status) {
      case 'confirmed': return 'bg-emerald-500';
      case 'cancelled': return 'bg-rose-500';
      case 'completed': return 'bg-violet-500';
      case 'boarded': return 'bg-amber-500';
      case 'invalidated': return 'bg-slate-400';
      default: return 'bg-slate-500';
    }
  };

  const getPassengerTypeColor = (type) => {
    switch (type) {
      case 'adult': return 'bg-violet-100/80 text-violet-700 border border-violet-200/50';
      case 'student': return 'bg-emerald-100/80 text-emerald-700 border border-emerald-200/50';
      case 'child': return 'bg-amber-100/80 text-amber-700 border border-amber-200/50';
      case 'infant': return 'bg-violet-100/80 text-violet-700 border border-violet-200/50';
      default: return 'bg-slate-100/80 text-slate-700 border border-slate-200/50';
    }
  };

  const getPassengerBarColor = (type) => {
    switch (type) {
      case 'adult': return 'from-violet-400 to-violet-600';
      case 'student': return 'from-emerald-400 to-emerald-600';
      case 'child': return 'from-amber-400 to-amber-600';
      case 'infant': return 'from-violet-400 to-violet-600';
      default: return 'from-slate-400 to-slate-600';
    }
  };

  const tabs = [
    {
      id: "overview",
      label: "Overview",
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
        </svg>
      ),
    },
    {
      id: "sales",
      label: "Sales",
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      id: "analytics",
      label: "Analytics",
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: "boarding",
      label: "Boarding",
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
    {
      id: "vessels",
      label: "Fleet",
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 17h1l1.5-5.5L7 17h2l1.5-5.5L12 17h2l1.5-5.5L17 17h2l1.5-5.5L22 17h1M4 21h16M12 3v4m-4-2l4 2 4-2" />
        </svg>
      ),
    },
    {
      id: "payments",
      label: "Payments",
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
    {
      id: "validation",
      label: "Validation",
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      id: "bookings",
      label: "All Bookings",
      badge: bookings.length > 0 ? bookings.length : null,
      icon: (
        <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      ),
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Loading Reports</span>
            <span className="text-[12px] text-slate-400">Fetching report data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-in-up">
      {/* Messages */}
      {message && (
        <div className={`glass-card p-3.5 ${
          message.includes('Error')
            ? 'bg-rose-50/80 border-rose-200/50 text-rose-700'
            : 'bg-emerald-50/80 border-emerald-200/50 text-emerald-700'
        }`}>
          <div className="flex items-center">
            <div className={`w-2 h-2 rounded-full mr-2.5 ${
              message.includes('Error') ? 'bg-rose-500' : 'bg-emerald-500'
            }`}></div>
            <span className="text-sm font-medium">{message}</span>
          </div>
        </div>
      )}

      {/* Tab Navigation - Glass Pill Style (scrolls internally on mobile) */}
      <div className="glass-card p-1.5 overflow-x-auto scrollbar-hide max-w-full">
        <div className="flex gap-1 w-max">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group relative flex items-center gap-2 whitespace-nowrap py-2.5 px-4 text-sm font-medium rounded-xl transition-all duration-300 ${
              activeTab === tab.id
                ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25"
                : "text-slate-500 hover:text-slate-700 hover:bg-white"
            }`}
          >
            <span className={`transition-colors duration-200 ${
              activeTab === tab.id ? "text-white" : "text-slate-400 group-hover:text-slate-500"
            }`}>
              {tab.icon}
            </span>
            {tab.label}
            {tab.badge && (
              <span className={`ml-1 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                activeTab === tab.id
                  ? "bg-white/25 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
        </div>
      </div>

      {/* ========== OVERVIEW TAB ========== */}
      {activeTab === "overview" && reports && (
        <div className="space-y-3">
          {/* Top Stats Row — 6 metrics combining sales + validation */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: "Bookings", value: reports.stats.total_bookings, icon: "ticket", color: "violet" },
              { label: "Revenue", value: formatCurrency(reports.stats.total_revenue), icon: "dollar", color: "emerald" },
              { label: "Customers", value: reports.stats.unique_customers, icon: "users", color: "blue" },
              { label: "Avg. Value", value: formatCurrency(reports.stats.avg_booking_value), icon: "chart", color: "amber" },
              { label: "Boarded", value: validationData?.statusCounts?.boarded ?? 0, icon: "check", color: "teal" },
              { label: "Pending", value: validationData?.statusCounts?.pending ?? 0, icon: "clock", color: "rose" },
            ].map((s, i) => {
              const iconMap: Record<string, React.ReactNode> = {
                ticket: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />,
                dollar: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />,
                users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />,
                chart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
                check: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
                clock: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />,
              };
              const bgMap: Record<string, string> = { violet: "bg-violet-50 text-violet-500", emerald: "bg-emerald-50 text-emerald-500", blue: "bg-blue-50 text-blue-500", amber: "bg-amber-50 text-amber-500", teal: "bg-teal-50 text-teal-500", rose: "bg-rose-50 text-rose-500" };
              return (
                <div key={i} className="card p-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-2 ${bgMap[s.color]}`}>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">{iconMap[s.icon]}</svg>
                  </div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{s.label}</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5 truncate" style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                </div>
              );
            })}
          </div>

          {/* Validation Summary — 4 small cards */}
          {validationData?.statusCounts && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="card p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Scans This Week</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{validationData.weekScans || 0}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-500 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" /></svg>
                </div>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Scans This Month</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{validationData.monthScans || 0}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                </div>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Expired</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{validationData.statusCounts.expired || 0}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-500 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                </div>
              </div>
              <div className="card p-3 flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Invalidated</p>
                  <p className="text-lg font-bold text-slate-900 mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>{validationData.statusCounts.invalidated || 0}</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                </div>
              </div>
            </div>
          )}

          {/* ═══ Sales Charts — Revenue Trend + Team Pie ═══ */}
          {salesData?.dailyRevenue?.length > 0 && (() => {
            const areaData = salesData.dailyRevenue.map((d: any) => ({
              date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              revenue: Number(d.revenue),
              bookings: Number(d.bookings),
            }));
            const totalRev = areaData.reduce((a: number, d: any) => a + d.revenue, 0);
            const avgRev = areaData.length ? totalRev / areaData.length : 0;
            const teams = (salesData.byTeam || []).filter((t: any) => Number(t.revenue) > 0);
            const defaultColors = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#e11d48", "#0891b2"];
            const pieData = teams.map((t: any, i: number) => ({
              name: t.team_name || "Unassigned",
              value: Number(t.revenue),
              color: t.color || defaultColors[i % defaultColors.length],
            }));
            return (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* Revenue Trend area chart */}
                  <div className="card p-4 lg:col-span-2">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                          <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        </div>
                        <div>
                          <h3 className="text-[13px] font-semibold text-slate-800">Revenue Trend</h3>
                          <p className="text-[11px] text-slate-400 mt-0.5">{areaData.length} day{areaData.length !== 1 ? 's' : ''} · avg {formatCurrency(avgRev)}/day</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total</p>
                        <p className="text-xl font-bold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(totalRev)}</p>
                      </div>
                    </div>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={areaData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="overviewRev" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--color-violet-500)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="var(--color-violet-500)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                        <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v}`} />
                        <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.08)", fontSize: 12, padding: "8px 12px" }} formatter={(value: any, name: string) => [name === "revenue" ? formatCurrency(value) : value, name === "revenue" ? "Revenue" : "Bookings"]} />
                        <Area type="monotone" dataKey="revenue" stroke="var(--color-violet-600)" strokeWidth={2.5} fill="url(#overviewRev)" activeDot={{ r: 5, fill: "var(--color-violet-600)", stroke: "#fff", strokeWidth: 2 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Team Distribution pie */}
                  {pieData.length > 0 && (
                    <div className="card p-4">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                          <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        </div>
                        <h3 className="text-[13px] font-semibold text-slate-800">Team Distribution</h3>
                      </div>
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} paddingAngle={2} dataKey="value" stroke="#fff" strokeWidth={2}>
                            {pieData.map((entry: any, i: number) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <Tooltip contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.08)", fontSize: 12, padding: "8px 12px" }} formatter={(value: any) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="mt-2 space-y-1">
                        {pieData.slice(0, 4).map((t: any, i: number) => {
                          const total = pieData.reduce((a: number, p: any) => a + p.value, 0);
                          const pct = (t.value / total) * 100;
                          return (
                            <div key={i} className="flex items-center justify-between text-[11px]">
                              <div className="flex items-center gap-2 min-w-0">
                                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                                <span className="text-slate-600 truncate">{t.name}</span>
                              </div>
                              <span className="text-slate-800 font-semibold tabular-nums">{pct.toFixed(0)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Bookings per Day bar chart */}
                <div className="card p-4">
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                      <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-[13px] font-semibold text-slate-800">Bookings per Day</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">Daily booking volume</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={areaData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: "rgba(124, 58, 237, 0.08)" }} contentStyle={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, boxShadow: "0 10px 25px rgba(0,0,0,0.08)", fontSize: 12, padding: "8px 12px" }} />
                      <Bar dataKey="bookings" fill="var(--color-violet-500)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </>
            );
          })()}

          {/* ═══ Sales by Team + Top Agents ═══ */}
          {salesData?.byTeam?.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <div className="card overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                  <div>
                    <h3 className="text-[13px] font-semibold text-slate-800">Sales by Team</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Revenue distribution</p>
                  </div>
                  <button onClick={() => setActiveTab("sales")} className="text-[11px] text-violet-600 font-medium hover:text-violet-700 transition-colors">View all</button>
                </div>
                <div className="divide-y divide-slate-50">
                  {salesData.byTeam.map((team: any, i: number) => {
                    const maxRev = Math.max(...salesData.byTeam.map((t: any) => Number(t.revenue)), 1);
                    const pct = (Number(team.revenue) / maxRev) * 100;
                    return (
                      <div key={i} className="px-4 py-2 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {team.color && <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />}
                            <span className="text-[13px] font-medium text-slate-800">{team.team_name || "Unassigned"}</span>
                            {team.team_code && <span className="text-[10px] font-mono text-slate-400">#{team.team_code}</span>}
                          </div>
                          <span className="text-[13px] font-semibold text-slate-800" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(team.revenue)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${(team.color || '#8b5cf6')}99, ${team.color || '#8b5cf6'})` }} />
                          </div>
                          <span className="text-[11px] text-slate-400 w-16 text-right">{team.bookings} tickets</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {salesData?.agents?.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                    <div>
                      <h3 className="text-[13px] font-semibold text-slate-800">Top Agents</h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">By revenue</p>
                    </div>
                    <button onClick={() => setActiveTab("sales")} className="text-[11px] text-violet-600 font-medium hover:text-violet-700 transition-colors">View all</button>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {salesData.agents.slice(0, 5).map((agent: any, i: number) => {
                      const topFive = salesData.agents.slice(0, 5);
                      const maxRev = Math.max(...topFive.map((a: any) => Number(a.revenue)), 1);
                      const pct = (Number(agent.revenue) / maxRev) * 100;
                      return (
                        <div key={i} className="px-4 py-2 hover:bg-slate-50/50 transition-colors">
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center text-violet-700 text-[10px] font-bold flex-shrink-0">
                                {(agent.first_name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <span className="text-[13px] font-medium text-slate-800">{(agent.first_name || '') + ' ' + (agent.last_name || '')}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-slate-400">T-{agent.terminal_id || '??'}</span>
                                  {agent.team_name && <span className="text-[10px] text-slate-400">{agent.team_name}</span>}
                                </div>
                              </div>
                            </div>
                            <span className="text-[13px] font-semibold text-slate-800" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(agent.revenue)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #34d399, #10b981)" }} />
                            </div>
                            <span className="text-[11px] text-slate-400 w-16 text-right">{agent.bookings} tickets</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Status Breakdown */}
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-800">Booking Status</h3>
                <span className="text-[11px] text-slate-400">{reports.stats.total_bookings} total</span>
              </div>
              <div className="p-4 space-y-2">
                {(() => {
                  const total = Math.max(reports.stats.total_bookings, 1);
                  return reports.statusBreakdown.map((status, i) => {
                    const pct = ((status.count / total) * 100).toFixed(1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${getStatusDotColor(status.status)}`} />
                        <span className="text-[12px] font-medium text-slate-600 capitalize w-20">{status.status}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full bg-gradient-to-r ${getStatusBarColor(status.status)}`} style={{ width: `${Math.max(Number(pct), 2)}%` }} />
                        </div>
                        <span className="text-[12px] font-semibold text-slate-700 w-8 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{status.count}</span>
                        <span className="text-[11px] text-slate-400 w-12 text-right">{pct}%</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* Passenger Breakdown */}
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-800">Passenger Types</h3>
              </div>
              <div className="p-4 space-y-2">
                {(() => {
                  const total = Math.max(reports.passengerTypeBreakdown.reduce((a, t) => a + t.count, 0), 1);
                  return reports.passengerTypeBreakdown.map((type, i) => {
                    const pct = ((type.count / total) * 100).toFixed(1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-lg text-[10px] font-bold ${getPassengerTypeColor(type.passenger_type)}`}>
                          {type.passenger_type?.[0]?.toUpperCase()}
                        </span>
                        <span className="text-[12px] font-medium text-slate-600 capitalize w-16">{type.passenger_type}</span>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full bg-gradient-to-r ${getPassengerBarColor(type.passenger_type)}`} style={{ width: `${Math.max(Number(pct), 2)}%` }} />
                        </div>
                        <span className="text-[12px] font-semibold text-slate-700 w-8 text-right" style={{ fontVariantNumeric: 'tabular-nums' }}>{type.count}</span>
                        <span className="text-[11px] text-slate-400 w-16 text-right">{formatCurrency(type.revenue)}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          </div>

          {/* Recent Activity + Top Routes side by side */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {/* Recent Activity */}
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <h3 className="text-[13px] font-semibold text-slate-800">Recent Activity</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Last 7 days</p>
              </div>
              {reports.recentActivity.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {reports.recentActivity.map((day, i) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-2.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                        <span className="text-[12px] font-medium text-slate-700">{formatDate(day.booking_date)}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="text-[12px] text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>{day.count} bookings</span>
                        <span className="text-[12px] font-semibold text-emerald-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(day.revenue)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-[12px] text-slate-400">No recent activity</p>
                </div>
              )}
            </div>

            {/* Top Routes */}
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100">
                <h3 className="text-[13px] font-semibold text-slate-800">Top Routes</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">By booking volume</p>
              </div>
              {reports.routePerformance?.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {reports.routePerformance.slice(0, 5).map((route, i) => {
                    const maxBookings = Math.max(...reports.routePerformance.map(r => r.bookings_count), 1);
                    const pct = (route.bookings_count / maxBookings) * 100;
                    return (
                      <div key={i} className="px-4 py-2 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[12px] font-medium text-slate-700">{route.source} → {route.destination}</span>
                          <span className="text-[12px] font-semibold text-slate-800" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(route.revenue)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-violet-400" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[11px] text-slate-400 w-16 text-right">{route.bookings_count} trips</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12">
                  <p className="text-[12px] text-slate-400">No route data</p>
                </div>
              )}
            </div>
          </div>

          {/* Dock Officers + Recent Scan Activity */}
          {validationData?.byOfficer?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-800">Dock Officers — Validation Leaderboard</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Top performers by scan count</p>
                </div>
                <button onClick={() => setActiveTab("validation")} className="text-[11px] text-violet-600 font-medium hover:text-violet-700 transition-colors flex items-center gap-1">
                  View all
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
              <div className="divide-y divide-slate-50">
                {validationData.byOfficer.slice(0, 5).map((officer: any, i: number) => {
                  const maxScans = Math.max(...validationData.byOfficer.map((o: any) => Number(o.total_scans)), 1);
                  const pct = (Number(officer.total_scans) / maxScans) * 100;
                  const ranks = ["🥇", "🥈", "🥉", "4", "5"];
                  return (
                    <div key={i} className="px-4 py-2 hover:bg-slate-50/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center text-[11px] font-bold text-slate-600 flex-shrink-0">
                          {i < 3 ? ranks[i] : i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-medium text-slate-800">{officer.first_name} {officer.last_name || ''}</span>
                              <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">T-{officer.terminal_id || '??'}</span>
                            </div>
                            <span className="text-[13px] font-semibold text-slate-800" style={{ fontVariantNumeric: 'tabular-nums' }}>{officer.total_scans} scans</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #34d399, #10b981)" }} />
                            </div>
                            <span className="text-[11px] text-slate-400 w-24 text-right">{officer.valid_scans} valid</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== ANALYTICS TAB ========== */}
      {activeTab === "analytics" && reports && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Booking Status Breakdown */}
            <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Booking Status Breakdown</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {(() => {
                    const maxCount = Math.max(...reports.statusBreakdown.map(s => s.count), 1);
                    return reports.statusBreakdown.map((status, index) => {
                      const pct = (status.count / maxCount) * 100;
                      const barWidth = Math.max(pct, 12);
                      return (
                        <div key={index}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-slate-500 capitalize">{status.status}</span>
                            <span className="text-xs font-medium text-slate-500">{formatCurrency(status.revenue)}</span>
                          </div>
                          <div className="w-full bg-white  rounded-xl h-8 relative overflow-hidden border border-slate-200">
                            <div
                              className={`h-full rounded-xl bg-gradient-to-r ${getStatusBarColor(status.status)} flex items-center justify-between px-3 transition-all duration-500`}
                              style={{ width: `${barWidth}%`, minWidth: '60px' }}
                            >
                              <span className="text-xs font-semibold text-white capitalize truncate">{status.status}</span>
                              <span className="text-xs font-bold text-white ml-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{status.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>

            {/* Passenger Type Breakdown */}
            <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Passenger Type Analysis</h3>
              </div>
              <div className="p-6">
                <div className="space-y-4">
                  {(() => {
                    const maxCount = Math.max(...reports.passengerTypeBreakdown.map(t => t.count), 1);
                    return reports.passengerTypeBreakdown.map((type, index) => {
                      const pct = (type.count / maxCount) * 100;
                      const barWidth = Math.max(pct, 12);
                      return (
                        <div key={index}>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-slate-500 capitalize">{type.passenger_type}</span>
                            <span className="text-xs font-medium text-slate-500">{formatCurrency(type.revenue)}</span>
                          </div>
                          <div className="w-full bg-white  rounded-xl h-8 relative overflow-hidden border border-slate-200">
                            <div
                              className={`h-full rounded-xl bg-gradient-to-r ${getPassengerBarColor(type.passenger_type)} flex items-center justify-between px-3 transition-all duration-500`}
                              style={{ width: `${barWidth}%`, minWidth: '60px' }}
                            >
                              <span className="text-xs font-semibold text-white capitalize truncate">{type.passenger_type}</span>
                              <span className="text-xs font-bold text-white ml-2" style={{ fontVariantNumeric: 'tabular-nums' }}>{type.count}</span>
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>

          {/* Route Performance */}
          <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-slate-900">Route Performance</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="bg-white">
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Route</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Service Type</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Bookings</th>
                    <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {reports.routePerformance.map((route, index) => (
                    <tr key={index} className="hover:bg-white transition-colors duration-200">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900">{route.source}</span>
                          <svg className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                          <span className="text-sm font-medium text-slate-900">{route.destination}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-slate-500">{route.service_type}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-100/80 text-violet-700 border border-violet-200/50" style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {route.bookings_count}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        {formatCurrency(route.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========== BOARDING TAB ========== */}
      {activeTab === "boarding" && reports && reports.boardingStats && (
        <div className="space-y-6">
          {/* Boarding Rate Hero + Stat Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            {/* Large boarding rate display */}
            <div className="lg:col-span-2 glass-card-hover p-6 flex flex-col items-center justify-center animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Overall Boarding Rate</p>
              <p className="text-5xl font-extrabold bg-violet-600 bg-clip-text text-transparent" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {reports.boardingStats.total > 0
                  ? ((reports.boardingStats.boarded_count / reports.boardingStats.total) * 100).toFixed(1)
                  : 0}%
              </p>
              <p className="text-xs text-slate-400 mt-2">
                {reports.boardingStats.boarded_count} of {reports.boardingStats.total} passengers boarded
              </p>
              {/* Progress bar */}
              <div className="w-full mt-4 bg-white  rounded-full h-3 overflow-hidden border border-slate-200">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all duration-700"
                  style={{ width: `${reports.boardingStats.total > 0 ? (reports.boardingStats.boarded_count / reports.boardingStats.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>

            {/* Stat cards */}
            <div className="lg:col-span-3 grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Confirmed */}
              <div className="glass-card-hover p-5 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-emerald-500/25">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Confirmed</p>
                    <p className="text-2xl font-extrabold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{reports.boardingStats.confirmed_count}</p>
                  </div>
                </div>
              </div>

              {/* Boarded */}
              <div className="glass-card-hover p-5 animate-fade-in-up" style={{ animationDelay: '0.15s' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/25">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Boarded</p>
                    <p className="text-2xl font-extrabold text-amber-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{reports.boardingStats.boarded_count}</p>
                  </div>
                </div>
              </div>

              {/* Cancelled */}
              <div className="glass-card-hover p-5 animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-rose-500/25">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-500">Cancelled</p>
                    <p className="text-2xl font-extrabold text-rose-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{reports.boardingStats.cancelled_count}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Boarding Summary Bars */}
          <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.25s' }}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Boarding Summary</h3>
                <p className="text-xs text-slate-500">Visual breakdown of ticket statuses</p>
              </div>
            </div>
            <div className="p-6">
              {reports.boardingStats.total > 0 ? (
                <div className="space-y-5">
                  {[
                    { label: "Confirmed", count: reports.boardingStats.confirmed_count, gradient: "from-emerald-400 to-emerald-600", icon: (
                      <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )},
                    { label: "Boarded", count: reports.boardingStats.boarded_count, gradient: "from-amber-400 to-amber-600", icon: (
                      <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )},
                    { label: "Cancelled", count: reports.boardingStats.cancelled_count, gradient: "from-rose-400 to-rose-600", icon: (
                      <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )},
                  ].map((item) => {
                    const pct = reports.boardingStats.total > 0 ? (item.count / reports.boardingStats.total) * 100 : 0;
                    return (
                      <div key={item.label} className="flex items-center gap-4">
                        <div className="w-28 flex items-center gap-2 flex-shrink-0">
                          {item.icon}
                          <span className="text-sm font-medium text-slate-700">{item.label}</span>
                        </div>
                        <div className="flex-1 bg-white  rounded-xl h-8 relative overflow-hidden border border-slate-200">
                          <div
                            className={`h-full rounded-xl bg-gradient-to-r ${item.gradient} flex items-center justify-end px-3 transition-all duration-700`}
                            style={{ width: `${Math.max(pct, 8)}%`, minWidth: '48px' }}
                          >
                            <span className="text-xs font-bold text-white" style={{ fontVariantNumeric: 'tabular-nums' }}>
                              {item.count} ({pct.toFixed(1)}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10">
                  <div className="w-12 h-12 bg-white  rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-200">
                    <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-slate-500">No booking data available</p>
                  <p className="text-xs text-slate-400 mt-1">Boarding statistics will appear once bookings are created</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========== FLEET PERFORMANCE TAB ========== */}
      {activeTab === "vessels" && reports && reports.vesselPerformance && (
        <div className="space-y-6">
          {/* Fleet Overview */}
          <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17h1l1.5-5.5L7 17h2l1.5-5.5L12 17h2l1.5-5.5L17 17h2l1.5-5.5L22 17h1M4 21h16M12 3v4m-4-2l4 2 4-2" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Fleet Performance Overview</h3>
                <p className="text-xs text-slate-500">Performance metrics for your vessel fleet</p>
              </div>
            </div>
            <div className="p-6">
              {reports.vesselPerformance.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {reports.vesselPerformance.map((vessel, index) => {
                    const utilization = vessel.seat_capacity > 0 ? ((vessel.bookings_count / vessel.seat_capacity) * 100) : 0;
                    const cappedUtilization = Math.min(utilization, 100);
                    const circumference = 2 * Math.PI * 36;
                    const strokeDashoffset = circumference - (cappedUtilization / 100) * circumference;

                    return (
                      <div
                        key={index}
                        className="glass-card-hover p-5 animate-fade-in-up"
                        style={{ animationDelay: `${0.1 + index * 0.05}s` }}
                      >
                        <div className="flex items-center justify-between mb-5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17h1l1.5-5.5L7 17h2l1.5-5.5L12 17h2l1.5-5.5L17 17h2l1.5-5.5L22 17h1" />
                              </svg>
                            </div>
                            <h4 className="text-sm font-bold text-slate-900">{vessel.vessel_name}</h4>
                          </div>
                          <span className="px-2.5 py-1 bg-violet-100/80 text-violet-700 text-xs font-semibold rounded-full border border-violet-200/50">
                            {vessel.seat_capacity} seats
                          </span>
                        </div>

                        {/* SVG Progress Ring */}
                        <div className="flex items-center gap-5 mb-5">
                          <div className="relative w-20 h-20 flex-shrink-0">
                            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
                              <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="6" />
                              <circle
                                cx="40" cy="40" r="36" fill="none"
                                stroke={`url(#tealGradient-${index})`}
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={circumference}
                                strokeDashoffset={strokeDashoffset}
                                className="transition-all duration-700"
                              />
                              <defs>
                                <linearGradient id={`tealGradient-${index}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#14b8a6" />
                                  <stop offset="100%" stopColor="#0d9488" />
                                </linearGradient>
                              </defs>
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="text-sm font-bold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {utilization.toFixed(0)}%
                              </span>
                            </div>
                          </div>
                          <div className="space-y-2 flex-1">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                              </svg>
                              <span className="text-xs text-slate-500">Bookings</span>
                              <span className="ml-auto text-sm font-bold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{vessel.bookings_count}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                              </svg>
                              <span className="text-xs text-slate-500">Revenue</span>
                              <span className="ml-auto text-sm font-bold text-emerald-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(vessel.revenue)}</span>
                            </div>
                          </div>
                        </div>

                        {vessel.bookings_count > 0 && (
                          <div className="pt-4 border-t border-slate-200">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-slate-500">Avg. per Booking</span>
                              <span className="text-xs font-semibold text-slate-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {formatCurrency(vessel.revenue / vessel.bookings_count)}
                              </span>
                            </div>
                          </div>
                        )}

                        {vessel.bookings_count === 0 && (
                          <div className="mt-3 p-3 bg-amber-50/80  border border-amber-200/50 rounded-xl flex items-center gap-2">
                            <svg className="w-4 h-4 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                            <p className="text-xs text-amber-700">No bookings recorded for this vessel yet</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-14">
                  <div className="w-14 h-14 bg-white  rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-200">
                    <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 17h1l1.5-5.5L7 17h2l1.5-5.5L12 17h2l1.5-5.5L17 17h2l1.5-5.5L22 17h1" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">No vessel data available</h3>
                  <p className="text-xs text-slate-500">Add vessels in the configuration section to see performance metrics</p>
                </div>
              )}
            </div>
          </div>

          {/* Fleet Summary Table */}
          {reports.vesselPerformance.length > 0 && (
            <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
              <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">Fleet Summary Table</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-white">
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Vessel Name</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Capacity</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Bookings</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Revenue</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Avg/Booking</th>
                      <th className="px-6 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Utilization</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {reports.vesselPerformance.map((vessel, index) => {
                      const avgPerBooking = vessel.bookings_count > 0 ? vessel.revenue / vessel.bookings_count : 0;
                      const utilization = vessel.seat_capacity > 0 ? ((vessel.bookings_count / vessel.seat_capacity) * 100) : 0;

                      return (
                        <tr key={index} className="hover:bg-white transition-colors duration-200">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0"></div>
                              <span className="text-sm font-medium text-slate-900">{vessel.vessel_name}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {vessel.seat_capacity} seats
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {vessel.bookings_count}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-emerald-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(vessel.revenue)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500" style={{ fontVariantNumeric: 'tabular-nums' }}>
                            {formatCurrency(avgPerBooking)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="w-16 bg-white  rounded-full h-2 overflow-hidden border border-slate-200">
                                <div
                                  className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all"
                                  style={{ width: `${Math.min(utilization, 100)}%` }}
                                ></div>
                              </div>
                              <span className="text-sm text-slate-600 font-medium" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                {utilization.toFixed(1)}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========== SALES TAB ========== */}
      {activeTab === "sales" && (() => {
        const teamAgents = selectedTeamId !== null && salesData?.agents
          ? salesData.agents.filter((a: any) => (a.team_id || null) === selectedTeamId)
          : [];
        const selectedTeam = selectedTeamId !== null && salesData?.byTeam
          ? salesData.byTeam.find((t: any) => (t.team_id || null) === selectedTeamId)
          : null;
        const chartData = salesData?.dailyRevenue || [];
        const chartMax = Math.max(...chartData.map((d: any) => Number(d.revenue)), 1);

        return (
        <div className="space-y-5">
          {/* Period Filter + Export */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: "today", label: "Today" },
                { id: "week", label: "This Week" },
                { id: "month", label: "This Month" },
                { id: "all", label: "All Time" },
              ].map(p => (
                <button key={p.id} onClick={() => { setSalesPeriod(p.id); setSelectedTeamId(null); setSelectedPaymentCode(null); setSelectedAgentId(null); setCustomDateFrom(""); setCustomDateTo(""); loadSales(p.id, null); }}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium border transition-all ${salesPeriod === p.id ? "bg-violet-50 text-violet-700 border-violet-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"}`}>
                  {p.label}
                </button>
              ))}

              {/* Custom date range */}
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full border transition-all ${salesPeriod === "custom" ? "bg-violet-50 border-violet-300" : "bg-white border-slate-200"}`}>
                <svg className="w-3.5 h-3.5 text-slate-400 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <input
                  type="date"
                  value={customDateFrom}
                  onChange={(e) => setCustomDateFrom(e.target.value)}
                  className="bg-transparent text-[12px] text-slate-700 focus:outline-none w-[110px]"
                />
                <span className="text-slate-400 text-[11px]">→</span>
                <input
                  type="date"
                  value={customDateTo}
                  onChange={(e) => setCustomDateTo(e.target.value)}
                  className="bg-transparent text-[12px] text-slate-700 focus:outline-none w-[110px]"
                />
                <button
                  onClick={() => {
                    if (!customDateFrom || !customDateTo) return;
                    setSalesPeriod("custom");
                    setSelectedTeamId(null);
                    setSelectedPaymentCode(null);
                    setSelectedAgentId(null);
                    loadSales("custom", null, customDateFrom, customDateTo);
                  }}
                  disabled={!customDateFrom || !customDateTo}
                  className="px-2.5 py-0.5 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold rounded-full transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>

              {salesLoading && <div className="w-4 h-4 border-2 border-violet-200 border-t-violet-600 rounded-full animate-spin" />}
            </div>
            <div className="relative">
              <button
                onClick={() => setExportMenuOpen(!exportMenuOpen)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-full text-[12px] font-medium transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
                <svg className="w-3 h-3 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {exportMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-44 bg-white border border-slate-200 rounded-xl shadow-xl z-20 overflow-hidden animate-fade-in">
                    <button
                      onClick={() => { exportSalesData("xlsx"); setExportMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">Excel (.xlsx)</p>
                        <p className="text-[10px] text-slate-400">Multi-sheet workbook</p>
                      </div>
                    </button>
                    <div className="border-t border-slate-100" />
                    <button
                      onClick={() => { exportSalesData("csv"); setExportMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[12px] font-medium text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="text-left">
                        <p className="font-semibold">CSV (.csv)</p>
                        <p className="text-[10px] text-slate-400">Plain text format</p>
                      </div>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Top Stats Row — Subtle accents */}
          {salesData?.totals && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {/* Bookings */}
              <div className="card p-5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Bookings</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5" style={{ fontVariantNumeric: "tabular-nums" }}>{salesData.totals.total_bookings}</p>
                </div>
              </div>

              {/* Revenue */}
              <div className="card p-5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Revenue</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5 truncate" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(salesData.totals.total_revenue)}</p>
                </div>
              </div>

              {/* Teams */}
              <div className="card p-5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Teams</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{salesData.byTeam?.length || 0}</p>
                </div>
              </div>

              {/* Agents */}
              <div className="card p-5 flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Agents</p>
                  <p className="text-xl font-bold text-slate-900 mt-0.5">{salesData.agents?.length || 0}</p>
                </div>
              </div>
            </div>
          )}

          {/* Teams + Agents + Payment Methods grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Teams — clickable for drill-down */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-800">Sales by Team</h3>
                {selectedTeamId !== null && (
                  <button onClick={() => { setSelectedTeamId(null); loadSales(salesPeriod, null, customDateFrom || undefined, customDateTo || undefined, selectedPaymentCode || undefined, selectedAgentId ?? undefined); }} className="text-[11px] text-violet-600 font-medium hover:text-violet-700 transition-colors">
                    Show all
                  </button>
                )}
              </div>
              {salesData?.byTeam?.length > 0 ? (
                <div className="divide-y divide-slate-50">
                  {salesData.byTeam.map((team: any, i: number) => {
                    const maxRev = Math.max(...salesData.byTeam.map((t: any) => Number(t.revenue)), 1);
                    const pct = (Number(team.revenue) / maxRev) * 100;
                    const isSelected = (team.team_id || null) === selectedTeamId;
                    return (
                      <div key={i} onClick={() => {
                          const newId = isSelected ? null : (team.team_id || null);
                          setSelectedTeamId(newId);
                          loadSales(salesPeriod, newId, customDateFrom || undefined, customDateTo || undefined, selectedPaymentCode || undefined, selectedAgentId ?? undefined);
                        }}
                        className={`px-5 py-3 cursor-pointer transition-all ${isSelected ? "bg-violet-50" : "hover:bg-slate-50/50"}`}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2">
                            {team.color && <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: team.color }} />}
                            <span className={`text-[13px] font-medium ${isSelected ? "text-violet-700" : "text-slate-800"}`}>{team.team_name || "Unassigned"}</span>
                            {team.team_code && <span className="text-[10px] font-mono text-slate-400">#{team.team_code}</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(team.revenue)}</span>
                            <svg className={`w-3.5 h-3.5 transition-transform ${isSelected ? "rotate-90 text-violet-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${pct}%`,
                                background: `linear-gradient(90deg, ${(team.color || '#8b5cf6')}99, ${team.color || '#8b5cf6'})`
                              }}
                            />
                          </div>
                          <span className="text-[11px] text-slate-400 w-16 text-right">{team.bookings} tickets</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center text-[12px] text-slate-400">No team data</div>
              )}
            </div>

            {/* Agents — clickable for drill-down, filters teams/payments/charts */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {selectedTeam ? (
                    <>
                      {selectedTeam.color && <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: selectedTeam.color }} />}
                      <h3 className="text-[13px] font-semibold text-slate-800">{selectedTeam.team_name} — Agents</h3>
                    </>
                  ) : (
                    <h3 className="text-[13px] font-semibold text-slate-800">All Agents</h3>
                  )}
                </div>
                {selectedAgentId !== null && (
                  <button onClick={() => { setSelectedAgentId(null); loadSales(salesPeriod, selectedTeamId, customDateFrom || undefined, customDateTo || undefined, selectedPaymentCode || undefined); }} className="text-[11px] text-violet-600 font-medium hover:text-violet-700 transition-colors">
                    Show all
                  </button>
                )}
              </div>
              {(() => {
                const agentList = selectedTeamId !== null ? teamAgents : (salesData?.agents || []);
                if (agentList.length === 0) return <div className="py-12 text-center text-[12px] text-slate-400">{selectedTeamId !== null ? "No agents in this team" : "No agent data"}</div>;
                const maxRev = Math.max(...agentList.map((a: any) => Number(a.revenue)), 1);
                return (
                  <div className="divide-y divide-slate-50">
                    {agentList.map((agent: any, i: number) => {
                      const pct = (Number(agent.revenue) / maxRev) * 100;
                      const isSelected = selectedAgentId === agent.user_id;
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            const next = isSelected ? null : agent.user_id;
                            setSelectedAgentId(next);
                            loadSales(salesPeriod, selectedTeamId, customDateFrom || undefined, customDateTo || undefined, selectedPaymentCode || undefined, next ?? undefined);
                          }}
                          className={`px-5 py-3 cursor-pointer transition-all ${isSelected ? "bg-violet-50" : "hover:bg-slate-50/50"}`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center text-violet-700 text-[10px] font-bold flex-shrink-0">
                                {(agent.first_name || '?')[0].toUpperCase()}
                              </div>
                              <div>
                                <span className={`text-[13px] font-medium ${isSelected ? "text-violet-700" : "text-slate-800"}`}>{(agent.first_name || '') + ' ' + (agent.last_name || '')}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-slate-400">T-{agent.terminal_id || '??'}</span>
                                  {agent.team_name && !selectedTeamId && <span className="text-[10px] text-slate-400">{agent.team_name}</span>}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(agent.revenue)}</span>
                              <svg className={`w-3.5 h-3.5 transition-transform ${isSelected ? "rotate-90 text-violet-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: "linear-gradient(90deg, #34d399, #10b981)"
                                }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400 w-16 text-right">{agent.bookings} tickets</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>

            {/* Sales by Payment — clickable for drill-down, filters teams/agents/charts */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-[13px] font-semibold text-slate-800">Sales by Payment</h3>
                {selectedPaymentCode && (
                  <button onClick={() => { setSelectedPaymentCode(null); loadSales(salesPeriod, selectedTeamId, customDateFrom || undefined, customDateTo || undefined, undefined, selectedAgentId ?? undefined); }} className="text-[11px] text-violet-600 font-medium hover:text-violet-700 transition-colors">
                    Show all
                  </button>
                )}
              </div>
              {salesData?.byPaymentMethod?.length > 0 ? (() => {
                const pmList = salesData.byPaymentMethod;
                const maxRev = Math.max(...pmList.map((p: any) => Number(p.revenue)), 1);
                return (
                  <div className="divide-y divide-slate-50">
                    {pmList.map((pm: any, i: number) => {
                      const pct = (Number(pm.revenue) / maxRev) * 100;
                      const isSelected = selectedPaymentCode === pm.code;
                      return (
                        <div
                          key={i}
                          onClick={() => {
                            const next = isSelected ? null : pm.code;
                            setSelectedPaymentCode(next);
                            loadSales(salesPeriod, selectedTeamId, customDateFrom || undefined, customDateTo || undefined, next || undefined, selectedAgentId ?? undefined);
                          }}
                          className={`px-5 py-3 cursor-pointer transition-all ${isSelected ? "bg-violet-50" : "hover:bg-slate-50/50"}`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2">
                              <span className={`text-[13px] font-medium ${isSelected ? "text-violet-700" : "text-slate-800"}`}>{pm.name}</span>
                              <span className="text-[10px] font-mono text-slate-400">{pm.code}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-semibold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(pm.revenue)}</span>
                              <svg className={`w-3.5 h-3.5 transition-transform ${isSelected ? "rotate-90 text-violet-600" : "text-slate-300"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${pct}%`,
                                  background: "linear-gradient(90deg, #a78bfa, #7c3aed)",
                                }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400 w-16 text-right">{pm.count} tickets</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })() : (
                <div className="py-12 text-center text-[12px] text-slate-400">No payment data</div>
              )}
            </div>
          </div>

          {/* Charts Row */}
          {chartData.length > 0 && (() => {
            const totalRev = chartData.reduce((a: number, d: any) => a + Number(d.revenue), 0);
            const avgRev = totalRev / chartData.length;
            const areaData = chartData.map((d: any) => ({
              date: new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
              revenue: Number(d.revenue),
              bookings: Number(d.bookings),
            }));

            const teams = (salesData?.byTeam || []).filter((t: any) => Number(t.revenue) > 0);
            const defaultColors = ["#7c3aed", "#2563eb", "#059669", "#d97706", "#e11d48", "#0891b2"];
            const pieData = teams.map((t: any, i: number) => ({
              name: t.team_name || "Unassigned",
              value: Number(t.revenue),
              bookings: Number(t.bookings),
              color: t.color || defaultColors[i % defaultColors.length],
            }));

            const statusColors: Record<string, string> = {
              confirmed: "#10b981", boarded: "#3b82f6", cancelled: "#ef4444",
              completed: "#8b5cf6", invalidated: "#94a3b8"
            };
            const statusData = (salesData?.statusBreakdown || []).map((s: any) => ({
              name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
              count: Number(s.count),
              revenue: Number(s.revenue),
              fill: statusColors[s.status] || "#94a3b8",
            }));

            return (
              <>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Area Chart — Revenue Trend */}
                <div className="card p-5 lg:col-span-2">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-[13px] font-semibold text-slate-800">Revenue Trend</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">{chartData.length} day{chartData.length !== 1 ? 's' : ''} · avg {formatCurrency(avgRev)}/day</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total</p>
                      <p className="text-xl font-bold text-slate-900" style={{ fontVariantNumeric: "tabular-nums" }}>{formatCurrency(totalRev)}</p>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={areaData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--color-violet-500)" stopOpacity={0.4} />
                          <stop offset="100%" stopColor="var(--color-violet-500)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}`} />
                      <Tooltip
                        contentStyle={{
                          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                          boxShadow: "0 10px 25px rgba(0,0,0,0.08)", fontSize: 12, padding: "8px 12px"
                        }}
                        formatter={(value: any, name: string) => [
                          name === "revenue" ? formatCurrency(value) : value,
                          name === "revenue" ? "Revenue" : "Bookings"
                        ]}
                        labelStyle={{ color: "#64748b", fontSize: 11, marginBottom: 4 }}
                      />
                      <Area type="monotone" dataKey="revenue" stroke="var(--color-violet-600)" strokeWidth={2.5} fill="url(#colorRevenue)" activeDot={{ r: 5, fill: "var(--color-violet-600)", stroke: "#fff", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Pie Chart — Team Distribution */}
                {pieData.length > 0 && (
                  <div className="card p-5">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h3 className="text-[13px] font-semibold text-slate-800">Team Distribution</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%" cy="50%"
                          innerRadius={50} outerRadius={75}
                          paddingAngle={2}
                          dataKey="value"
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {pieData.map((entry: any, i: number) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                            boxShadow: "0 10px 25px rgba(0,0,0,0.08)", fontSize: 12, padding: "8px 12px"
                          }}
                          formatter={(value: any) => formatCurrency(value)}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 space-y-1.5">
                      {pieData.slice(0, 4).map((t: any, i: number) => {
                        const total = pieData.reduce((a: number, p: any) => a + p.value, 0);
                        const pct = (t.value / total) * 100;
                        return (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: t.color }} />
                              <span className="text-slate-600 truncate">{t.name}</span>
                            </div>
                            <span className="text-slate-800 font-semibold tabular-nums">{pct.toFixed(0)}%</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Bookings per day bar chart + Status donut */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                {/* Bar Chart — Bookings per day */}
                <div className="card p-5 lg:col-span-2">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-[13px] font-semibold text-slate-800">Bookings per Day</h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">Daily booking volume</p>
                      </div>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={areaData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="date" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                      <Tooltip
                        cursor={{ fill: "rgba(124, 58, 237, 0.08)" }}
                        contentStyle={{
                          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                          boxShadow: "0 10px 25px rgba(0,0,0,0.08)", fontSize: 12, padding: "8px 12px"
                        }}
                      />
                      <Bar dataKey="bookings" fill="var(--color-violet-500)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Radial/Donut — Booking Status */}
                {statusData.length > 0 && (
                  <div className="card p-5">
                    <div className="flex items-center gap-2.5 mb-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                      </div>
                      <h3 className="text-[13px] font-semibold text-slate-800">Booking Status</h3>
                    </div>
                    <ResponsiveContainer width="100%" height={180}>
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%" cy="50%"
                          innerRadius={45} outerRadius={75}
                          paddingAngle={3}
                          dataKey="count"
                          stroke="#fff"
                          strokeWidth={2}
                        >
                          {statusData.map((entry: any, i: number) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
                            boxShadow: "0 10px 25px rgba(0,0,0,0.08)", fontSize: 12, padding: "8px 12px"
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="mt-3 space-y-1.5">
                      {statusData.map((s: any, i: number) => {
                        const total = statusData.reduce((a: number, x: any) => a + x.count, 0);
                        const pct = total > 0 ? (s.count / total) * 100 : 0;
                        return (
                          <div key={i} className="flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: s.fill }} />
                              <span className="text-slate-600 truncate">{s.name}</span>
                            </div>
                            <span className="text-slate-800 font-semibold tabular-nums">{s.count} ({pct.toFixed(0)}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              </>
            );
          })()}

        </div>
        );
      })()}

      {/* ========== PAYMENTS TAB ========== */}
      {activeTab === "payments" && (() => {
        const breakdown =
          (salesData && salesData.byPaymentMethod) ||
          (reports && reports.paymentMethodBreakdown) ||
          [];
        const totalCount = breakdown.reduce((a: number, p: any) => a + Number(p.count || 0), 0);
        const totalRevenue = breakdown.reduce((a: number, p: any) => a + Number(p.revenue || 0), 0);
        const maxRevenue = Math.max(...breakdown.map((p: any) => Number(p.revenue || 0)), 1);

        const PIE_COLORS = ["#7c3aed", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#64748b", "#ef4444", "#8b5cf6"];

        return (
          <div className="space-y-5">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card p-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Payment Methods</p>
                <p className="text-xl font-bold text-slate-900 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {breakdown.length}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Bookings</p>
                <p className="text-xl font-bold text-slate-900 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {totalCount}
                </p>
              </div>
              <div className="card p-4">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Total Revenue</p>
                <p className="text-xl font-bold text-emerald-600 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrency(totalRevenue)}
                </p>
              </div>
            </div>

            {breakdown.length === 0 ? (
              <div className="card p-12 text-center">
                <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                  <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900 mb-1">No payment data yet</h3>
                <p className="text-xs text-slate-500">Payment method reporting will appear as bookings are created with a payment type.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* Pie chart */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <h3 className="text-[13px] font-semibold text-slate-800">Revenue Share by Payment Method</h3>
                  </div>
                  <div className="p-5">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={breakdown.map((p: any) => ({ name: p.name, value: Number(p.revenue || 0) }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={2}
                        >
                          {breakdown.map((_: any, i: number) => (
                            <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                        <Legend iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Breakdown table with bars */}
                <div className="card overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-100">
                    <h3 className="text-[13px] font-semibold text-slate-800">Breakdown</h3>
                  </div>
                  <div className="p-5 space-y-4">
                    {breakdown.map((pm: any, i: number) => {
                      const pct = totalRevenue > 0 ? (Number(pm.revenue) / totalRevenue) * 100 : 0;
                      const barPct = (Number(pm.revenue) / maxRevenue) * 100;
                      return (
                        <div key={i}>
                          <div className="flex items-center justify-between mb-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                              />
                              <span className="text-[13px] font-semibold text-slate-800 truncate">{pm.name}</span>
                              <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                                {pm.code}
                              </span>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <div className="text-[12px] font-bold text-emerald-600" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {formatCurrency(pm.revenue)}
                              </div>
                              <div className="text-[10px] text-slate-400" style={{ fontVariantNumeric: "tabular-nums" }}>
                                {pm.count} bookings · {pct.toFixed(1)}%
                              </div>
                            </div>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${barPct}%`,
                                background: PIE_COLORS[i % PIE_COLORS.length],
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ========== VALIDATION TAB ========== */}
      {activeTab === "validation" && (
        <div className="space-y-5">
          {/* Status counts */}
          {validationData?.statusCounts && (() => {
            const s = validationData.statusCounts;
            return (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {[
                  { label: "Boarded", value: s.boarded, color: "text-emerald-600" },
                  { label: "Pending", value: s.pending, color: "text-violet-600" },
                  { label: "Expired", value: s.expired, color: "text-amber-600" },
                  { label: "Invalidated", value: s.invalidated, color: "text-slate-500" },
                  { label: "Total", value: s.total, color: "text-slate-900" },
                ].map((c, i) => (
                  <div key={i} className="card p-4 text-center">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">{c.label}</p>
                    <p className={`text-xl font-bold mt-1 ${c.color}`} style={{ fontVariantNumeric: "tabular-nums" }}>{c.value || 0}</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* Scan counts */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Scans This Week</p>
              <p className="text-xl font-bold text-slate-900 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>{validationData?.weekScans || 0}</p>
            </div>
            <div className="card p-4">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Scans This Month</p>
              <p className="text-xl font-bold text-slate-900 mt-1" style={{ fontVariantNumeric: "tabular-nums" }}>{validationData?.monthScans || 0}</p>
            </div>
          </div>

          {/* By Officer */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100">
              <h3 className="text-[13px] font-semibold text-slate-800">Validation by Dock Officer</h3>
            </div>
            {validationData?.byOfficer?.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/50">
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Officer</th>
                      <th className="text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Terminal</th>
                      <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Total Scans</th>
                      <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Valid</th>
                      <th className="text-right text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-5 py-3">Last Scan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {validationData.byOfficer.map((officer, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3 text-[13px] font-medium text-slate-800">{officer.first_name} {officer.last_name || ''}</td>
                        <td className="px-5 py-3"><span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">T-{officer.terminal_id || '??'}</span></td>
                        <td className="px-5 py-3 text-right text-[13px] font-semibold text-slate-800" style={{ fontVariantNumeric: "tabular-nums" }}>{officer.total_scans}</td>
                        <td className="px-5 py-3 text-right text-[13px] font-semibold text-emerald-600" style={{ fontVariantNumeric: "tabular-nums" }}>{officer.valid_scans}</td>
                        <td className="px-5 py-3 text-right text-[12px] text-slate-500">{officer.last_scan ? formatDate(officer.last_scan) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-[12px] text-slate-400">No scan data available</div>
            )}
          </div>
        </div>
      )}

      {/* ========== ALL BOOKINGS TAB ========== */}
      {activeTab === "bookings" && (
        <div className="space-y-5">
          {/* Ticket Search Banner */}
          <div className="glass-card p-4 flex items-center justify-between bg-gradient-to-r from-violet-50/80 to-violet-100/60 border-violet-200/50 animate-fade-in-up" style={{ animationDelay: '0.05s' }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-violet-100/80  rounded-xl flex items-center justify-center flex-shrink-0 border border-violet-200/50">
                <svg className="w-5 h-5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-teal-900">Need advanced ticket search?</p>
                <p className="text-xs text-violet-700">Search by ticket ID, customer name, filter by status, dates, and check expiry.</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/tickets")}
              className="px-4 py-2 bg-violet-600 text-white text-sm font-medium rounded-xl hover:bg-violet-700 transition-all duration-200 flex-shrink-0 shadow-lg shadow-violet-500/25"
            >
              Ticket Search
            </button>
          </div>

          <div className="glass-card animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-slate-500 to-slate-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-900">All Booking Details</h3>
              </div>
              <span className="text-xs font-medium text-slate-400" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {bookings.length} record{bookings.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              {bookings.length > 0 ? (
                <table className="min-w-full">
                  <thead>
                    <tr className="bg-white">
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Ticket ID</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Route</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Vessel</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Passenger Type</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Travel Date</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Total Price</th>
                      <th className="px-6 py-4 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Booked By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bookings.map((booking, index) => (
                      <tr key={index} className="group hover:bg-white transition-colors duration-200">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-mono font-semibold text-violet-700">{booking.ticket_id}</span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-slate-900">{booking.customer_name}</div>
                            <div className="text-xs text-slate-500">{booking.customer_email}</div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-slate-900">{booking.source}</span>
                            <svg className="w-3 h-3 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                            </svg>
                            <span className="text-sm text-slate-900">{booking.destination}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                          {booking.vessel_name || 'Not assigned'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getPassengerTypeColor(booking.passenger_type)}`}>
                            {booking.passenger_type}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatDate(booking.travel_date)}</td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(booking.status)}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotColor(booking.status)}`}></span>
                            {booking.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-slate-900" style={{ fontVariantNumeric: 'tabular-nums' }}>{formatCurrency(booking.total_price)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500">{booking.booked_by_email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-16">
                  <div className="w-14 h-14 bg-white  rounded-2xl flex items-center justify-center mx-auto mb-3 border border-slate-200">
                    <svg className="w-7 h-7 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900 mb-1">No bookings found</h3>
                  <p className="text-xs text-slate-500">Bookings will appear here once customers start booking tickets</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
