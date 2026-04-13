import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { Bookings, Services } from "../services/api";
import { QRCodeSVG } from "qrcode.react";
import TicketDocument from "./TicketDocument";

/* ─── Inline SVG Icons ─── */
const SearchIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const XIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const PrinterIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
  </svg>
);

const FilterIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
  </svg>
);

const TicketIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
  </svg>
);

const UserIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
  </svg>
);

const MapIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
  </svg>
);

const CurrencyIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const NoteIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const ClockIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ChevronLeftIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const ChevronRightIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

export default function TicketSearch() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmInvalidate, setConfirmInvalidate] = useState(null); // { ticket }
  const currentRole = localStorage.getItem("role") || "agent";
  const isAdmin = currentRole === "admin" || currentRole === "super_admin";

  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [routeFilter, setRouteFilter] = useState("");
  const [vesselFilter, setVesselFilter] = useState("");

  const [tickets, setTickets] = useState([]);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0
  });

  const [routes, setRoutes] = useState([]);
  const [vessels, setVessels] = useState([]);

  const [selectedTicket, setSelectedTicket] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  useEffect(() => {
    loadFilters();
    performSearch(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFilters = async () => {
    try {
      const [routesRes, vesselsRes] = await Promise.all([
        Services.getRoutes(),
        Services.getVessels()
      ]);
      setRoutes(routesRes.routes || routesRes || []);
      setVessels(vesselsRes.vessels || vesselsRes || []);
    } catch (err) {
      console.error("Error loading filters:", err);
    }
  };

  const performSearch = async (page = 1) => {
    setLoading(true);
    setError("");

    try {
      const params: any = {
        page,
        limit: 20
      };

      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      if (routeFilter) params.route_id = routeFilter;
      if (vesselFilter) params.vessel_id = vesselFilter;

      const response = await Bookings.searchBookings(params);
      setTickets(response.bookings || []);
      setPagination(response.pagination || {
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0
      });
    } catch (err) {
      setError(err.message || "Failed to search tickets");
      setTickets([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    performSearch(1);
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setStatusFilter("all");
    setDateFrom("");
    setDateTo("");
    setRouteFilter("");
    setVesselFilter("");
    setTimeout(() => performSearch(1), 0);
  };

  const handleTicketClick = (ticket) => {
    setSelectedTicket(ticket);
    setIsDetailModalOpen(true);
  };

  const handlePageChange = (newPage) => {
    performSearch(newPage);
  };

  /* status border color for ticket cards */
  const getStatusBorderColor = (ticket) => {
    if (ticket.is_expired === 1) return "border-l-rose-400";
    const s = ticket.status?.toLowerCase() || "confirmed";
    const map = {
      confirmed: "border-l-emerald-400",
      boarded: "border-l-amber-400",
      cancelled: "border-l-slate-400",
      completed: "border-l-violet-400",
      invalidated: "border-l-slate-300"
    };
    return map[s] || "border-l-emerald-400";
  };

  return (
    <div className="p-3 sm:p-6 max-w-7xl mx-auto">
      {/* Page Header — hidden on mobile (breadcrumb in top bar already shows it) */}
      <div className="hidden sm:block mb-8 animate-fade-in-up">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-violet-600 rounded-xl shadow-lg shadow-violet-500/20">
            <SearchIcon className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Ticket Search</h1>
            <p className="text-sm text-slate-500">Search and manage all booking tickets</p>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-3 sm:mb-6 p-3 sm:p-4 glass-card border-rose-200/60 bg-rose-50/80 text-rose-800 text-[12px] sm:text-sm animate-fade-in-up flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Search & Filters Card */}
      <div className="glass-card glass-card-hover p-3 sm:p-6 mb-3 sm:mb-8 animate-fade-in-up" style={{ animationDelay: '50ms' }}>
        <form onSubmit={handleSearch} className="space-y-3 sm:space-y-5">
          {/* Search Bar */}
          <div className="flex gap-2 sm:gap-3">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 sm:left-3.5 top-1/2 -translate-y-1/2 w-[18px] h-[18px] sm:w-5 sm:h-5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tickets..."
                className="glass-input w-full pl-10 sm:pl-11 pr-3 sm:pr-4 py-2.5 text-[13px] sm:text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-primary px-3 sm:px-6 flex items-center gap-2 text-[13px] sm:text-sm"
            >
              <SearchIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
            </button>
            {/* Mobile: Filters toggle */}
            <button
              type="button"
              onClick={() => setShowFilters(v => !v)}
              className={`sm:hidden w-10 h-10 flex items-center justify-center rounded-xl border transition-all ${
                showFilters
                  ? 'bg-violet-600 text-white border-violet-600'
                  : 'bg-white border-slate-200 text-slate-500'
              }`}
              title="Filters"
            >
              <FilterIcon className="w-4 h-4" />
            </button>
          </div>

          {/* Filters — always shown on desktop, toggle on mobile */}
          <div className={`${showFilters ? 'block' : 'hidden'} sm:block`}>
            <div className="hidden sm:flex items-center gap-2 mb-3">
              <FilterIcon className="w-4 h-4 text-slate-400" />
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Filters</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-3">
              {/* Status Filter */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="glass-select text-[12px] sm:text-sm"
              >
                <option value="all">All Status</option>
                <option value="confirmed">Confirmed</option>
                <option value="boarded">Boarded</option>
                <option value="cancelled">Cancelled</option>
                <option value="completed">Completed</option>
                <option value="expired">Expired</option>
                <option value="invalidated">Invalidated</option>
              </select>

              {/* Date From */}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="glass-input text-[12px] sm:text-sm"
              />

              {/* Date To */}
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="glass-input text-[12px] sm:text-sm"
              />

              {/* Route Filter */}
              <select
                value={routeFilter}
                onChange={(e) => setRouteFilter(e.target.value)}
                className="glass-select text-[12px] sm:text-sm"
              >
                <option value="">All Routes</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.source} → {route.destination}
                  </option>
                ))}
              </select>

              {/* Vessel Filter */}
              <select
                value={vesselFilter}
                onChange={(e) => setVesselFilter(e.target.value)}
                className="glass-select text-[12px] sm:text-sm col-span-2 sm:col-span-1"
              >
                <option value="">All Vessels</option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Button */}
            <div className="flex justify-end mt-2 sm:mt-3">
              <button
                type="button"
                onClick={handleResetFilters}
                className="btn-ghost text-[12px] sm:text-sm"
              >
                Reset Filters
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Results Header */}
      <div className="flex items-center justify-between mb-3 sm:mb-5 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-3">
          <TicketIcon className="w-5 h-5 text-slate-400" />
          <h2 className="text-lg font-semibold text-slate-900">Results</h2>
          <span className="badge bg-slate-100 text-slate-700 border-slate-200">
            {pagination.total} {pagination.total === 1 ? 'ticket' : 'tickets'}
          </span>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="w-10 h-10 border-2 border-violet-600 border-t-transparent rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-slate-500">Searching tickets...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && tickets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center glass-card">
          <div className="p-4 bg-slate-100/80 rounded-2xl mb-4">
            <SearchIcon className="w-10 h-10 text-slate-300" />
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-1">No tickets found</h3>
          <p className="text-sm text-slate-500">Try adjusting your search or filter criteria</p>
        </div>
      )}

      {/* Results Grid */}
      {!loading && tickets.length > 0 && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 sm:gap-4 mb-4 sm:mb-8">
            {tickets.map((ticket, index) => (
              <div
                key={ticket.id}
                onClick={() => handleTicketClick(ticket)}
                className={`glass-card glass-card-hover border-l-4 ${getStatusBorderColor(ticket)} p-3 sm:p-5 cursor-pointer transition-all duration-300 hover:shadow-xl animate-fade-in-up`}
                style={{ animationDelay: `${Math.min(index * 50, 500)}ms` }}
              >
                {/* Top Row: Customer Name + Status Badge */}
                <div className="flex items-start justify-between gap-2 mb-1.5 sm:mb-3">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[14px] sm:text-sm font-bold text-slate-900 truncate">{ticket.customer_name}</h3>
                    <span className="font-mono text-[10px] sm:text-xs text-slate-400">{ticket.ticket_id}</span>
                  </div>
                  <div className="flex-shrink-0">{getStatusBadge(ticket)}</div>
                </div>

                {/* Compact info row: Route + Date + Amount */}
                <div className="flex items-center justify-between gap-2 text-[12px] sm:hidden">
                  <div className="min-w-0 flex-1">
                    <p className="text-slate-700 font-semibold truncate">
                      {ticket.source} → {ticket.destination}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {formatDate(ticket.travel_date)} &bull; {ticket.vessel_name || "—"}
                    </p>
                  </div>
                  <p className="text-violet-700 font-bold text-[14px] flex-shrink-0" style={{ color: 'var(--color-violet-700)' }}>
                    FJ${money(ticket.total_price)}
                  </p>
                </div>

                {/* Desktop full info grid */}
                <div className="hidden sm:grid grid-cols-2 gap-3 mb-3 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 font-medium">Route</span>
                    <p className="text-slate-800 font-semibold">{ticket.source} → {ticket.destination}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 font-medium">Travel Date</span>
                    <p className="text-slate-800 font-semibold">{formatDate(ticket.travel_date)}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 font-medium">Vessel</span>
                    <p className="text-slate-800 font-semibold">{ticket.vessel_name || "N/A"}</p>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-slate-400 font-medium">Amount</span>
                    <p className="text-violet-700 font-bold text-base">FJ${money(ticket.total_price)}</p>
                  </div>
                </div>

                {/* Bottom Row: Passenger Type + Booking Type + Invalidate */}
                <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-slate-100/80">
                  <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                    {getPassengerTypeBadge(ticket.passenger_type)}
                    <span className="badge bg-slate-100/80 text-slate-600 border-slate-200 capitalize">
                      {ticket.booking_type?.replace('_', ' ') || 'one way'}
                    </span>
                  </div>
                  {isAdmin && ticket.status !== 'invalidated' && ticket.status !== 'cancelled' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmInvalidate({ ticket }); }}
                      className="text-[11px] font-medium text-slate-400 hover:text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition-colors flex-shrink-0"
                      title="Invalidate ticket"
                    >
                      Invalidate
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 animate-fade-in-up">
              <button
                onClick={() => handlePageChange(pagination.page - 1)}
                disabled={pagination.page === 1}
                className="btn-secondary px-4 py-2 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Previous
              </button>
              <div className="flex items-center gap-1.5">
                {generatePageNumbers(pagination.page, pagination.totalPages).map((p, i) =>
                  p === '...' ? (
                    <span key={`dots-${i}`} className="px-2 text-slate-400 text-sm">...</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => handlePageChange(p)}
                      className={`w-9 h-9 rounded-xl text-sm font-medium transition-all duration-200 ${
                        p === pagination.page
                          ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                          : 'text-slate-600 hover:bg-white hover:shadow-sm'
                      }`}
                    >
                      {p}
                    </button>
                  )
                )}
              </div>
              <button
                onClick={() => handlePageChange(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages}
                className="btn-secondary px-4 py-2 flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Next
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Ticket Detail Modal */}
      {isDetailModalOpen && selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          isOpen={isDetailModalOpen}
          onClose={() => {
            setIsDetailModalOpen(false);
            setSelectedTicket(null);
          }}
        />
      )}

      {/* Invalidate Confirm Modal */}
      {confirmInvalidate && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmInvalidate(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-xs animate-scale-in text-center">
            <div className="px-6 pt-7 pb-5">
              <div className="w-12 h-12 bg-rose-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-200">
                <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
              </div>
              <h3 className="text-[15px] font-bold text-slate-900 mb-2">Invalidate Ticket</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed">
                Invalidate <span className="font-mono font-semibold text-slate-700">{confirmInvalidate.ticket.ticket_id}</span>? This ticket will be marked as invalid and cannot be used for boarding.
              </p>
            </div>
            <div className="px-6 pb-6 flex items-center justify-center gap-3">
              <button onClick={() => setConfirmInvalidate(null)} className="flex-1 px-4 py-2.5 text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await Bookings.updateBookingStatus(confirmInvalidate.ticket.ticket_id, "invalidated");
                    setConfirmInvalidate(null);
                    performSearch();
                  } catch (err) {
                    setError(err.message);
                    setConfirmInvalidate(null);
                  }
                }}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-full transition-colors"
              >
                Invalidate
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

