import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Manifest as ManifestApi, Services, Permissions } from "../services/api";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  CalendarDays, Ship, MapPin, Plus, Download, ListChecks, Users, X,
  CheckCircle2, AlertCircle, Repeat, Trash2, Edit3, ClipboardList,
} from "lucide-react";

type Tier = "economy" | "first_class";
type DepStatus = "scheduled" | "cancelled" | "departed" | "completed";

interface Departure {
  id: number;
  route_id: number;
  vessel_id: number;
  departure_date: string;
  departure_time: string;
  status: DepStatus;
  actual_departure_time?: string | null;
  completed_at?: string | null;
  notes?: string | null;
  source: string;
  destination: string;
  vessel_name: string;
  seat_capacity: number;
  service_type_name: string;
  booked_count: number;
  boarded_count: number;
}

const fmtDate = (d: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "";
const fmtTime = (t: string) => t ? t.slice(0, 5) : "";
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

function capacityBadge(booked: number, capacity: number) {
  const pct = capacity > 0 ? Math.round((booked / capacity) * 100) : 0;
  if (pct >= 100) return { cls: "bg-rose-100 text-rose-700 border-rose-200", label: `${booked}/${capacity}` };
  if (pct >= 80) return { cls: "bg-amber-100 text-amber-700 border-amber-200", label: `${booked}/${capacity}` };
  return { cls: "bg-emerald-100 text-emerald-700 border-emerald-200", label: `${booked}/${capacity}` };
}

function statusBadge(s: DepStatus) {
  const map: Record<DepStatus, string> = {
    scheduled: "bg-violet-100 text-violet-700 border-violet-200",
    cancelled: "bg-rose-100 text-rose-700 border-rose-200",
    departed: "bg-sky-100 text-sky-700 border-sky-200",
    completed: "bg-slate-200 text-slate-700 border-slate-300",
  };
  return map[s] || map.scheduled;
}

function getThemeAccent(): [number, number, number] {
  try {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const frontRoutes = ["dashboard","booking","tickets","reports","scanner","scan-history","configuration","users","teams","license","audit-logs","login","reset-password","verify","2fa-setup","2fa-verify","manifest"];
    const inst = (parts.length > 0 && !frontRoutes.includes(parts[0])) ? parts[0] + "_" : "";
    const hex = localStorage.getItem(inst + "theme_primary_color") || "#7c3aed";
    const h = hex.replace("#", "");
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  } catch {
    return [124, 58, 237];
  }
}

export default function ManifestComponent() {
  const [activeTab, setActiveTab] = useState<"schedule" | "manifest">("schedule");
  const [perms, setPerms] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    const role = localStorage.getItem("role");
    if (role === "super_admin") {
      setPerms({ schedule_edit: true, manifest_view: true });
      return;
    }
    Permissions.getMine()
      .then((d: any) => setPerms(d.permissions || {}))
      .catch(() => setPerms({}));
  }, []);

  const canEdit = !!perms?.schedule_edit;
  const canView = !!perms?.manifest_view;

  // Default landing tab depends on permissions
  useEffect(() => {
    if (perms && !canEdit && canView) setActiveTab("manifest");
  }, [perms, canEdit, canView]);

  return (
    <div className="p-3 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-violet-600" />
            Manifest
          </h1>
          <p className="text-[12px] text-slate-500 mt-0.5">Departure schedule and passenger manifests</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 overflow-x-auto">
        {canEdit && (
          <button
            onClick={() => setActiveTab("schedule")}
            className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "schedule" ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <CalendarDays className="w-4 h-4" /> Schedule
          </button>
        )}
        {canView && (
          <button
            onClick={() => setActiveTab("manifest")}
            className={`px-4 py-2.5 text-[13px] font-semibold border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
              activeTab === "manifest" ? "border-violet-600 text-violet-700" : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            <Users className="w-4 h-4" /> Manifest
          </button>
        )}
      </div>

      {activeTab === "schedule" && canEdit && <ScheduleTab />}
      {activeTab === "manifest" && canView && <ManifestTab canEdit={canEdit} />}
    </div>
  );
}

/* ════════════════════ SCHEDULE TAB ════════════════════ */
function ScheduleTab() {
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [vessels, setVessels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDateFrom, setFilterDateFrom] = useState(today());
  const [filterDateTo, setFilterDateTo] = useState(inDays(28));
  const [filterRoute, setFilterRoute] = useState("");
  const [filterVessel, setFilterVessel] = useState("");

  const [showSingleModal, setShowSingleModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showCompleteModal, setShowCompleteModal] = useState<Departure | null>(null);
  const [editingDeparture, setEditingDeparture] = useState<Departure | null>(null);

  const load = () => {
    setLoading(true);
    const params: any = { date_from: filterDateFrom, date_to: filterDateTo };
    if (filterRoute) params.route_id = filterRoute;
    if (filterVessel) params.vessel_id = filterVessel;
    ManifestApi.listDepartures(params)
      .then((d: any) => setDepartures(d.departures || []))
      .catch(() => setDepartures([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    Services.getRoutes().then((d: any) => setRoutes(d.routes || [])).catch(() => {});
    Services.getVessels("active").then((d: any) => setVessels(d.vessels || [])).catch(() => {});
  }, []);

  useEffect(load, [filterDateFrom, filterDateTo, filterRoute, filterVessel]);

  const cancelDeparture = async (d: Departure) => {
    if (!confirm("Cancel this departure? Existing bookings will keep the link.")) return;
    try {
      await ManifestApi.updateDeparture(d.id, { status: "cancelled" });
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const deleteDeparture = async (d: Departure) => {
    if (!confirm("Delete this departure? Only allowed if no bookings reference it.")) return;
    try {
      await ManifestApi.deleteDeparture(d.id);
      load();
    } catch (e: any) {
      alert(e.message);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">From</label>
          <input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">To</label>
          <input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)}
            className="text-sm border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500" />
        </div>
        <div className="min-w-[160px]">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Route</label>
          <select value={filterRoute} onChange={(e) => setFilterRoute(e.target.value)}
            className="text-sm w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
            <option value="">All routes</option>
            {routes.map((r) => <option key={r.id} value={r.id}>{r.source} → {r.destination}</option>)}
          </select>
        </div>
        <div className="min-w-[160px]">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Vessel</label>
          <select value={filterVessel} onChange={(e) => setFilterVessel(e.target.value)}
            className="text-sm w-full border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
            <option value="">All vessels</option>
            {vessels.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setShowBulkModal(true)} className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-slate-900 text-white hover:bg-slate-800 flex items-center gap-1.5">
            <Repeat className="w-4 h-4" /> Generate Schedule
          </button>
          <button onClick={() => { setEditingDeparture(null); setShowSingleModal(true); }}
            className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Add Departure
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-14">
            <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : departures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 px-5">
            <CalendarDays className="w-10 h-10 text-slate-300 mb-3" />
            <p className="text-sm font-medium text-slate-500">No departures scheduled</p>
            <p className="text-[12px] text-slate-400 mt-1">Click "Generate Schedule" to bulk-create a recurring weekly schedule.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Time</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Route</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Vessel</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Capacity</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {departures.map((d) => {
                  const cap = capacityBadge(d.booked_count, d.seat_capacity);
                  const locked = d.status === "completed";
                  return (
                    <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-2.5 text-[12px] text-slate-700 font-medium whitespace-nowrap">{fmtDate(d.departure_date)}</td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-700 font-mono">{fmtTime(d.departure_time)}</td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-700"><div className="flex items-center gap-1"><MapPin className="w-3 h-3 text-slate-400" />{d.source} → {d.destination}</div></td>
                      <td className="px-4 py-2.5 text-[12px] text-slate-700"><div className="flex items-center gap-1"><Ship className="w-3 h-3 text-slate-400" />{d.vessel_name}</div></td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] font-bold px-2 py-1 rounded-lg border ${cap.cls}`}>{cap.label}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[11px] font-semibold px-2 py-1 rounded-lg border capitalize ${statusBadge(d.status)}`}>{d.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          {!locked && d.status !== "cancelled" && (
                            <button onClick={() => setShowCompleteModal(d)} title="Mark Completed" className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                          )}
                          {!locked && (
                            <button onClick={() => { setEditingDeparture(d); setShowSingleModal(true); }} title="Edit" className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-600">
                              <Edit3 className="w-4 h-4" />
                            </button>
                          )}
                          {!locked && d.status !== "cancelled" && (
                            <button onClick={() => cancelDeparture(d)} title="Cancel" className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600">
                              <AlertCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button onClick={() => deleteDeparture(d)} title="Delete" className="p-1.5 rounded-lg hover:bg-rose-50 text-rose-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showSingleModal && (
        <SingleDepartureModal
          editing={editingDeparture}
          routes={routes}
          vessels={vessels}
          onClose={() => { setShowSingleModal(false); setEditingDeparture(null); }}
          onSaved={() => { setShowSingleModal(false); setEditingDeparture(null); load(); }}
        />
      )}
      {showBulkModal && (
        <BulkScheduleModal
          routes={routes}
          vessels={vessels}
          onClose={() => setShowBulkModal(false)}
          onSaved={() => { setShowBulkModal(false); load(); }}
        />
      )}
      {showCompleteModal && (
        <CompleteDepartureModal
          departure={showCompleteModal}
          onClose={() => setShowCompleteModal(null)}
          onSaved={() => { setShowCompleteModal(null); load(); }}
        />
      )}
    </div>
  );
}

/* ════════════════════ SINGLE DEPARTURE MODAL ════════════════════ */
function SingleDepartureModal({ editing, routes, vessels, onClose, onSaved }: any) {
  const [form, setForm] = useState({
    route_id: editing?.route_id || "",
    vessel_id: editing?.vessel_id || "",
    departure_date: editing?.departure_date || today(),
    departure_time: editing?.departure_time?.slice(0,5) || "08:00",
    notes: editing?.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!form.route_id || !form.vessel_id || !form.departure_date || !form.departure_time) {
      setErr("All fields except notes are required");
      return;
    }
    setErr(""); setSaving(true);
    try {
      if (editing) {
        await ManifestApi.updateDeparture(editing.id, {
          route_id: parseInt(String(form.route_id)),
          vessel_id: parseInt(String(form.vessel_id)),
          departure_date: form.departure_date,
          departure_time: form.departure_time,
          notes: form.notes || null,
        });
      } else {
        await ManifestApi.createDeparture({
          route_id: parseInt(String(form.route_id)),
          vessel_id: parseInt(String(form.vessel_id)),
          departure_date: form.departure_date,
          departure_time: form.departure_time,
          notes: form.notes || undefined,
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">{editing ? "Edit Departure" : "Add Departure"}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Route</label>
            <select value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })}
              className="w-full glass-select text-sm">
              <option value="">Select route...</option>
              {routes.map((r: any) => <option key={r.id} value={r.id}>{r.source} → {r.destination}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vessel</label>
            <select value={form.vessel_id} onChange={(e) => setForm({ ...form, vessel_id: e.target.value })}
              className="w-full glass-select text-sm">
              <option value="">Select vessel...</option>
              {vessels.map((v: any) => <option key={v.id} value={v.id}>{v.name} ({v.seat_capacity} seats)</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Date</label>
              <input type="date" value={form.departure_date} onChange={(e) => setForm({ ...form, departure_date: e.target.value })}
                className="w-full glass-input text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input type="time" value={form.departure_time} onChange={(e) => setForm({ ...form, departure_time: e.target.value })}
                className="w-full glass-input text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full glass-input text-sm" placeholder="e.g. weather backup vessel" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
            {saving ? "Saving..." : (editing ? "Update" : "Create")}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ════════════════════ BULK SCHEDULE MODAL ════════════════════ */
function BulkScheduleModal({ routes, vessels, onClose, onSaved }: any) {
  const [form, setForm] = useState({
    route_id: "",
    vessel_id: "",
    days_of_week: [1, 3, 5] as number[],
    departure_time: "08:00",
    start_date: today(),
    end_date: inDays(28),
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<any>(null);

  const toggleDay = (d: number) => {
    setForm((f) => ({ ...f, days_of_week: f.days_of_week.includes(d) ? f.days_of_week.filter((x) => x !== d) : [...f.days_of_week, d].sort() }));
  };

  const submit = async () => {
    if (!form.route_id || !form.vessel_id || form.days_of_week.length === 0) {
      setErr("Pick a route, vessel, and at least one day of the week");
      return;
    }
    setErr(""); setSaving(true);
    try {
      const r = await ManifestApi.bulkCreateDepartures({
        route_id: parseInt(String(form.route_id)),
        vessel_id: parseInt(String(form.vessel_id)),
        days_of_week: form.days_of_week,
        departure_time: form.departure_time,
        start_date: form.start_date,
        end_date: form.end_date,
        notes: form.notes || undefined,
      });
      setResult(r);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-scale-in max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Repeat className="w-5 h-5 text-violet-600" />Generate Recurring Schedule</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
          {result && (
            <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
              Created {result.inserted} departures. Skipped {result.skipped} (already existed).
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Route</label>
            <select value={form.route_id} onChange={(e) => setForm({ ...form, route_id: e.target.value })}
              className="w-full glass-select text-sm">
              <option value="">Select route...</option>
              {routes.map((r: any) => <option key={r.id} value={r.id}>{r.source} → {r.destination}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Vessel</label>
            <select value={form.vessel_id} onChange={(e) => setForm({ ...form, vessel_id: e.target.value })}
              className="w-full glass-select text-sm">
              <option value="">Select vessel...</option>
              {vessels.map((v: any) => <option key={v.id} value={v.id}>{v.name} ({v.seat_capacity} seats)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Days of week</label>
            <div className="grid grid-cols-7 gap-1.5">
              {dayLabels.map((lbl, idx) => (
                <button key={idx} type="button" onClick={() => toggleDay(idx)}
                  className={`text-[12px] font-bold py-2 rounded-lg transition-colors ${form.days_of_week.includes(idx) ? "bg-violet-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Time</label>
              <input type="time" value={form.departure_time} onChange={(e) => setForm({ ...form, departure_time: e.target.value })}
                className="w-full glass-input text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">From</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full glass-input text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">To</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                className="w-full glass-input text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full glass-input text-sm" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">{result ? "Close" : "Cancel"}</button>
          {!result && (
            <button onClick={submit} disabled={saving}
              className="px-4 py-2 bg-violet-600 text-white rounded-xl text-sm font-semibold hover:bg-violet-700 disabled:opacity-50">
              {saving ? "Generating..." : "Generate"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ════════════════════ COMPLETE DEPARTURE MODAL ════════════════════ */
function CompleteDepartureModal({ departure, onClose, onSaved }: any) {
  const [actualTime, setActualTime] = useState(departure.departure_time?.slice(0, 5) || "08:00");
  const [notes, setNotes] = useState(departure.notes || "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    setErr(""); setSaving(true);
    try {
      // Convert HH:MM to a full timestamp on departure_date
      const actual = `${departure.departure_date} ${actualTime}:00`;
      await ManifestApi.completeDeparture(departure.id, {
        actual_departure_time: actual,
        notes: notes || null,
      });
      onSaved();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-emerald-600" />Mark Trip Completed</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-xl"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {err && <div className="text-sm text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{err}</div>}
          <p className="text-sm text-slate-600">
            <span className="font-semibold">{departure.source} → {departure.destination}</span> on <span className="font-semibold">{fmtDate(departure.departure_date)}</span>
          </p>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Actual departure time</label>
            <input type="time" value={actualTime} onChange={(e) => setActualTime(e.target.value)} className="w-full glass-input text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
              className="w-full glass-input text-sm" placeholder="Trip notes, issues, weather…" />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-2">
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
            {saving ? "Saving..." : "Mark Completed"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

/* ════════════════════ MANIFEST TAB ════════════════════ */
function ManifestTab({ canEdit }: { canEdit: boolean }) {
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [view, setView] = useState<"literal" | "projected" | "report">("literal");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Default range: 14 days back, 60 days ahead
    const from = new Date(); from.setDate(from.getDate() - 14);
    const to = new Date(); to.setDate(to.getDate() + 60);
    ManifestApi.listDepartures({ date_from: from.toISOString().slice(0, 10), date_to: to.toISOString().slice(0, 10) })
      .then((d: any) => {
        const list = d.departures || [];
        setDepartures(list);
        if (list.length > 0 && !selectedId) {
          // pick the soonest upcoming departure (or the latest past if none upcoming)
          const todayStr = today();
          const upcoming = list.find((x: Departure) => x.departure_date >= todayStr);
          setSelectedId(upcoming?.id || list[list.length - 1].id);
        }
      })
      .catch(() => setDepartures([]));
  }, []);

  useEffect(() => {
    if (!selectedId) { setData(null); return; }
    setLoading(true);
    const call = view === "literal" ? ManifestApi.getLiteralManifest(selectedId)
              : view === "projected" ? ManifestApi.getProjectedManifest(selectedId)
              : ManifestApi.getTripReport(selectedId);
    call.then((d: any) => setData(d)).catch(() => setData(null)).finally(() => setLoading(false));
  }, [selectedId, view]);

  const selected = departures.find((d) => d.id === selectedId);

  const downloadPDF = () => {
    if (!data || !selected) return;
    const accent = getThemeAccent();
    const accentLight: [number, number, number] = [
      Math.round(accent[0] + (255 - accent[0]) * 0.85),
      Math.round(accent[1] + (255 - accent[1]) * 0.85),
      Math.round(accent[2] + (255 - accent[2]) * 0.85),
    ];
    const doc = new jsPDF("portrait", "mm", "a4");
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // Header bar
    doc.setFillColor(2, 6, 23);
    doc.rect(0, 0, pageW, 48, "F");
    doc.setFillColor(...accent);
    doc.rect(0, 48, pageW, 1.5, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("Goundar Shipping Ltd", 16, 18);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...accentLight);
    const viewLabel = view === "literal" ? "Manifest (Literal)" : view === "projected" ? "Manifest (Projected)" : "Trip Report";
    doc.text(viewLabel, 16, 26);
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Generated: ${new Date().toLocaleString()}`, pageW - 16, 16, { align: "right" });
    doc.setTextColor(226, 232, 240);
    doc.text(`${selected.source} → ${selected.destination}`, 16, 36);
    doc.text(`${fmtDate(selected.departure_date)}  •  ${fmtTime(selected.departure_time)}  •  ${selected.vessel_name}`, 16, 42);

    if (view === "report") {
      const s = data.summary || {};
      const cardY = 58;
      const cardH = 24;
      const cardW = (pageW - 48) / 4;
      const labels = ["EXPECTED", "BOARDED", "NO SHOWS", "REVENUE"];
      const values = [String(s.expected ?? 0), String(s.boarded ?? 0), String(s.no_shows ?? 0), `FJ$${(s.revenue ?? 0).toFixed(2)}`];
      labels.forEach((lbl, i) => {
        const x = 16 + i * (cardW + 8);
        doc.setFillColor(...accentLight);
        doc.roundedRect(x, cardY, cardW, cardH, 3, 3, "F");
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...accent);
        doc.text(lbl, x + 4, cardY + 7);
        doc.setFontSize(13);
        doc.setTextColor(15, 23, 42);
        doc.text(values[i], x + 4, cardY + 18);
      });

      autoTable(doc, {
        startY: cardY + cardH + 10,
        head: [["#", "Ticket ID", "Customer", "Type", "Tier", "Status", "Boarded At"]],
        body: [
          ...((data.boarded || []).map((b: any, i: number) => [
            i + 1, b.ticket_id, b.customer_name, b.passenger_type,
            b.tier === "first_class" ? "First Class" : "Economy", "Boarded",
            b.boarded_at ? new Date(b.boarded_at).toLocaleString() : "-",
          ])),
          ...((data.no_shows || []).map((b: any, i: number) => [
            (data.boarded || []).length + i + 1, b.ticket_id, b.customer_name, b.passenger_type,
            b.tier === "first_class" ? "First Class" : "Economy", "No-show", "-",
          ])),
        ],
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [2, 6, 23], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 16, right: 16 },
        didDrawPage: () => drawPdfFooter(doc, pageW, pageH, accent),
      });
    } else {
      const list = data.bookings || [];
      // Summary line
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.text(`Total: ${list.length} passengers   |   Capacity: ${selected.seat_capacity}`, 16, 58);

      autoTable(doc, {
        startY: 64,
        head: [["#", "Ticket ID", "Customer", "Phone", "Type", "Tier", "Status"]],
        body: list.map((b: any, i: number) => [
          i + 1, b.ticket_id, b.customer_name, b.customer_phone || "-",
          b.passenger_type,
          b.tier === "first_class" ? "First Class" : "Economy",
          (b.status || "").charAt(0).toUpperCase() + (b.status || "").slice(1),
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [2, 6, 23], textColor: 255 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        margin: { left: 16, right: 16 },
        didDrawPage: () => drawPdfFooter(doc, pageW, pageH, accent),
      });
    }

    const fname = `Manifest_${view}_${selected.source}_${selected.destination}_${selected.departure_date}_${fmtTime(selected.departure_time).replace(":","")}.pdf`.replace(/\s+/g, "_");
    doc.save(fname);
  };

  return (
    <div className="space-y-4">
      {/* Departure picker */}
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-[11px] font-semibold text-slate-500 uppercase mb-1">Departure</label>
          <select value={selectedId || ""} onChange={(e) => setSelectedId(e.target.value ? parseInt(e.target.value) : null)}
            className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500">
            <option value="">Select a departure…</option>
            {departures.map((d) => (
              <option key={d.id} value={d.id}>
                {fmtDate(d.departure_date)} {fmtTime(d.departure_time)} • {d.source} → {d.destination} • {d.vessel_name} • {d.booked_count}/{d.seat_capacity}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          {(["literal", "projected", "report"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)}
              className={`text-[12px] font-semibold px-3 py-2 rounded-lg transition-colors ${view === v ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {v === "literal" ? "Literal" : v === "projected" ? "Projected" : "Trip Report"}
            </button>
          ))}
          <button onClick={downloadPDF} disabled={!data}
            className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center gap-1.5 disabled:opacity-40">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="card p-14 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !selected || !data ? (
        <div className="card p-14 text-center text-sm text-slate-500">Select a departure to view the manifest</div>
      ) : view === "report" ? (
        <ReportView data={data} departure={selected} />
      ) : (
        <ListView bookings={data.bookings || []} departure={selected} mode={view} />
      )}
    </div>
  );
}

function drawPdfFooter(doc: jsPDF, pageW: number, pageH: number, accent: [number, number, number]) {
  doc.setFillColor(248, 250, 252);
  doc.rect(0, pageH - 14, pageW, 14, "F");
  doc.setDrawColor(226, 232, 240);
  doc.line(0, pageH - 14, pageW, pageH - 14);
  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(148, 163, 184);
  doc.text("Goundar Shipping Ltd", 16, pageH - 6);
  doc.setTextColor(...accent);
  doc.text(`Page ${doc.getCurrentPageInfo().pageNumber}`, pageW / 2, pageH - 6, { align: "center" });
}

function ListView({ bookings, departure, mode }: { bookings: any[]; departure: Departure; mode: "literal" | "projected" }) {
  const cap = capacityBadge(bookings.length, departure.seat_capacity);
  const boardedCount = bookings.filter((b) => b.status === "boarded").length;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Passengers" value={String(bookings.length)} />
        <Stat label="Boarded" value={String(boardedCount)} />
        <Stat label="Capacity" value={String(departure.seat_capacity)} />
        <Stat label="Occupancy" value={`${Math.round((bookings.length / Math.max(departure.seat_capacity, 1)) * 100)}%`} pillCls={cap.cls} />
      </div>
      <div className="card overflow-hidden">
        {bookings.length === 0 ? (
          <div className="py-14 px-5 text-center text-sm text-slate-500">
            {mode === "literal" ? "No passengers explicitly booked for this departure" : "No passengers projected to travel on this date"}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="border-b border-slate-100 bg-slate-50/50">
                {["#", "Ticket ID", "Customer", "Phone", "Type", "Tier", "Status"].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {bookings.map((b, i) => (
                  <tr key={b.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-2 text-[12px] text-slate-500">{i + 1}</td>
                    <td className="px-4 py-2 text-[11px] font-mono text-slate-600">{b.ticket_id}</td>
                    <td className="px-4 py-2 text-[12px] text-slate-800 font-medium">{b.customer_name}</td>
                    <td className="px-4 py-2 text-[12px] text-slate-500">{b.customer_phone || "-"}</td>
                    <td className="px-4 py-2 text-[12px] text-slate-700 capitalize">{b.passenger_type}</td>
                    <td className="px-4 py-2 text-[11px]">
                      <span className={`px-2 py-0.5 rounded-full font-semibold ${b.tier === "first_class" ? "bg-sky-100 text-sky-700" : "bg-violet-100 text-violet-700"}`}>
                        {b.tier === "first_class" ? "First Class" : "Economy"}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[11px]">
                      <span className={`px-2 py-0.5 rounded-full font-semibold capitalize ${
                        b.status === "boarded" ? "bg-emerald-100 text-emerald-700"
                        : b.status === "confirmed" ? "bg-violet-100 text-violet-700"
                        : "bg-slate-100 text-slate-600"
                      }`}>{b.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ReportView({ data, departure }: { data: any; departure: Departure }) {
  const s = data.summary || {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Expected" value={String(s.expected ?? 0)} />
        <Stat label="Boarded" value={String(s.boarded ?? 0)} />
        <Stat label="No-shows" value={String(s.no_shows ?? 0)} pillCls="bg-rose-100 text-rose-700 border-rose-200" />
        <Stat label="Revenue" value={`FJ$${(s.revenue ?? 0).toFixed(2)}`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">Boarded ({(data.boarded || []).length})</h4>
          {(data.boarded || []).length === 0 ? <p className="text-[12px] text-slate-400">Nobody has boarded yet.</p> : (
            <ul className="text-[12px] divide-y divide-slate-100">
              {(data.boarded || []).map((b: any) => (
                <li key={b.id} className="py-2 flex justify-between">
                  <span className="font-medium text-slate-700">{b.customer_name}</span>
                  <span className="text-slate-400 font-mono">{b.ticket_id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">No-shows ({(data.no_shows || []).length})</h4>
          {(data.no_shows || []).length === 0 ? <p className="text-[12px] text-slate-400">No no-shows.</p> : (
            <ul className="text-[12px] divide-y divide-slate-100">
              {(data.no_shows || []).map((b: any) => (
                <li key={b.id} className="py-2 flex justify-between">
                  <span className="font-medium text-slate-700">{b.customer_name}</span>
                  <span className="text-slate-400 font-mono">{b.ticket_id}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {departure.completed_at && (
        <div className="card p-3 text-[12px] text-slate-500">
          Trip closed at {new Date(departure.completed_at).toLocaleString()}.
          {departure.actual_departure_time && <> Actual departure: {new Date(departure.actual_departure_time).toLocaleString()}.</>}
          {departure.notes && <> Notes: {departure.notes}.</>}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, pillCls }: { label: string; value: string; pillCls?: string }) {
  return (
    <div className="card p-3">
      <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-lg font-bold mt-0.5 ${pillCls ? "inline-block px-2 py-0.5 rounded-lg border " + pillCls : "text-slate-900"}`} style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </p>
    </div>
  );
}
