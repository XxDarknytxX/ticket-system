// src/components/DockScanner.js
import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { Html5Qrcode } from "html5-qrcode";
import { Scanning } from "../services/api";

export default function DockScanner() {
  const [scanStatus, setScanStatus] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [boarding, setBoarding] = useState(false);
  const [boardingMessage, setBoardingMessage] = useState("");
  const [manualTicketId, setManualTicketId] = useState("");
  const [scanHistory, setScanHistory] = useState([]);
  // Camera modal state
  const [showCamera, setShowCamera] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const scannerRef = useRef(null);
  const isRunningRef = useRef(false);

  const extractTicketId = useCallback((decodedText) => {
    if (decodedText.includes("/verify/")) {
      const segments = decodedText.split("/verify/");
      return segments[segments.length - 1].replace(/\/+$/, "");
    }
    return decodedText.trim();
  }, []);

  const verifyTicket = useCallback(async (ticketId) => {
    if (!ticketId) return;
    setLoading(true);
    setScanStatus(null);
    setScanResult(null);
    setBoardingMessage("");

    try {
      const result = await Scanning.verifyTicket(ticketId);
      const ticket = result.ticket || {};
      const status = result.scanStatus || "not_found";
      const flatResult = {
        ...ticket,
        passenger_name: ticket.customer_name,
        vessel: ticket.vessel_name,
        status,
      };

      setScanStatus(status === "valid" || status === "already_boarded" || status === "cancelled" || status === "expired" ? status : "not_found");
      setScanResult(status !== "not_found" ? flatResult : null);

      setScanHistory((prev) => [{
        ticketId,
        passengerName: ticket.customer_name || "Unknown",
        result: status || "error",
        timestamp: new Date(),
      }, ...prev]);
    } catch {
      setScanStatus("not_found");
      setScanResult(null);
      setScanHistory((prev) => [{
        ticketId,
        passengerName: "Unknown",
        result: "error",
        timestamp: new Date(),
      }, ...prev]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ═══════ Camera Modal Logic ═══════ */
  const openCamera = () => {
    setCameraError(null);
    setCameraReady(false);
    setShowCamera(true);
  };

  const closeCamera = useCallback(async () => {
    if (scannerRef.current && isRunningRef.current) {
      try { await scannerRef.current.stop(); } catch {}
      isRunningRef.current = false;
    }
    setShowCamera(false);
    setCameraReady(false);
    setCameraError(null);
  }, []);

  // Start camera when modal opens
  useEffect(() => {
    if (!showCamera) return;
    let cancelled = false;

    const init = async () => {
      // Wait for DOM to render the reader div
      await new Promise(r => setTimeout(r, 400));
      if (cancelled) return;

      try {
        if (scannerRef.current && isRunningRef.current) {
          try { await scannerRef.current.stop(); } catch {}
          isRunningRef.current = false;
        }

        const html5Qrcode = new Html5Qrcode("qr-camera-reader");
        scannerRef.current = html5Qrcode;

        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          setCameraError("No cameras found on this device.");
          return;
        }

        // Prefer back camera for mobile
        const backCam = cameras.find(c =>
          /back|rear|environment/i.test(c.label)
        );
        const camId = backCam ? backCam.id : cameras[cameras.length - 1].id;

        await html5Qrcode.start(
          camId,
          { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 },
          (decodedText) => {
            // QR found! Close camera and verify
            const ticketId = extractTicketId(decodedText);
            // Stop camera first, then verify
            html5Qrcode.stop().catch(() => {});
            isRunningRef.current = false;
            setShowCamera(false);
            setCameraReady(false);
            verifyTicket(ticketId);
          },
          () => {} // ignore per-frame misses
        );

        if (!cancelled) {
          isRunningRef.current = true;
          setCameraReady(true);
        }
      } catch (err) {
        if (cancelled) return;
        const msg = typeof err === "string" ? err : err?.message || "Unknown error";
        if (/NotAllowedError|Permission/i.test(msg)) {
          setCameraError("Camera permission denied. Please allow camera access in your browser settings.");
        } else if (/NotFoundError/i.test(msg)) {
          setCameraError("No camera found on this device.");
        } else if (/NotReadableError|in use/i.test(msg)) {
          setCameraError("Camera is in use by another app.");
        } else {
          setCameraError(`Could not start camera: ${msg}`);
        }
      }
    };

    init();
    return () => { cancelled = true; };
  }, [showCamera, extractTicketId, verifyTicket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (scannerRef.current && isRunningRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, []);

  /* ═══════ Handlers ═══════ */
  const handleManualLookup = (e) => {
    e.preventDefault();
    if (manualTicketId.trim()) verifyTicket(manualTicketId.trim());
  };

  const handleBoardPassenger = async () => {
    if (!scanResult || !scanResult.ticket_id) return;
    setBoarding(true);
    setBoardingMessage("");
    try {
      await Scanning.boardPassenger(scanResult.ticket_id);
      setBoardingMessage("Passenger boarded successfully!");
      setScanStatus("already_boarded");
      setScanResult((prev) => ({ ...prev, status: "already_boarded", boarded_at: new Date().toISOString() }));
      setScanHistory((prev) => prev.map((e, i) => i === 0 ? { ...e, result: "boarded" } : e));
    } catch (error) {
      setBoardingMessage(`Boarding failed: ${error.message}`);
    } finally {
      setBoarding(false);
    }
  };

  const resetScan = () => {
    setScanStatus(null);
    setScanResult(null);
    setBoardingMessage("");
  };

  /* ═══════ Helpers ═══════ */
  const formatTime = (date) => new Date(date).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  const getResultBadge = (result) => {
    const map = {
      valid: "badge badge-success",
      boarded: "badge badge-info",
      already_boarded: "badge badge-warning",
      cancelled: "badge badge-error",
      expired: "badge badge-warning",
    };
    const labels = { valid: "Valid", boarded: "Boarded", already_boarded: "Already Boarded", cancelled: "Cancelled", expired: "Expired" };
    return <span className={map[result] || "badge badge-error"}>{labels[result] || "Not Found"}</span>;
  };

  const getHistoryBorderColor = (r) => ({
    valid: "border-l-emerald-500", boarded: "border-l-violet-500", already_boarded: "border-l-amber-500",
    cancelled: "border-l-rose-500", expired: "border-l-amber-500",
  }[r] || "border-l-rose-500");

  const statusConfig = {
    valid: { icon: "check", bg: "bg-emerald-50", border: "border-emerald-200", iconBg: "bg-emerald-100", iconColor: "text-emerald-600", titleColor: "text-emerald-700", title: "VALID TICKET", subtitle: "Ready to Board" },
    already_boarded: { icon: "warn", bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", iconColor: "text-amber-600", titleColor: "text-amber-700", title: "ALREADY BOARDED", subtitle: null },
    expired: { icon: "clock", bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", iconColor: "text-amber-600", titleColor: "text-amber-700", title: "TICKET EXPIRED", subtitle: "Cannot be used for boarding" },
    cancelled: { icon: "x", bg: "bg-rose-50", border: "border-rose-200", iconBg: "bg-rose-100", iconColor: "text-rose-600", titleColor: "text-rose-700", title: "TICKET CANCELLED", subtitle: null },
    not_found: { icon: "alert", bg: "bg-rose-50", border: "border-rose-200", iconBg: "bg-rose-100", iconColor: "text-rose-600", titleColor: "text-rose-700", title: "TICKET NOT FOUND", subtitle: "Could not be found in the system" },
  };

  const StatusIcon = ({ type }) => {
    const paths = {
      check: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
      warn: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
      clock: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
      x: "m9.75 9.75 4.5 4.5m0-4.5-4.5 4.5M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
      alert: "M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z",
    };
    return (
      <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d={paths[type] || paths.alert} />
      </svg>
    );
  };

  const cfg = statusConfig[scanStatus] || {};

  /* ═══════ RENDER ═══════ */
  return (
    <div
      className="px-4 sm:px-6 w-full max-w-3xl mx-auto flex flex-col justify-center"
      style={{ minHeight: 'calc(100dvh - 180px)' }}
    >
      {/* ══════════ IDLE STATE - Fullscreen app-like hero ══════════ */}
      {!scanStatus && !loading && (
        <div className="space-y-5 animate-fade-in-up w-full">
          {/* Hero scan card — centered, theme-colored, prominent */}
          <div
            className="relative rounded-3xl overflow-hidden p-8 sm:p-10 text-center"
            style={{
              backgroundImage:
                'linear-gradient(145deg, color-mix(in srgb, var(--color-violet-500) 10%, white) 0%, white 55%, color-mix(in srgb, var(--color-violet-400) 8%, white) 100%)',
              border: '1px solid color-mix(in srgb, var(--color-violet-500) 15%, #e2e8f0)',
              boxShadow: '0 20px 50px -20px color-mix(in srgb, var(--color-violet-600) 25%, transparent)',
            }}
          >
            {/* Decorative glows */}
            <div
              className="absolute top-[-30%] right-[-20%] w-[300px] h-[300px] rounded-full pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle, color-mix(in srgb, var(--color-violet-400) 25%, transparent) 0%, transparent 70%)',
                filter: 'blur(50px)',
              }}
            />
            <div
              className="absolute bottom-[-30%] left-[-20%] w-[280px] h-[280px] rounded-full pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(circle, color-mix(in srgb, var(--color-violet-500) 18%, transparent) 0%, transparent 70%)',
                filter: 'blur(50px)',
              }}
            />

            <div className="relative">
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase mb-1" style={{ color: 'var(--color-violet-700)' }}>
                Ticket Scanner
              </p>
              <h1 className="text-[22px] sm:text-[26px] font-bold text-slate-900 mb-1">Ready to scan</h1>
              <p className="text-[13px] text-slate-500 mb-8">Tap the button below to activate the camera</p>

              {/* Centered scan button — rounded square */}
              <div className="relative inline-flex items-center justify-center">
                {/* Pulsing squares */}
                <span
                  className="absolute inset-0 rounded-[36px] animate-ping opacity-20"
                  style={{ backgroundColor: 'var(--color-violet-500)', animationDuration: '2.5s' }}
                />
                <span
                  className="absolute rounded-[42px] animate-ping opacity-15"
                  style={{
                    inset: '-14px',
                    backgroundColor: 'var(--color-violet-400)',
                    animationDuration: '2.5s',
                    animationDelay: '0.5s',
                  }}
                />

                <button
                  onClick={openCamera}
                  className="group relative w-36 h-36 sm:w-44 sm:h-44 rounded-[36px] flex items-center justify-center active:scale-95 transition-all duration-300"
                  style={{
                    backgroundImage:
                      'linear-gradient(145deg, var(--color-violet-400) 0%, var(--color-violet-500) 45%, var(--color-violet-700) 100%)',
                    boxShadow:
                      '0 24px 50px -12px color-mix(in srgb, var(--color-violet-600) 55%, transparent), inset 0 2px 0 0 rgba(255,255,255,0.3), inset 0 -8px 20px 0 rgba(0,0,0,0.15)',
                  }}
                >
                  {/* Inner highlight */}
                  <span
                    className="absolute top-3 left-1/2 -translate-x-1/2 w-20 h-8 rounded-full blur-md opacity-40 pointer-events-none"
                    style={{ backgroundColor: 'white' }}
                  />
                  <svg className="w-[72px] h-[72px] sm:w-[88px] sm:h-[88px] text-white relative group-hover:scale-105 transition-transform duration-300" fill="none" viewBox="0 0 24 24" strokeWidth={1.75} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5ZM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 0 1-1.125-1.125v-4.5ZM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 13.5 9.375v-4.5Z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75ZM6.75 16.5h.75v.75h-.75v-.75ZM16.5 6.75h.75v.75h-.75v-.75ZM13.5 13.5h.75v.75h-.75v-.75ZM13.5 19.5h.75v.75h-.75v-.75ZM19.5 13.5h.75v.75h-.75v-.75ZM19.5 19.5h.75v.75h-.75v-.75ZM16.5 16.5h.75v.75h-.75v-.75Z" />
                  </svg>
                </button>
              </div>

              <p className="mt-7 text-[12px] text-slate-400 font-medium">Point your camera at the passenger's QR code</p>
            </div>
          </div>

          {/* Manual Lookup */}
          <div className="glass-card overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200/40">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
                </svg>
                Manual Ticket Lookup
              </h2>
            </div>
            <div className="p-4">
              <form onSubmit={handleManualLookup} className="flex gap-3">
                <input type="text" value={manualTicketId} onChange={(e) => setManualTicketId(e.target.value)} placeholder="Enter ticket ID..." className="glass-input flex-1" />
                <button type="submit" disabled={loading || !manualTicketId.trim()} className="btn-primary px-6 py-3 text-sm">Look Up</button>
              </form>
            </div>
          </div>

          {/* Scan History */}
          {scanHistory.length > 0 && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200/40 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <svg className="w-4 h-4 text-violet-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  Recent Scans
                  <span className="badge badge-info ml-1">{scanHistory.length}</span>
                </h2>
                <button onClick={() => setScanHistory([])} className="text-xs text-slate-500 hover:text-rose-600 font-medium">Clear</button>
              </div>
              <div className="divide-y divide-slate-100">
                {scanHistory.slice(0, 10).map((entry, idx) => (
                  <div key={`${entry.ticketId}-${idx}`} className={`px-4 py-3 flex items-center justify-between gap-3 border-l-4 ${getHistoryBorderColor(entry.result)} hover:bg-slate-50/50 transition-colors`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900 truncate">{entry.passengerName}</p>
                      <p className="text-xs text-slate-400 font-mono">{entry.ticketId}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {getResultBadge(entry.result)}
                      <span className="text-[10px] text-slate-400">{formatTime(entry.timestamp)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ LOADING STATE ══════════ */}
      {loading && (
        <div className="glass-card p-12 flex flex-col items-center justify-center animate-fade-in-up">
          <div className="w-14 h-14 border-3 border-violet-600 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-base font-semibold text-slate-700">Verifying ticket...</p>
          <p className="text-sm text-slate-400 mt-1">Checking passenger details</p>
        </div>
      )}

      {/* ══════════ RESULT STATE - Ticket found/not found ══════════ */}
      {scanStatus && !loading && (
        <div className="space-y-4 animate-fade-in-up">
          {/* Status Banner */}
          <div className={`rounded-2xl border-2 ${cfg.border} ${cfg.bg} p-6`}>
            <div className="flex items-center gap-4">
              <div className={`w-14 h-14 rounded-2xl ${cfg.iconBg} flex items-center justify-center flex-shrink-0 ${cfg.iconColor}`}>
                <StatusIcon type={cfg.icon} />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className={`text-lg font-bold ${cfg.titleColor}`}>{cfg.title}</h2>
                {cfg.subtitle && <p className={`text-sm ${cfg.titleColor} opacity-75 mt-0.5`}>{cfg.subtitle}</p>}
                {scanStatus === "already_boarded" && scanResult?.boarded_at && (
                  <p className="text-xs text-amber-600/80 mt-1">Boarded {new Date(scanResult.boarded_at).toLocaleString()}{scanResult.boarded_by_email ? ` by ${scanResult.boarded_by_email}` : ""}</p>
                )}
              </div>
            </div>
          </div>

          {/* Ticket Details */}
          {scanResult && (
            <div className="glass-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200/40">
                <h3 className="text-sm font-semibold text-slate-700">Passenger Details</h3>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Passenger</p>
                    <p className="text-sm font-bold text-slate-900 mt-0.5">{scanResult.passenger_name}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Type</p>
                    <p className="text-sm font-semibold text-slate-900 capitalize mt-0.5">{scanResult.passenger_type}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Route</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{scanResult.source} &rarr; {scanResult.destination}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Vessel</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{scanResult.vessel}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Travel Date</p>
                    <p className="text-sm font-semibold text-slate-900 mt-0.5">{scanResult.travel_date ? new Date(scanResult.travel_date).toLocaleDateString() : "N/A"}</p>
                  </div>
                  {scanResult.valid_until && (
                    <div>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Valid Until</p>
                      <p className={`text-sm font-semibold mt-0.5 ${new Date(scanResult.valid_until) < new Date() ? "text-rose-600" : "text-slate-900"}`}>
                        {new Date(scanResult.valid_until).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                      </p>
                    </div>
                  )}
                  <div className="col-span-2">
                    <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Ticket ID</p>
                    <p className="text-sm font-mono text-slate-600 mt-0.5">{scanResult.ticket_id}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Board Button - only for valid tickets */}
          {scanStatus === "valid" && (
            <div>
              {boardingMessage && (
                <div className={`mb-3 px-4 py-3 rounded-xl text-sm font-medium ${boardingMessage.includes("successfully") ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-rose-50 text-rose-700 border border-rose-200"}`}>
                  {boardingMessage}
                </div>
              )}
              <button onClick={handleBoardPassenger} disabled={boarding}
                className="w-full py-4 bg-violet-600 text-white text-lg font-bold rounded-2xl hover:bg-violet-700 active:scale-[0.98] disabled:opacity-50 transition-all duration-300 shadow-xl shadow-violet-500/30"
              >
                {boarding ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Boarding...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    BOARD PASSENGER
                  </span>
                )}
              </button>
            </div>
          )}

          {/* Already boarded success message */}
          {scanStatus === "already_boarded" && boardingMessage && (
            <div className="px-4 py-3 rounded-xl text-sm font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
              {boardingMessage}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button onClick={openCamera}
              className="flex-1 btn-primary py-3.5 flex items-center justify-center gap-2 text-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0 1 3.75 9.375v-4.5Z" />
              </svg>
              Scan Next
            </button>
            <button onClick={resetScan} className="btn-secondary py-3.5 px-6 text-sm">
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ══════════ CAMERA MODAL (Portal) ══════════ */}
      {showCamera && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90">
          {/* Close button */}
          <button onClick={closeCamera} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/20  flex items-center justify-center text-white hover:bg-white transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Title */}
          <div className="absolute top-4 left-4 z-10">
            <h3 className="text-white font-bold text-lg">Scanning...</h3>
            <p className="text-white/60 text-sm">Point at QR code</p>
          </div>

          {/* Camera viewfinder */}
          <div className="w-full max-w-md mx-4">
            <div id="qr-camera-reader" className="w-full rounded-2xl overflow-hidden" />

            {/* Loading state */}
            {!cameraReady && !cameraError && (
              <div className="flex flex-col items-center justify-center py-20">
                <div className="w-12 h-12 border-3 border-violet-400 border-t-transparent rounded-full animate-spin mb-4" />
                <p className="text-white font-medium">Starting camera...</p>
                <p className="text-white/50 text-sm mt-1">Allow camera access when prompted</p>
              </div>
            )}

            {/* Error state */}
            {cameraError && (
              <div className="bg-white/10  rounded-2xl p-6 text-center mt-4">
                <svg className="w-12 h-12 text-rose-400 mx-auto mb-3" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                </svg>
                <p className="text-white font-medium">{cameraError}</p>
                <button onClick={closeCamera} className="mt-4 px-6 py-2 bg-white/20 hover:bg-white text-white rounded-xl text-sm font-medium transition-colors">
                  Close
                </button>
              </div>
            )}
          </div>

          {/* Cancel button at bottom */}
          <div className="absolute bottom-6 left-0 right-0 flex justify-center">
            <button onClick={closeCamera} className="px-8 py-3 bg-white/15  hover:bg-white/25 text-white rounded-2xl font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