/* ─── Helper Functions ─── */

function formatDate(str) {
  if (!str) return "N/A";
  return new Date(str).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function formatDateTime(str) {
  if (!str) return "N/A";
  return new Date(str).toLocaleString();
}

function money(n) {
  return Number(n || 0).toFixed(2);
}

function generatePageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [];
  pages.push(1);
  if (current > 3) pages.push('...');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.push(i);
  }
  if (current < total - 2) pages.push('...');
  pages.push(total);
  return pages;
}

function getStatusBadge(ticket) {
  if (ticket.is_expired === 1) {
    return <span className="badge badge-expired">Expired</span>;
  }
  const status = ticket.status?.toLowerCase() || 'confirmed';
  const config = {
    confirmed: { cls: 'badge badge-confirmed', label: 'Confirmed' },
    boarded: { cls: 'badge badge-boarded', label: 'Boarded' },
    cancelled: { cls: 'badge badge-cancelled', label: 'Cancelled' },
    completed: { cls: 'badge badge-completed', label: 'Completed' },
    invalidated: { cls: 'badge badge-invalidated', label: 'Invalidated' }
  };
  const c = config[status] || config.confirmed;
  return <span className={c.cls}>{c.label}</span>;
}

function getPassengerTypeBadge(type) {
  const config = {
    adult: { cls: 'badge badge-adult', label: 'Adult' },
    student: { cls: 'badge badge-student', label: 'Student' },
    child: { cls: 'badge badge-child', label: 'Child' },
    infant: { cls: 'badge badge-infant', label: 'Infant' }
  };
  const c = config[type?.toLowerCase()] || config.adult;
  return <span className={c.cls}>{c.label}</span>;
}

