import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Scanning } from "../services/api";

export default function TicketVerify() {
  const { ticketId } = useParams();
  const [ticket, setTicket] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [canBoard, setCanBoard] = useState(false);
  const [loading, setLoading] = useState(true);
  const [boarding, setBoarding] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const role = localStorage.getItem("role");

  useEffect(() => {
    if (ticketId) loadTicket();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const loadTicket = async () => {
    try {
      setLoading(true);
      setError("");
      const data = await Scanning.verifyTicket(ticketId);
      setTicket(data.ticket);
      setScanStatus(data.scanStatus);
      setCanBoard(data.canBoard);
    } catch (e) {
      setError(e.message || "Ticket not found");
    } finally {
      setLoading(false);
    }
  };

  const handleBoard = async () => {
    try {
      setBoarding(true);
      setMessage("");
      const data = await Scanning.boardPassenger(ticketId);
      setTicket(data.ticket);
      setScanStatus(data.scanResult === "valid" ? "boarded_now" : data.scanResult);
      setCanBoard(false);
      setMessage(data.message);
    } catch (e) {
      setError(e.message);
    } finally {
      setBoarding(false);
    }
  };

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }) : "\u2014";
  const fmtTime = (d) =>
    d ? new Date(d).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }) : "";
  const money = (n) => `FJ$${(isFinite(+n) ? Number(n) : 0).toFixed(2)}`;

  const statusConfig = {
    valid: { bg: "bg-emerald-50/80", border: "border-emerald-300/60", text: "text-emerald-800", badge: "badge badge-confirmed", label: "VALID - Ready to Board", dot: "bg-emerald-500", glow: "" },
    boarded_now: { bg: "bg-emerald-50/80", border: "border-emerald-300/60", text: "text-emerald-800", badge: "badge badge-confirmed", label: "BOARDED SUCCESSFULLY", dot: "bg-emerald-500", glow: "" },
    already_boarded: { bg: "bg-amber-50/80", border: "border-amber-300/60", text: "text-amber-800", badge: "badge badge-expired", label: "ALREADY BOARDED", dot: "bg-amber-500", glow: "" },
    cancelled: { bg: "bg-rose-50/80", border: "border-rose-300/60", text: "text-rose-800", badge: "badge badge-cancelled", label: "CANCELLED", dot: "bg-rose-500", glow: "" },
    expired: { bg: "bg-amber-50/80", border: "border-amber-300/60", text: "text-amber-800", badge: "badge badge-expired", label: "TICKET EXPIRED", dot: "bg-amber-500", glow: "" },
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Verifying Ticket</span>
            <span className="text-[12px] text-slate-400">Checking ticket details...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error && !ticket) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-lg mx-auto animate-scale-in">
          <div className="glass-card bg-rose-50/60 border-rose-200/50 p-8 text-center ">
            <div className="w-16 h-16 bg-rose-100/80  rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-rose-800 mb-1">Ticket Not Found</h3>
            <p className="text-sm text-rose-600">{error}</p>
            <p className="text-xs text-rose-500 mt-2 font-mono bg-rose-100/50 px-3 py-1.5 rounded-lg inline-block">{ticketId}</p>
          </div>
        </div>
      </div>
    );
  }

  const cfg = statusConfig[scanStatus] || statusConfig.valid;

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* Header */}
        <div className="animate-fade-in-up">
          <h1 className="text-xl font-extrabold text-slate-900">Ticket Verification</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Ticket: <span className="font-mono bg-slate-100/60 px-2 py-0.5 rounded-lg">{ticketId}</span>
          </p>
        </div>

        {/* Status Banner */}
        <div className={`${cfg.bg} ${cfg.border} border  rounded-2xl p-4 ${cfg.glow} animate-scale-in`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={`w-3 h-3 rounded-full ${cfg.dot} animate-pulse`} />
              <span className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</span>
            </div>
            <span className={cfg.badge}>{ticket?.status?.toUpperCase()}</span>
          </div>
        </div>

        {message && (
          <div className="glass-card bg-emerald-50/60 border-emerald-200/50 p-3.5 animate-fade-in-up">
            <p className="text-sm font-medium text-emerald-700 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {message}
            </p>
          </div>
        )}

        {/* Ticket Details */}
        {ticket && (
          <div className="glass-card overflow-hidden animate-fade-in-up delay-200">
            <div className="px-5 py-4 border-b border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Passenger & Travel Details
              </h3>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { label: "Passenger", value: ticket.customer_name, bold: true },
                  { label: "Route", value: `${ticket.source} \u2192 ${ticket.destination}`, bold: true },
                  { label: "Vessel", value: ticket.vessel_name || "\u2014" },
                  { label: "Travel Date", value: fmtDate(ticket.travel_date) },
                  ticket.valid_until && {
                    label: "Valid Until",
                    value: fmtDate(ticket.valid_until),
                    warn: new Date(ticket.valid_until) < new Date(),
                  },
                  { label: "Passenger Type", value: ticket.passenger_type, capitalize: true },
                  { label: "Total Paid", value: money(ticket.total_price), bold: true, accent: true },
                  { label: "Booked By", value: ticket.booked_by_terminal || ticket.booked_by_first_name
                    ? `${ticket.booked_by_terminal ? `T-${ticket.booked_by_terminal}` : ''}${ticket.booked_by_first_name ? ` ${ticket.booked_by_first_name} ${ticket.booked_by_last_name || ''}`.trim() : ''}`.trim()
                    : ticket.booked_by_email },
                  ticket.boarded_at && {
                    label: "Boarded At",
                    value: `${fmtDate(ticket.boarded_at)} ${fmtTime(ticket.boarded_at)}${ticket.boarded_by_email ? ` by ${ticket.boarded_by_email}` : ""}`,
                  },
                ]
                  .filter(Boolean)
                  .map((item, idx) => (
                    <div key={idx} className="bg-white  rounded-xl p-3 border border-slate-200">
                      <p className="text-[11px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">{item.label}</p>
                      <p
                        className={`text-sm ${item.bold ? "font-bold" : "font-semibold"} ${
                          item.warn ? "text-rose-600" : item.accent ? "text-violet-700" : "text-slate-900"
                        } ${item.capitalize ? "capitalize" : ""}`}
                      >
                        {item.value}
                      </p>
                    </div>
                  ))}
              </div>

              {/* Notes */}
              {ticket.notes && (
                <div className="mt-4 bg-amber-50/50  rounded-xl p-3.5 border border-amber-200/30">
                  <p className="text-[11px] text-amber-600 font-medium uppercase tracking-wider mb-1">Notes</p>
                  <p className="text-sm text-amber-800 whitespace-pre-wrap">{ticket.notes}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Board Button */}
        {canBoard && (role === "dock" || role === "admin" || role === "super_admin") && (
          <button
            onClick={handleBoard}
            disabled={boarding}
            className="w-full bg-violet-600 hover:bg-violet-700 hover:shadow-lg disabled:from-slate-300 disabled:to-slate-300 disabled:shadow-none text-white font-bold py-4 px-6 rounded-2xl transition-all duration-300 text-lg active:scale-[0.98] animate-fade-in-up delay-300"
          >
            {boarding ? (
              <div className="flex items-center justify-center space-x-2">
                <div className="w-5 h-5 border-2 border-slate-200 border-t-white rounded-full animate-spin" />
                <span>Boarding...</span>
              </div>
            ) : (
              <div className="flex items-center justify-center space-x-2">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>BOARD PASSENGER</span>
              </div>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