/* ─── Ticket Detail Modal ─── */

function TicketDetailModal({ ticket, isOpen, onClose }) {
  const [showPrintView, setShowPrintView] = useState(false);

  const handleReprint = useCallback(() => {
    setShowPrintView(true);
    // Wait for React to render the portal, then print
    setTimeout(() => {
      window.print();
      setTimeout(() => setShowPrintView(false), 1000);
    }, 400);
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  if (!isOpen || !ticket) return null;

  const statusBannerConfig = () => {
    if (ticket.is_expired === 1) {
      return { bg: 'bg-rose-50/80 border-rose-200/60', text: 'text-rose-800', dot: 'bg-rose-500', msg: 'This ticket has expired and is no longer valid for travel.' };
    }
    const s = ticket.status?.toLowerCase();
    if (s === 'boarded') {
      const boardedMsg = `Boarded at ${formatDateTime(ticket.boarded_at)}${ticket.boarded_by_email ? ` by ${ticket.boarded_by_email}` : ''}`;
      return { bg: 'bg-amber-50/80 border-amber-200/60', text: 'text-amber-800', dot: 'bg-amber-500', msg: boardedMsg };
    }
    if (s === 'cancelled') {
      return { bg: 'bg-slate-50/80 border-slate-200/60', text: 'text-slate-700', dot: 'bg-slate-400', msg: 'This ticket was cancelled and is no longer valid.' };
    }
    if (s === 'completed') {
      return { bg: 'bg-violet-50/80 border-violet-200/60', text: 'text-teal-800', dot: 'bg-violet-500', msg: 'Trip completed successfully.' };
    }
    if (s === 'invalidated') {
      return { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400', msg: 'This ticket has been invalidated and cannot be used for boarding.' };
    }
    return { bg: 'bg-emerald-50/80 border-emerald-200/60', text: 'text-emerald-800', dot: 'bg-emerald-500', msg: 'Active - Valid for travel' };
  };

  const banner = statusBannerConfig();

  return (
    <>
      {/* Print view - portal to body so it's a direct child for @media print CSS */}
      {showPrintView && createPortal(
        <div data-print-root="true" style={{ position: 'absolute', left: '-9999px', top: 0 }}>
          <div className="ticket-container">
            <TicketDocument booking={ticket} />
          </div>
        </div>,
        document.body
      )}

      {/* Modal Overlay */}
      <div
        className="fixed inset-0 bg-black/40  flex items-center justify-center z-50 p-4 animate-fade-in-up"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{ animationDuration: '200ms' }}
      >
        <div
          className="glass-card bg-white  max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="sticky top-0 bg-white  border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-violet-600 rounded-xl">
                <TicketIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">Ticket Details</h2>
                <p className="font-mono text-xs text-slate-500">{ticket.ticket_id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100/80 rounded-xl transition-all duration-200"
            >
              <XIcon className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Status Banner */}
            <div className={`${banner.bg} border rounded-xl p-4 flex items-center gap-3 transition-all duration-300`}>
              <div className={`w-2.5 h-2.5 rounded-full ${banner.dot} flex-shrink-0`} />
              <p className={`text-sm font-medium ${banner.text}`}>{banner.msg}</p>
            </div>

            {/* QR Code */}
            {ticket.qr_code_data && (
              <div className="flex justify-center">
                <div className="glass-card p-5 inline-flex flex-col items-center gap-3">
                  <div className="bg-white rounded-xl p-3 shadow-sm">
                    <QRCodeSVG value={ticket.qr_code_data} size={140} level="M" />
                  </div>
                  <span className="text-xs text-slate-400 font-medium">Scan to verify ticket</span>
                </div>
              </div>
            )}

            {/* Customer Information */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <UserIcon className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-slate-900">Customer Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoField label="Name" value={ticket.customer_name} />
                <InfoField label="Email" value={ticket.customer_email || "N/A"} />
                <InfoField label="Phone" value={ticket.customer_phone || "N/A"} />
                <InfoField label="Gender" value={ticket.passenger_gender ? ticket.passenger_gender.charAt(0).toUpperCase() + ticket.passenger_gender.slice(1) : "N/A"} />
              </div>
            </div>

            {/* Travel Information */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <MapIcon className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-slate-900">Travel Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoField label="Route" value={`${ticket.source} → ${ticket.destination}`} />
                <InfoField label="Service Type" value={ticket.service_type_name || "N/A"} />
                <InfoField label="Vessel" value={ticket.vessel_name || "N/A"} />
                <InfoField label="Travel Date" value={formatDate(ticket.travel_date)} />
                {ticket.valid_until && (
                  <div className="space-y-1">
                    <span className="text-xs text-slate-400 font-medium">Valid Until</span>
                    <p className={`font-semibold ${new Date(ticket.valid_until) < new Date() ? "text-rose-600" : "text-slate-800"}`}>
                      {new Date(ticket.valid_until).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </p>
                  </div>
                )}
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Passenger Type</span>
                  <div className="mt-0.5">{getPassengerTypeBadge(ticket.passenger_type)}</div>
                </div>
                <InfoField label="Booking Type" value={(ticket.booking_type?.replace('_', ' ') || 'one way').replace(/\b\w/g, c => c.toUpperCase())} />
              </div>
            </div>

            {/* Pricing */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <CurrencyIcon className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-slate-900">Pricing</h3>
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">Base Price</span>
                  <span className="text-slate-800 font-medium">FJ${money(ticket.base_price)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500">VAT (9%)</span>
                  <span className="text-slate-800 font-medium">FJ${money(ticket.vat_amount)}</span>
                </div>
                <div className="flex justify-between items-center pt-3 border-t border-slate-200/60">
                  <span className="font-bold text-slate-900">Total</span>
                  <span className="font-bold text-xl text-violet-700">FJ${money(ticket.total_price)}</span>
                </div>
              </div>
            </div>

            {/* Notes */}
            {ticket.notes && (
              <div className="glass-card p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <NoteIcon className="w-4 h-4 text-violet-600" />
                  <h3 className="text-sm font-bold text-slate-900">Notes</h3>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap bg-slate-50/50 rounded-lg p-3 border border-slate-100">
                  {ticket.notes}
                </p>
              </div>
            )}

            {/* Audit Information */}
            <div className="glass-card p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ClockIcon className="w-4 h-4 text-violet-600" />
                <h3 className="text-sm font-bold text-slate-900">Audit Information</h3>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoField label="Booked At" value={formatDateTime(ticket.booking_date || ticket.created_at)} />
                <InfoField label="Booked By" value={
                  ticket.booked_by_terminal || ticket.booked_by_first_name
                    ? `${ticket.booked_by_terminal ? `T-${ticket.booked_by_terminal} | ` : ''}${ticket.booked_by_first_name ? `${ticket.booked_by_first_name} ${ticket.booked_by_last_name || ''}`.trim() : ''}${ticket.booked_by_email ? ` (${ticket.booked_by_email})` : ''}`.trim()
                    : ticket.booked_by_email || "N/A"
                } />
                <div className="space-y-1">
                  <span className="text-xs text-slate-400 font-medium">Status</span>
                  <div className="mt-0.5">{getStatusBadge(ticket)}</div>
                </div>
                <InfoField label="Expired" value={ticket.is_expired === 1 ? "Yes" : "No"} />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="sticky bottom-0 bg-white  border-t border-slate-200 px-6 py-4 flex gap-3">
            <button
              onClick={handleReprint}
              className="btn-secondary flex-1 flex items-center justify-center gap-2"
            >
              <PrinterIcon className="w-4 h-4" />
              Reprint Ticket
            </button>
            <button
              onClick={onClose}
              className="btn-primary flex-1"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

/* ─── Reusable info field ─── */
function InfoField({ label, value }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <p className="text-slate-800 font-semibold">{value}</p>
    </div>
  );
}
