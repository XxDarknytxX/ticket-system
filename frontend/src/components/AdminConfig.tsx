import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Services, Settings, Permissions, PaymentMethods, Instances } from "../services/api";

const ALL_PERMISSIONS = [
  { key: "dashboard", label: "Dashboard", desc: "View dashboard and stats" },
  { key: "booking", label: "Booking", desc: "Create and manage bookings" },
  { key: "ticket_search", label: "Ticket Search", desc: "Search and reprint tickets" },
  { key: "reports", label: "Reports", desc: "View analytics and reports" },
  { key: "scanner", label: "Scanner", desc: "Scan QR codes at dock" },
  { key: "scan_history", label: "Scan History", desc: "View scan audit log" },
  { key: "configuration", label: "Configuration", desc: "Manage routes, vessels, pricing" },
  { key: "users", label: "Users", desc: "Manage user accounts" },
  { key: "teams", label: "Teams", desc: "Manage teams and terminals" },
];

/* ─── Theme Color Utilities ─── */
function hexToHSL(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

function hslToHexUtil(h: number, s: number, l: number): string {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => { const k = (n + h / 30) % 12; return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1); };
  return '#' + [f(0), f(8), f(4)].map(v => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function generateShades(hex: string): Record<string, string> {
  const [h, s] = hexToHSL(hex);
  // Generate a full palette from the base hue
  return {
    '50': hslToHexUtil(h, Math.min(s, 100), 97),
    '100': hslToHexUtil(h, Math.min(s, 95), 93),
    '200': hslToHexUtil(h, Math.min(s, 90), 85),
    '300': hslToHexUtil(h, Math.min(s, 85), 72),
    '400': hslToHexUtil(h, Math.min(s, 80), 60),
    '500': hslToHexUtil(h, Math.min(s, 75), 50),
    '600': hslToHexUtil(h, Math.min(s, 72), 42),
    '700': hslToHexUtil(h, Math.min(s, 70), 34),
    '800': hslToHexUtil(h, Math.min(s, 65), 26),
    '900': hslToHexUtil(h, Math.min(s, 60), 18),
    '950': hslToHexUtil(h, Math.min(s, 55), 12),
  };
}

function applyThemeColor(hex: string) {
  const shades = generateShades(hex);
  const root = document.documentElement;
  Object.entries(shades).forEach(([shade, color]) => {
    root.style.setProperty(`--color-violet-${shade}`, color);
  });
  localStorage.setItem('theme_primary_color', hex);
}

// Apply saved theme on module load
const savedTheme = localStorage.getItem('theme_primary_color');
if (savedTheme) applyThemeColor(savedTheme);

/* ─── Color Picker Component ─── */
function ColorPicker() {
  const saved = localStorage.getItem('theme_primary_color') || "#7c3aed";
  const [pickerColor, setPickerColor] = useState(saved);
  const savedHSL = hexToHSL(saved);
  const [hue, setHue] = useState(savedHSL[0]);
  const [satPos, setSatPos] = useState({ x: 85, y: 15 });
  const [saving, setSaving] = useState(false);
  const [applied, setApplied] = useState(false);
  const satRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromPos = (x: number, y: number) => {
    const s = x / 100;
    const v = 1 - y / 100;
    const l = v * (1 - s / 2);
    const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
    setPickerColor(hslToHexUtil(hue, sl * 100, l * 100));
    setSatPos({ x, y });
    setApplied(false);
  };

  const handleSatMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    const rect = satRef.current!.getBoundingClientRect();
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    updateFromPos(x, y);
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      const mx = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      const my = Math.max(0, Math.min(100, ((ev.clientY - rect.top) / rect.height) * 100));
      updateFromPos(mx, my);
    };
    const onUp = () => { dragging.current = false; document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const applyColor = async () => {
    setSaving(true);
    try {
      await Settings.updateSetting("primary_color", pickerColor);
    } catch { /* backend may not support this setting yet */ }
    applyThemeColor(pickerColor);
    setSaving(false);
    setApplied(true);
    setTimeout(() => setApplied(false), 3000);
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: pickerColor + '20' }}>
          <svg className="w-4 h-4" style={{ color: pickerColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
          </svg>
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-slate-800">Primary Color</h3>
          <p className="text-[11px] text-slate-400">Choose the accent color for the application</p>
        </div>
      </div>
      <div className="p-5">
        <div className="flex gap-5">
          <div className="flex-1">
            <div
              ref={satRef}
              className="relative w-full h-[180px] rounded-xl cursor-crosshair overflow-hidden border border-slate-200"
              style={{ backgroundColor: `hsl(${hue}, 100%, 50%)` }}
              onMouseDown={handleSatMouseDown}
            >
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, #fff, transparent)' }} />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, #000)' }} />
              <div
                className="absolute w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
                style={{ left: `${satPos.x}%`, top: `${satPos.y}%`, transform: 'translate(-50%, -50%)' }}
              />
            </div>
            <div className="mt-3">
              <input
                type="range"
                min="0"
                max="360"
                value={hue}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setHue(h);
                  const s = satPos.x / 100;
                  const v = 1 - satPos.y / 100;
                  const l = v * (1 - s / 2);
                  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
                  setPickerColor(hslToHexUtil(h, sl * 100, l * 100));
                  setApplied(false);
                }}
                className="w-full h-3 rounded-full appearance-none cursor-pointer"
                style={{ background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
              />
            </div>
          </div>
          <div className="w-28 flex flex-col items-center gap-3">
            <div className="w-20 h-20 rounded-2xl shadow-md border border-slate-200" style={{ backgroundColor: pickerColor }} />
            <input
              type="text"
              value={pickerColor}
              onChange={(e) => { setPickerColor(e.target.value); setApplied(false); }}
              className="w-full text-center input text-[12px] font-mono"
            />
            <button
              onClick={applyColor}
              disabled={saving}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-semibold py-2 px-3 rounded-full transition-colors disabled:opacity-50"
            >
              {saving ? "Saving..." : applied ? "Applied!" : "Apply Color"}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-4">
          <span className="text-[11px] text-slate-400 mr-1">Presets:</span>
          {["#7c3aed", "#2563eb", "#059669", "#e11d48", "#d97706", "#475569"].map((c) => (
            <button
              key={c}
              onClick={() => { setPickerColor(c); setApplied(false); }}
              className={`w-6 h-6 rounded-full border-2 transition-all ${pickerColor === c ? "border-slate-400 scale-110" : "border-transparent hover:scale-110"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AdminConfig() {
  const currentUserRole = localStorage.getItem("role") || "agent";
  const isSuperAdmin = currentUserRole === "super_admin";

  const [activeSection, setActiveSection] = useState("service-types");
  const [serviceTypes, setServiceTypes] = useState([]);
  const [vessels, setVessels] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  // Settings tab
  const [ticketValidityDays, setTicketValidityDays] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState("");

  // Payment methods
  const [paymentMethods, setPaymentMethods] = useState<any[]>([]);
  // Database instances (super_admin only)
  const [instances, setInstances] = useState<any[]>([]);
  const [showInstanceModal, setShowInstanceModal] = useState(false);
  const [instanceForm, setInstanceForm] = useState({ name: "", label: "", color: "#f59e0b" });

  const [showPaymentMethodModal, setShowPaymentMethodModal] = useState(false);
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<any>(null);
  const [paymentMethodForm, setPaymentMethodForm] = useState({
    name: "",
    code: "",
    is_active: true,
    sort_order: 0,
  });
  // SMTP
  const [smtp, setSmtp] = useState({ host: "", port: "587", user: "", pass: "", from_email: "", from_name: "", encryption: "tls" });
  const [smtpLoading, setSmtpLoading] = useState(false);
  const [smtpMessage, setSmtpMessage] = useState("");

  // Roles & Permissions
  const [rolePermissions, setRolePermissions] = useState({});
  const [showCreateRoleModal, setShowCreateRoleModal] = useState(false);
  const [newRoleName, setNewRoleName] = useState("");
  const [newRolePerms, setNewRolePerms] = useState({});

  // Modals / editing
  const [showServiceTypeModal, setShowServiceTypeModal] = useState(false);
  const [showVesselModal, setShowVesselModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [editingServiceType, setEditingServiceType] = useState(null);
  const [editingVessel, setEditingVessel] = useState(null);
  const [editingRoute, setEditingRoute] = useState(null);
  const [editingRouteForDiscount, setEditingRouteForDiscount] = useState(null);

  // Service Type Form
  const [serviceTypeForm, setServiceTypeForm] = useState({
    name: "",
    description: "",
    vat_rate: 12.5,
  });

  // Vessel Form
  const [vesselForm, setVesselForm] = useState({
    name: "",
    seat_capacity: "",
    description: "",
  });

  // Route Form with pricing calculation and VEP/VIP modes
  const [routeForm, setRouteForm] = useState({
    service_type_id: "",
    source: "",
    destination: "",
    createReturnRoute: false,
    adult_price_input: "",
    student_price_input: "",
    child_price_input: "",
    infant_price_input: "",
    adult_price_mode: "VEP",
    student_price_mode: "VEP",
    child_price_mode: "VEP",
    infant_price_mode: "VEP",
    adult_base_price: 0,
    student_base_price: 0,
    child_base_price: 0,
    infant_base_price: 0,
    adult_vat: 0,
    student_vat: 0,
    child_vat: 0,
    infant_vat: 0,
    adult_total: 0,
    student_total: 0,
    child_total: 0,
    infant_total: 0,
  });

  // Discount Form
  const [discountForm, setDiscountForm] = useState({
    discount_enabled: false,
    discount_adult_price_input: "",
    discount_student_price_input: "",
    discount_child_price_input: "",
    discount_infant_price_input: "",
    discount_adult_price_mode: "VEP",
    discount_student_price_mode: "VEP",
    discount_child_price_mode: "VEP",
    discount_infant_price_mode: "VEP",
    discount_adult_base_price: 0,
    discount_student_base_price: 0,
    discount_child_base_price: 0,
    discount_infant_base_price: 0,
    discount_adult_vat: 0,
    discount_student_vat: 0,
    discount_child_vat: 0,
    discount_infant_vat: 0,
    discount_adult_total: 0,
    discount_student_total: 0,
    discount_child_total: 0,
    discount_infant_total: 0,
  });

  // Optional live totals panel
  const [showPriceCalculator, setShowPriceCalculator] = useState(false);

  useEffect(() => {
    loadData();
    loadSettings();
    if (currentUserRole === "super_admin") loadInstances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate when inputs/modes/service type change
  useEffect(() => {
    if (!routeForm.service_type_id) return;
    const st = serviceTypes.find((s) => String(s.id) === String(routeForm.service_type_id));
    if (!st) return;
    calculatePrices(st.vat_rate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    routeForm.adult_price_input,
    routeForm.student_price_input,
    routeForm.child_price_input,
    routeForm.infant_price_input,
    routeForm.adult_price_mode,
    routeForm.student_price_mode,
    routeForm.child_price_mode,
    routeForm.infant_price_mode,
    routeForm.service_type_id,
    serviceTypes,
  ]);

  // Recalculate discount prices
  useEffect(() => {
    if (!editingRouteForDiscount) return;
    const st = serviceTypes.find((s) => s.id === editingRouteForDiscount.service_type_id);
    if (!st) return;
    calculateDiscountPrices(st.vat_rate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    discountForm.discount_adult_price_input,
    discountForm.discount_student_price_input,
    discountForm.discount_child_price_input,
    discountForm.discount_infant_price_input,
    discountForm.discount_adult_price_mode,
    discountForm.discount_student_price_mode,
    discountForm.discount_child_price_mode,
    discountForm.discount_infant_price_mode,
    editingRouteForDiscount,
    serviceTypes,
  ]);

  const calculatePrices = (vatRate) => {
    const calc = (input, mode) => {
      const p = parseFloat(input) || 0;
      if (!p) return { base: 0, vat: 0, total: 0 };
      if (mode === "VEP") {
        const base = p;
        const vat = (base * vatRate) / 100;
        return { base, vat, total: base + vat };
      } else {
        const total = p;
        const base = total / (1 + vatRate / 100);
        return { base, vat: total - base, total };
      }
    };

    const a = calc(routeForm.adult_price_input, routeForm.adult_price_mode);
    const s = calc(routeForm.student_price_input, routeForm.student_price_mode);
    const c = calc(routeForm.child_price_input, routeForm.child_price_mode);
    const i = calc(routeForm.infant_price_input, routeForm.infant_price_mode);

    setRouteForm((prev) => ({
      ...prev,
      adult_base_price: a.base,
      student_base_price: s.base,
      child_base_price: c.base,
      infant_base_price: i.base,
      adult_vat: a.vat,
      student_vat: s.vat,
      child_vat: c.vat,
      infant_vat: i.vat,
      adult_total: a.total,
      student_total: s.total,
      child_total: c.total,
      infant_total: i.total,
    }));
  };

  // Calculate discount prices
  const calculateDiscountPrices = (vatRate) => {
    const calc = (input, mode) => {
      const p = parseFloat(input) || 0;
      if (!p) return { base: 0, vat: 0, total: 0 };
      if (mode === "VEP") {
        const base = p;
        const vat = (base * vatRate) / 100;
        return { base, vat, total: base + vat };
      } else {
        const total = p;
        const base = total / (1 + vatRate / 100);
        return { base, vat: total - base, total };
      }
    };

    const a = calc(discountForm.discount_adult_price_input, discountForm.discount_adult_price_mode);
    const s = calc(discountForm.discount_student_price_input, discountForm.discount_student_price_mode);
    const c = calc(discountForm.discount_child_price_input, discountForm.discount_child_price_mode);
    const i = calc(discountForm.discount_infant_price_input, discountForm.discount_infant_price_mode);

    setDiscountForm((prev) => ({
      ...prev,
      discount_adult_base_price: a.base,
      discount_student_base_price: s.base,
      discount_child_base_price: c.base,
      discount_infant_base_price: i.base,
      discount_adult_vat: a.vat,
      discount_student_vat: s.vat,
      discount_child_vat: c.vat,
      discount_infant_vat: i.vat,
      discount_adult_total: a.total,
      discount_student_total: s.total,
      discount_child_total: c.total,
      discount_infant_total: i.total,
    }));
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [serviceTypesData, vesselsData, routesData] = await Promise.all([
        Services.getServiceTypes(),
        Services.getVessels(),
        Services.getRoutes(),
      ]);
      setServiceTypes(serviceTypesData.serviceTypes || []);
      setVessels(vesselsData.vessels || []);
      setRoutes(routesData.routes || []);
    } catch (error) {
      showMessage(`Error loading data: ${error.message}`, true);
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (text, isError = false) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 5000);
  };

  const loadSettings = async () => {
    try {
      const data = await Settings.getSettings();
      setTicketValidityDays(data.settings?.ticket_validity_days || "7");
      // Load SMTP settings
      const s = data.settings || {};
      setSmtp({
        host: s.smtp_host || "", port: s.smtp_port || "587", user: s.smtp_user || "",
        pass: s.smtp_pass || "", from_email: s.smtp_from_email || "", from_name: s.smtp_from_name || "",
        encryption: s.smtp_encryption || "tls"
      });
      // Load permissions
      try {
        const permData = await Permissions.getAll();
        setRolePermissions(permData.permissions || {});
      } catch {}
      // Load payment methods
      try {
        const pmData = await PaymentMethods.getAll();
        setPaymentMethods(pmData.paymentMethods || []);
      } catch {}
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  };

  // ── Instance handlers ──
  const loadInstances = async () => {
    try {
      const data = await Instances.getAll();
      setInstances(data.instances || []);
    } catch {}
  };

  const handleCreateInstance = async () => {
    if (!instanceForm.name.trim() || !instanceForm.label.trim()) {
      showMessage("Instance name and label are required", true);
      return;
    }
    try {
      await Instances.create(instanceForm);
      showMessage("Instance created successfully!");
      setShowInstanceModal(false);
      setInstanceForm({ name: "", label: "", color: "#f59e0b" });
      loadInstances();
    } catch (err: any) {
      showMessage("Error: " + err.message, true);
    }
  };

  const handleDeleteInstance = async (name: string) => {
    if (!window.confirm(`DELETE instance "${name}"? This will permanently destroy all booking data in this instance. This cannot be undone.`)) return;
    if (!window.confirm(`Are you absolutely sure? Type the instance name to confirm would be ideal, but this is the final warning.`)) return;
    try {
      await Instances.delete(name);
      showMessage("Instance deleted");
      loadInstances();
    } catch (err: any) {
      showMessage("Error: " + err.message, true);
    }
  };

  const reloadPaymentMethods = async () => {
    try {
      const pmData = await PaymentMethods.getAll();
      setPaymentMethods(pmData.paymentMethods || []);
    } catch {}
  };

  const openPaymentMethodModal = (pm: any = null) => {
    setEditingPaymentMethod(pm);
    if (pm) {
      setPaymentMethodForm({
        name: pm.name || "",
        code: pm.code || "",
        is_active: !!pm.is_active,
        sort_order: pm.sort_order || 0,
      });
    } else {
      const nextSort = (paymentMethods[paymentMethods.length - 1]?.sort_order || paymentMethods.length) + 1;
      setPaymentMethodForm({ name: "", code: "", is_active: true, sort_order: nextSort });
    }
    setShowPaymentMethodModal(true);
  };

  const closePaymentMethodModal = () => {
    setShowPaymentMethodModal(false);
    setEditingPaymentMethod(null);
    setPaymentMethodForm({ name: "", code: "", is_active: true, sort_order: 0 });
  };

  const handlePaymentMethodSubmit = async () => {
    try {
      if (!paymentMethodForm.name.trim()) {
        showMessage("Payment method name is required", true);
        return;
      }
      if (editingPaymentMethod) {
        await PaymentMethods.update(editingPaymentMethod.id, {
          name: paymentMethodForm.name.trim(),
          is_active: paymentMethodForm.is_active,
          sort_order: parseInt(String(paymentMethodForm.sort_order)) || 0,
        });
        showMessage("Payment method updated successfully!");
      } else {
        await PaymentMethods.create({
          name: paymentMethodForm.name.trim(),
          code: paymentMethodForm.code.trim() || undefined,
          sort_order: parseInt(String(paymentMethodForm.sort_order)) || 0,
        });
        showMessage("Payment method created successfully!");
      }
      closePaymentMethodModal();
      reloadPaymentMethods();
    } catch (error: any) {
      showMessage(`Error: ${error.message}`, true);
    }
  };

  const deletePaymentMethod = async (pmId: number) => {
    if (!window.confirm("Are you sure you want to delete this payment method?")) return;
    try {
      await PaymentMethods.delete(pmId);
      showMessage("Payment method deleted successfully!");
      reloadPaymentMethods();
    } catch (error: any) {
      showMessage(`Error: ${error.message}`, true);
    }
  };

  const saveSettings = async () => {
    setSettingsLoading(true);
    setSettingsMessage("");
    try {
      await Settings.updateSetting("ticket_validity_days", ticketValidityDays);
      setSettingsMessage("Settings saved successfully");
      setTimeout(() => setSettingsMessage(""), 3000);
    } catch (err) {
      setSettingsMessage("Error saving settings: " + err.message);
    } finally {
      setSettingsLoading(false);
    }
  };

  const saveSmtp = async () => {
    setSmtpLoading(true);
    setSmtpMessage("");
    try {
      await Promise.all([
        Settings.updateSetting("smtp_host", smtp.host),
        Settings.updateSetting("smtp_port", smtp.port),
        Settings.updateSetting("smtp_user", smtp.user),
        Settings.updateSetting("smtp_pass", smtp.pass),
        Settings.updateSetting("smtp_from_email", smtp.from_email),
        Settings.updateSetting("smtp_from_name", smtp.from_name),
        Settings.updateSetting("smtp_encryption", smtp.encryption),
      ]);
      setSmtpMessage("SMTP settings saved");
      setTimeout(() => setSmtpMessage(""), 3000);
    } catch (err) {
      setSmtpMessage("Error: " + err.message);
    } finally {
      setSmtpLoading(false);
    }
  };

  // Service Type Modal handlers
  const openServiceTypeModal = (serviceType = null) => {
    setEditingServiceType(serviceType);
    if (serviceType) {
      setServiceTypeForm({
        name: serviceType.name,
        description: serviceType.description || "",
        vat_rate: serviceType.vat_rate,
      });
    } else {
      setServiceTypeForm({ name: "", description: "", vat_rate: 12.5 });
    }
    setShowServiceTypeModal(true);
  };

  const closeServiceTypeModal = () => {
    setShowServiceTypeModal(false);
    setEditingServiceType(null);
    setServiceTypeForm({ name: "", description: "", vat_rate: 12.5 });
  };

  const handleServiceTypeSubmit = async () => {
    try {
      if (!serviceTypeForm.name.trim()) {
        showMessage("Service name is required", true);
        return;
      }

      if (editingServiceType) {
        await Services.updateServiceType(editingServiceType.id, serviceTypeForm);
        showMessage("Service type updated successfully!");
      } else {
        await Services.createServiceType(serviceTypeForm);
        showMessage("Service type created successfully!");
      }

      closeServiceTypeModal();
      loadData();
    } catch (error) {
      showMessage(`Error: ${error.message}`, true);
    }
  };

  // Vessel Modal handlers
  const openVesselModal = (vessel = null) => {
    setEditingVessel(vessel);
    if (vessel) {
      setVesselForm({
        name: vessel.name,
        seat_capacity: vessel.seat_capacity,
        description: vessel.description || "",
      });
    } else {
      setVesselForm({ name: "", seat_capacity: "", description: "" });
    }
    setShowVesselModal(true);
  };

  const closeVesselModal = () => {
    setShowVesselModal(false);
    setEditingVessel(null);
    setVesselForm({ name: "", seat_capacity: "", description: "" });
  };

  const handleVesselSubmit = async () => {
    try {
      if (!vesselForm.name.trim()) {
        showMessage("Vessel name is required", true);
        return;
      }
      if (!vesselForm.seat_capacity || parseInt(vesselForm.seat_capacity) < 1) {
        showMessage("Seat capacity must be at least 1", true);
        return;
      }

      const vesselData = {
        ...vesselForm,
        seat_capacity: parseInt(vesselForm.seat_capacity),
      };

      if (editingVessel) {
        await Services.updateVessel(editingVessel.id, vesselData);
        showMessage("Vessel updated successfully!");
      } else {
        await Services.createVessel(vesselData);
        showMessage("Vessel created successfully!");
      }

      closeVesselModal();
      loadData();
    } catch (error) {
      showMessage(`Error: ${error.message}`, true);
    }
  };

  const deleteVessel = async (vesselId) => {
    if (window.confirm("Are you sure you want to delete this vessel?")) {
      try {
        await Services.deleteVessel(vesselId);
        showMessage("Vessel deleted successfully!");
        loadData();
      } catch (error) {
        showMessage(`Error: ${error.message}`, true);
      }
    }
  };

  // Route Modal handlers
  const openRouteModal = (route = null) => {
    setEditingRoute(route);
    if (route) {
      const st = serviceTypes.find((s) => s.id === route.service_type_id);
      const vatRate = st?.vat_rate ?? 12.5;

      const toBase = (total) => {
        const t = parseFloat(total) || 0;
        return t / (1 + vatRate / 100);
      };

      const adultBase = toBase(route.adult_price);
      const studentBase = toBase(route.student_price);
      const childBase = toBase(route.child_price);
      const infantBase = toBase(route.infant_price);

      setRouteForm({
        service_type_id: route.service_type_id,
        source: route.source,
        destination: route.destination,
        createReturnRoute: false,
        adult_price_input: parseFloat(route.adult_price).toFixed(2),
        student_price_input: parseFloat(route.student_price).toFixed(2),
        child_price_input: parseFloat(route.child_price).toFixed(2),
        infant_price_input: parseFloat(route.infant_price).toFixed(2),
        adult_price_mode: "VIP",
        student_price_mode: "VIP",
        child_price_mode: "VIP",
        infant_price_mode: "VIP",
        adult_base_price: adultBase,
        student_base_price: studentBase,
        child_base_price: childBase,
        infant_base_price: infantBase,
        adult_vat: adultBase * vatRate / 100,
        student_vat: studentBase * vatRate / 100,
        child_vat: childBase * vatRate / 100,
        infant_vat: infantBase * vatRate / 100,
        adult_total: parseFloat(route.adult_price) || 0,
        student_total: parseFloat(route.student_price) || 0,
        child_total: parseFloat(route.child_price) || 0,
        infant_total: parseFloat(route.infant_price) || 0,
      });
    } else {
      setRouteForm({
        service_type_id: "",
        source: "",
        destination: "",
        createReturnRoute: false,
        adult_price_input: "",
        student_price_input: "",
        child_price_input: "",
        infant_price_input: "",
        adult_price_mode: "VEP",
        student_price_mode: "VEP",
        child_price_mode: "VEP",
        infant_price_mode: "VEP",
        adult_base_price: 0,
        student_base_price: 0,
        child_base_price: 0,
        infant_base_price: 0,
        adult_vat: 0,
        student_vat: 0,
        child_vat: 0,
        infant_vat: 0,
        adult_total: 0,
        student_total: 0,
        child_total: 0,
        infant_total: 0,
      });
    }
    setShowRouteModal(true);
  };

  const closeRouteModal = () => {
    setShowRouteModal(false);
    setEditingRoute(null);
    setShowPriceCalculator(false);
  };

  const handleRouteSubmit = async () => {
    try {
      if (!routeForm.service_type_id || !routeForm.source.trim() || !routeForm.destination.trim()) {
        showMessage("Service type, source, and destination are required", true);
        return;
      }
      const anyPrice =
        routeForm.adult_price_input ||
        routeForm.student_price_input ||
        routeForm.child_price_input ||
        routeForm.infant_price_input;
      if (!anyPrice) {
        showMessage("Please enter at least one passenger type price", true);
        return;
      }

      const payload = {
        service_type_id: routeForm.service_type_id,
        source: routeForm.source,
        destination: routeForm.destination,
        adult_price: routeForm.adult_total || 0,
        student_price: routeForm.student_total || 0,
        child_price: routeForm.child_total || 0,
        infant_price: routeForm.infant_total || 0,
      };

      if (editingRoute) {
        await Services.updateRoute(editingRoute.id, payload);

        // Also create reverse route if checked during edit
        if (routeForm.createReturnRoute) {
          try {
            const reversePayload = {
              ...payload,
              source: routeForm.destination,
              destination: routeForm.source,
            };
            await Services.createRoute(reversePayload);
            showMessage("Route updated and return route created!");
          } catch (reverseErr) {
            if (reverseErr.message?.includes("already exists") || reverseErr.message?.includes("Duplicate")) {
              showMessage("Route updated! Return route already exists.");
            } else {
              showMessage("Route updated, but return route failed: " + reverseErr.message, true);
            }
          }
        } else {
          showMessage("Route updated successfully!");
        }
      } else {
        await Services.createRoute(payload);

        // Auto-create reverse route with same pricing if checked
        if (routeForm.createReturnRoute) {
          try {
            const reversePayload = {
              ...payload,
              source: routeForm.destination,
              destination: routeForm.source,
            };
            await Services.createRoute(reversePayload);
            showMessage("Route and return route created successfully!");
          } catch (reverseErr) {
            if (reverseErr.message?.includes("already exists") || reverseErr.message?.includes("Duplicate")) {
              showMessage("Route created! Return route already exists.");
            } else {
              showMessage("Route created, but return route failed: " + reverseErr.message, true);
            }
          }
        } else {
          showMessage("Route created successfully!");
        }
      }

      closeRouteModal();
      loadData();
    } catch (error) {
      showMessage(`Error: ${error.message}`, true);
    }
  };

  // Discount Modal handlers
  const openDiscountModal = (route) => {
    setEditingRouteForDiscount(route);

    // Initialize discount form with current values
    const st = serviceTypes.find((s) => s.id === route.service_type_id);
    const vatRate = st?.vat_rate ?? 12.5;

    const toBase = (total) => {
      const t = parseFloat(total) || 0;
      return t / (1 + vatRate / 100);
    };

    setDiscountForm({
      discount_enabled: route.discount_enabled || false,
      discount_adult_price_input: route.discount_adult_price ? parseFloat(route.discount_adult_price).toFixed(2) : "",
      discount_student_price_input: route.discount_student_price ? parseFloat(route.discount_student_price).toFixed(2) : "",
      discount_child_price_input: route.discount_child_price ? parseFloat(route.discount_child_price).toFixed(2) : "",
      discount_infant_price_input: route.discount_infant_price ? parseFloat(route.discount_infant_price).toFixed(2) : "",
      discount_adult_price_mode: "VIP",
      discount_student_price_mode: "VIP",
      discount_child_price_mode: "VIP",
      discount_infant_price_mode: "VIP",
      discount_adult_base_price: toBase(route.discount_adult_price || 0),
      discount_student_base_price: toBase(route.discount_student_price || 0),
      discount_child_base_price: toBase(route.discount_child_price || 0),
      discount_infant_base_price: toBase(route.discount_infant_price || 0),
      discount_adult_vat: toBase(route.discount_adult_price || 0) * vatRate / 100,
      discount_student_vat: toBase(route.discount_student_price || 0) * vatRate / 100,
      discount_child_vat: toBase(route.discount_child_price || 0) * vatRate / 100,
      discount_infant_vat: toBase(route.discount_infant_price || 0) * vatRate / 100,
      discount_adult_total: parseFloat(route.discount_adult_price) || 0,
      discount_student_total: parseFloat(route.discount_student_price) || 0,
      discount_child_total: parseFloat(route.discount_child_price) || 0,
      discount_infant_total: parseFloat(route.discount_infant_price) || 0,
    });

    setShowDiscountModal(true);
  };

  const closeDiscountModal = () => {
    setShowDiscountModal(false);
    setEditingRouteForDiscount(null);
  };

  const handleDiscountSubmit = async () => {
    try {
      const payload = {
        discount_enabled: discountForm.discount_enabled,
        discount_adult_price: discountForm.discount_enabled ? (discountForm.discount_adult_total || 0) : 0,
        discount_student_price: discountForm.discount_enabled ? (discountForm.discount_student_total || 0) : 0,
        discount_child_price: discountForm.discount_enabled ? (discountForm.discount_child_total || 0) : 0,
        discount_infant_price: discountForm.discount_enabled ? (discountForm.discount_infant_total || 0) : 0,
      };

      await Services.updateRouteDiscount(editingRouteForDiscount.id, payload);
      showMessage(
        discountForm.discount_enabled
          ? "Discount pricing enabled successfully!"
          : "Discount pricing disabled successfully!"
      );

      closeDiscountModal();
      loadData();
    } catch (error) {
      showMessage(`Error: ${error.message}`, true);
    }
  };

  const deleteRoute = async (routeId) => {
    if (window.confirm("Are you sure you want to delete this route?")) {
      try {
        await Services.deleteRoute(routeId);
        showMessage("Route deleted successfully!");
        loadData();
      } catch (error) {
        showMessage(`Error: ${error.message}`, true);
      }
    }
  };

  // Helper function to get current effective price and check if discount is meaningful
  const getEffectivePrice = (route, priceType) => {
    const originalPrice = parseFloat(route[`${priceType}_price`]) || 0;
    const discountPrice = parseFloat(route[`discount_${priceType}_price`]) || 0;

    // Only return discount price if discount is enabled AND discount price is greater than 0 AND different from original
    if (route.discount_enabled && discountPrice > 0 && discountPrice !== originalPrice) {
      return discountPrice;
    }
    return originalPrice;
  };

  // Check if route has meaningful discount
  const hasActiveDiscount = (route) => {
    if (!route.discount_enabled) return false;

    const types = ['adult', 'student', 'child', 'infant'];
    return types.some(type => {
      const originalPrice = parseFloat(route[`${type}_price`]) || 0;
      const discountPrice = parseFloat(route[`discount_${type}_price`]) || 0;
      return discountPrice > 0 && discountPrice !== originalPrice;
    });
  };

  const filteredRoutes = selectedServiceType
    ? routes.filter((r) => r.service_type_id === selectedServiceType.id)
    : routes;

  // --- Passenger type config arrays used across the UI ---
  const passengerTypes = [
    { type: "adult", label: "Adult", color: "teal", border: "border-violet-500", borderLight: "border-violet-200", bg: "bg-violet-50", bgTint: "bg-violet-50/30", headerBg: "bg-violet-100/80", text: "text-violet-700", textDark: "text-teal-900", pill: "bg-violet-50 text-violet-700", badgeBg: "bg-violet-100", gradientFrom: "from-violet-500", gradientTo: "to-violet-600" },
    { type: "student", label: "Student", color: "emerald", border: "border-emerald-500", borderLight: "border-emerald-200", bg: "bg-emerald-50", bgTint: "bg-emerald-50/30", headerBg: "bg-emerald-100/80", text: "text-emerald-700", textDark: "text-emerald-900", pill: "bg-emerald-50 text-emerald-700", badgeBg: "bg-emerald-100", gradientFrom: "from-emerald-500", gradientTo: "to-emerald-600" },
    { type: "child", label: "Child", color: "amber", border: "border-amber-500", borderLight: "border-amber-200", bg: "bg-amber-50", bgTint: "bg-amber-50/30", headerBg: "bg-amber-100/80", text: "text-amber-700", textDark: "text-amber-900", pill: "bg-amber-50 text-amber-700", badgeBg: "bg-amber-100", gradientFrom: "from-amber-500", gradientTo: "to-amber-600" },
    { type: "infant", label: "Infant", color: "violet", border: "border-violet-500", borderLight: "border-violet-200", bg: "bg-violet-50", bgTint: "bg-violet-50/30", headerBg: "bg-violet-100/80", text: "text-violet-700", textDark: "text-violet-900", pill: "bg-violet-50 text-violet-700", badgeBg: "bg-violet-100", gradientFrom: "from-violet-500", gradientTo: "to-violet-600" },
  ];

  /* ================================================================
     SVG Icon helpers
     ================================================================ */
  const icons = {
    cog: (
      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    tag: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
      </svg>
    ),
    ship: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 13.5h16.5m-16.5 0a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 013.75 4.5h16.5a2.25 2.25 0 012.25 2.25v4.5a2.25 2.25 0 01-2.25 2.25m-16.5 0v3a2.25 2.25 0 002.25 2.25h12a2.25 2.25 0 002.25-2.25v-3" />
      </svg>
    ),
    card: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    database: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
      </svg>
    ),
    map: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    ),
    sliders: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
    shield: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    key: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
      </svg>
    ),
    plus: (cls = "w-6 h-6") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
      </svg>
    ),
    pencil: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    trash: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    x: (cls = "w-5 h-5") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    ),
    check: (cls = "w-5 h-5") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    warning: (cls = "w-5 h-5") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    info: (cls = "w-5 h-5") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    calculator: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
    pin: (cls = "w-5 h-5") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
      </svg>
    ),
    users: (cls = "w-5 h-5") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-3-3h-1m-2-3a3 3 0 11-6 0m6 0a3 3 0 01-6 0m6 0v1M9 20H4v-2a3 3 0 013-3h1m2-3a3 3 0 11-6 0" />
      </svg>
    ),
    chevronDown: (cls = "w-4 h-4") => (
      <svg className={cls} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    ),
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Loading Configuration</span>
            <span className="text-[12px] text-slate-400">Fetching settings...</span>
          </div>
        </div>
      </div>
    );
  }

  /* ================================================================
     TAB DEFINITIONS
     ================================================================ */
  const tabs = [
    { id: "service-types", label: "Service Types", icon: icons.tag("w-4 h-4") },
    { id: "vessels", label: "Vessels", icon: icons.ship("w-4 h-4") },
    { id: "payments", label: "Payments", icon: icons.card("w-4 h-4") },
    { id: "routes", label: "Routes & Pricing", icon: icons.pin("w-4 h-4") },
    { id: "roles", label: "Roles & Permissions", icon: icons.shield("w-4 h-4") },
    { id: "settings", label: "Settings", icon: icons.sliders("w-4 h-4") },
    ...(currentUserRole === "super_admin" ? [{ id: "instances", label: "Instances", icon: icons.database("w-4 h-4") }] : []),
  ];

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="p-3 sm:p-6 space-y-3 sm:space-y-5">

      {/* ======================== TOAST ======================== */}
      {message && (
        <div className="fixed top-4 right-4 z-[70] max-w-md animate-scale-in">
          <div className={`glass-card p-4 ${message.includes("Error") ? "bg-rose-50/80 border-rose-200/60" : "bg-emerald-50/80 border-emerald-200/60"}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-center">
                {message.includes("Error")
                  ? icons.warning("w-5 h-5 text-rose-600 mr-3 flex-shrink-0")
                  : icons.check("w-5 h-5 text-emerald-600 mr-3 flex-shrink-0")}
                <span className={`text-sm font-medium ${message.includes("Error") ? "text-rose-700" : "text-emerald-700"}`}>{message}</span>
              </div>
              <button onClick={() => setMessage("")} className={`ml-3 ${message.includes("Error") ? "text-rose-500 hover:text-rose-700" : "text-emerald-500 hover:text-emerald-700"} transition-colors duration-200`}>
                {icons.x("w-4 h-4")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================== TAB NAV (scrolls internally on mobile) ======================== */}
      <div className="card p-1.5 overflow-x-auto scrollbar-hide max-w-full">
        <div className="flex gap-1 w-max">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap py-2 px-3 sm:px-4 text-[12px] sm:text-[13px] font-medium rounded-xl transition-all duration-200 ${
                activeSection === tab.id
                  ? "bg-violet-600 text-white shadow-lg shadow-violet-500/25"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <span className={activeSection === tab.id ? "text-white" : "text-slate-400"}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ======================== TAB CONTENT ======================== */}
      <div>

        {/* ===================== SERVICE TYPES TAB ===================== */}
        {activeSection === "service-types" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {serviceTypes.map((serviceType) => (
              <div
                key={serviceType.id}
                onClick={() => openServiceTypeModal(serviceType)}
                className="group card p-5 relative cursor-pointer hover:border-slate-300 hover:shadow-md transition-all duration-200"
              >
                <div className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 sm:opacity-0 sm:group-hover:opacity-100 opacity-100 sm:group-hover:text-violet-600 sm:group-hover:bg-violet-50 transition-all">
                  {icons.pencil()}
                </div>

                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center mb-3">
                  {icons.tag("w-5 h-5 text-violet-600")}
                </div>
                <h3 className="text-[14px] font-bold text-slate-900 mb-1 pr-8">{serviceType.name}</h3>
                <p className="text-[12px] text-slate-500 mb-3 line-clamp-2">{serviceType.description || "No description"}</p>

                <span className="inline-flex items-center px-2.5 py-1 bg-violet-50 text-violet-700 text-[11px] font-semibold rounded-lg">
                  {serviceType.vat_rate}% VAT
                </span>
              </div>
            ))}

            {/* Add New Card */}
            <button
              onClick={() => openServiceTypeModal()}
              className="group border-2 border-dashed border-slate-200 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[140px] hover:border-violet-400 hover:bg-violet-50/30 transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-50 group-hover:bg-violet-100 flex items-center justify-center mb-2 transition-all">
                {icons.plus("w-5 h-5 text-slate-400 group-hover:text-violet-600 transition-colors")}
              </div>
              <span className="text-[13px] font-medium text-slate-500 group-hover:text-violet-700 transition-colors">Add Service Type</span>
            </button>
          </div>
        )}

        {/* ===================== VESSELS TAB ===================== */}
        {activeSection === "vessels" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {vessels.map((vessel) => {
              const capacity = parseInt(vessel.seat_capacity) || 0;
              const maxCap = 500;
              const fillPercent = Math.min((capacity / maxCap) * 100, 100);

              return (
                <div key={vessel.id} className="group glass-card-hover p-5 relative cursor-pointer" onClick={() => openVesselModal(vessel)}>
                  {/* Ship watermark */}
                  <svg className="absolute -bottom-4 -right-4 w-28 h-28 text-slate-200/40 pointer-events-none" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3.75 13.5h16.5m-16.5 0a2.25 2.25 0 01-2.25-2.25V6.75A2.25 2.25 0 013.75 4.5h16.5a2.25 2.25 0 012.25 2.25v4.5a2.25 2.25 0 01-2.25 2.25m-16.5 0v3a2.25 2.25 0 002.25 2.25h12a2.25 2.25 0 002.25-2.25v-3" />
                  </svg>

                  {/* Edit / Delete buttons — always visible on mobile */}
                  <div className="absolute top-3 right-3 z-20 flex items-center space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300">
                    <button onClick={(e) => { e.stopPropagation(); openVesselModal(vessel); }} className="p-2 rounded-xl text-violet-600 bg-violet-50/80 hover:bg-violet-100 sm:text-slate-400 sm:bg-transparent sm:hover:text-violet-600 sm:hover:bg-violet-50/80 transition-all duration-200" title="Edit">
                      {icons.pencil()}
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); deleteVessel(vessel.id); }} className="p-2 rounded-xl text-rose-600 bg-rose-50/80 hover:bg-rose-100 sm:text-slate-400 sm:bg-transparent sm:hover:text-rose-600 sm:hover:bg-rose-50/80 transition-all duration-200" title="Delete">
                      {icons.trash()}
                    </button>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 mb-1 pr-16 relative z-10">{vessel.name}</h3>
                  <p className="text-sm text-slate-500 mb-4 line-clamp-2 relative z-10">{vessel.description || "No description"}</p>

                  {/* Capacity bar */}
                  <div className="relative z-10">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-slate-500">Capacity</span>
                      <span className="text-sm font-bold text-violet-700">{capacity} seats</span>
                    </div>
                    <div className="bg-white  rounded-full h-2 overflow-hidden border border-slate-200">
                      <div className="bg-violet-600 h-2 rounded-full transition-all duration-500" style={{ width: `${fillPercent}%` }} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add New Vessel */}
            <button
              onClick={() => openVesselModal()}
              className="group border-2 border-dashed border-slate-300/60 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[180px] hover:border-violet-400/60 hover:bg-violet-50/20  transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-full bg-white  group-hover:bg-violet-100/80 flex items-center justify-center mb-3 transition-all duration-300">
                {icons.plus("w-6 h-6 text-slate-400 group-hover:text-violet-600 transition-colors duration-300")}
              </div>
              <span className="text-sm font-medium text-slate-500 group-hover:text-violet-700 transition-colors duration-300">Add Vessel</span>
            </button>
          </div>
        )}

        {/* ===================== PAYMENTS TAB ===================== */}
        {activeSection === "payments" && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paymentMethods.map((pm) => (
              <div
                key={pm.id}
                className={`group glass-card-hover p-5 relative cursor-pointer ${pm.is_active ? "" : "opacity-70"}`}
                onClick={() => openPaymentMethodModal(pm)}
              >
                {/* Card watermark */}
                <svg className="absolute -bottom-4 -right-4 w-28 h-28 text-slate-200/40 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.25} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>

                {/* Edit / Delete buttons */}
                <div className="absolute top-3 right-3 z-20 flex items-center space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300">
                  <button
                    onClick={(e) => { e.stopPropagation(); openPaymentMethodModal(pm); }}
                    className="p-2 rounded-xl text-violet-600 bg-violet-50/80 hover:bg-violet-100 sm:text-slate-400 sm:bg-transparent sm:hover:text-violet-600 sm:hover:bg-violet-50/80 transition-all duration-200"
                    title="Edit"
                  >
                    {icons.pencil()}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePaymentMethod(pm.id); }}
                    className="p-2 rounded-xl text-rose-600 bg-rose-50/80 hover:bg-rose-100 sm:text-slate-400 sm:bg-transparent sm:hover:text-rose-600 sm:hover:bg-rose-50/80 transition-all duration-200"
                    title="Delete"
                  >
                    {icons.trash()}
                  </button>
                </div>

                {/* Icon */}
                <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center mb-3 relative z-10">
                  {icons.card("w-5 h-5 text-violet-600")}
                </div>

                <h3 className="text-[14px] font-bold text-slate-900 mb-1 pr-16 relative z-10">{pm.name}</h3>
                <p className="text-[11px] font-mono text-slate-400 mb-3 relative z-10">{pm.code}</p>

                <div className="flex items-center gap-2 relative z-10">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold rounded-lg ${
                      pm.is_active
                        ? "bg-emerald-50 text-emerald-700 border border-emerald-200/60"
                        : "bg-slate-100 text-slate-500 border border-slate-200/60"
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${pm.is_active ? "bg-emerald-500" : "bg-slate-400"}`} />
                    {pm.is_active ? "Active" : "Disabled"}
                  </span>
                  <span className="inline-flex items-center px-2 py-1 bg-slate-50 text-slate-500 text-[10px] font-semibold rounded-lg border border-slate-200/60">
                    #{pm.sort_order}
                  </span>
                </div>
              </div>
            ))}

            {/* Add New Payment Method */}
            <button
              onClick={() => openPaymentMethodModal()}
              className="group border-2 border-dashed border-slate-300/60 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[180px] hover:border-violet-400/60 hover:bg-violet-50/20 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-full bg-white group-hover:bg-violet-100/80 flex items-center justify-center mb-3 transition-all duration-300">
                {icons.plus("w-6 h-6 text-slate-400 group-hover:text-violet-600 transition-colors duration-300")}
              </div>
              <span className="text-sm font-medium text-slate-500 group-hover:text-violet-700 transition-colors duration-300">Add Payment Method</span>
            </button>
          </div>
        )}

        {/* ===================== ROUTES & PRICING TAB ===================== */}
        {activeSection === "routes" && (
          <div>
            {/* Top bar: filter + add route */}
            <div className="flex items-center justify-between gap-2 mb-3 sm:mb-6">
              <div className="relative flex-1 sm:flex-none">
                <select
                  value={selectedServiceType?.id || ""}
                  onChange={(e) => {
                    const st = serviceTypes.find((x) => String(x.id) === e.target.value);
                    setSelectedServiceType(st || null);
                  }}
                  className="glass-select w-full pl-3 sm:pl-4 pr-9 sm:pr-10 py-2 sm:py-2.5 text-[12px] sm:text-sm font-medium"
                >
                  <option value="">All Service Types</option>
                  {serviceTypes.map((st) => (
                    <option key={st.id} value={st.id}>{st.name}</option>
                  ))}
                </select>
                <span className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  {icons.chevronDown()}
                </span>
              </div>
              <button onClick={() => openRouteModal()} className="btn-primary flex items-center text-[12px] sm:text-sm px-3 sm:px-5 py-2 sm:py-2.5 flex-shrink-0 whitespace-nowrap">
                {icons.plus("w-4 h-4 sm:mr-2")}
                <span className="hidden sm:inline">Add Route</span>
                <span className="sm:hidden ml-1">Add</span>
              </button>
            </div>

            {filteredRoutes.length === 0 ? (
              <div className="glass-card text-center py-16">
                <div className="w-16 h-16 bg-white  rounded-xl flex items-center justify-center mx-auto mb-4 border border-slate-200">
                  {icons.map("w-8 h-8 text-slate-400")}
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-2">No routes yet</h3>
                <p className="text-sm text-slate-500 mb-5">Create your first route to start managing pricing</p>
                <button onClick={() => openRouteModal()} className="btn-primary inline-flex items-center">
                  {icons.plus("w-4 h-4 mr-2")}
                  Create Route
                </button>
              </div>
            ) : (
              <div className="glass-card overflow-hidden">
                {/* Table Header */}
                <div className="hidden lg:grid lg:grid-cols-12 gap-4 px-6 py-3 bg-slate-50/80 border-b border-slate-200/60 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <div className="col-span-3">Route</div>
                  <div className="col-span-1">Service</div>
                  <div className="col-span-1 text-center">Adult</div>
                  <div className="col-span-1 text-center">Student</div>
                  <div className="col-span-1 text-center">Child</div>
                  <div className="col-span-1 text-center">Infant</div>
                  <div className="col-span-1 text-center">Discount</div>
                  <div className="col-span-3 text-right">Actions</div>
                </div>

                {/* Route Rows */}
                <div className="divide-y divide-slate-100/80">
                  {filteredRoutes.map((route) => (
                    <div key={route.id} className="group hover:bg-violet-50/30 transition-colors duration-200">
                      {/* Desktop row */}
                      <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center px-6 py-4">
                        {/* Route */}
                        <div className="col-span-3 flex items-center min-w-0">
                          <div className="flex items-center mr-3 flex-shrink-0">
                            <div className="w-2.5 h-2.5 bg-violet-500 rounded-full"></div>
                            <div className="w-10 border-t-2 border-dashed border-slate-300 mx-1"></div>
                            <div className="w-2.5 h-2.5 bg-violet-500 rounded-full"></div>
                          </div>
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {route.source} <span className="text-slate-400 font-normal">to</span> {route.destination}
                          </span>
                        </div>

                        {/* Service Type */}
                        <div className="col-span-1">
                          <span className="inline-flex items-center px-2 py-1 bg-violet-50/80 text-violet-700 text-xs font-semibold rounded-lg border border-violet-200/60 truncate">
                            {route.service_type_name}
                          </span>
                        </div>

                        {/* Prices */}
                        {passengerTypes.map((p) => {
                          const originalPrice = parseFloat(route[`${p.type}_price`]) || 0;
                          const effectivePrice = getEffectivePrice(route, p.type);
                          const isDiscounted = hasActiveDiscount(route) && effectivePrice !== originalPrice;

                          return (
                            <div key={p.type} className="col-span-1 text-center">
                              {isDiscounted ? (
                                <div>
                                  <div className="text-xs text-slate-400 line-through">FJ${originalPrice.toFixed(2)}</div>
                                  <div className={`text-sm font-bold ${p.text}`}>FJ${effectivePrice.toFixed(2)}</div>
                                </div>
                              ) : (
                                <span className={`text-sm font-bold ${p.text}`}>FJ${effectivePrice.toFixed(2)}</span>
                              )}
                            </div>
                          );
                        })}

                        {/* Discount badge */}
                        <div className="col-span-1 text-center">
                          {hasActiveDiscount(route) ? (
                            <span className="inline-flex items-center px-2 py-1 bg-rose-100/80 text-rose-700 text-xs font-bold rounded-lg uppercase">SALE</span>
                          ) : (
                            <span className="text-xs text-slate-400">--</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="col-span-3 flex items-center justify-end gap-2">
                          <button onClick={() => openRouteModal(route)} className="btn-secondary !py-1.5 !px-3 !text-xs flex items-center">
                            {icons.pencil("w-3.5 h-3.5 mr-1")}
                            Edit
                          </button>
                          <button
                            onClick={() => openDiscountModal(route)}
                            className={`btn-ghost !py-1.5 !px-3 !text-xs flex items-center ${hasActiveDiscount(route) ? "text-amber-700 hover:bg-amber-50/80" : "text-emerald-700 hover:bg-emerald-50/80"}`}
                          >
                            {icons.tag("w-3.5 h-3.5 mr-1")}
                            {hasActiveDiscount(route) ? "Discount" : "Add Discount"}
                          </button>
                          <button onClick={() => deleteRoute(route.id)} className="btn-danger !py-1.5 !px-3 !text-xs flex items-center">
                            {icons.trash("w-3.5 h-3.5 mr-1")}
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Mobile card — compact */}
                      <div className="lg:hidden p-3 space-y-2.5">
                        {/* Route header */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center min-w-0 flex-1">
                            <div className="flex items-center mr-2 flex-shrink-0">
                              <div className="w-2 h-2 bg-violet-500 rounded-full" style={{ backgroundColor: 'var(--color-violet-500)' }}></div>
                              <div className="w-5 border-t-2 border-dashed border-slate-300 mx-0.5"></div>
                              <div className="w-2 h-2 bg-violet-500 rounded-full" style={{ backgroundColor: 'var(--color-violet-500)' }}></div>
                            </div>
                            <h3 className="text-[14px] font-bold text-slate-900 truncate">
                              {route.source} <span className="text-slate-400 font-normal">→</span> {route.destination}
                            </h3>
                          </div>
                          {hasActiveDiscount(route) && (
                            <span className="flex-shrink-0 px-1.5 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-bold rounded uppercase">SALE</span>
                          )}
                        </div>

                        {/* Service & VAT */}
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center px-2 py-0.5 bg-violet-50 text-violet-700 text-[10px] font-semibold rounded border border-violet-200/60">{route.service_type_name}</span>
                          <span className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded border border-emerald-200/60">{route.vat_rate}% VAT</span>
                        </div>

                        {/* Prices grid */}
                        <div className="grid grid-cols-4 gap-1.5">
                          {passengerTypes.map((p) => {
                            const originalPrice = parseFloat(route[`${p.type}_price`]) || 0;
                            const effectivePrice = getEffectivePrice(route, p.type);
                            const isDiscounted = hasActiveDiscount(route) && effectivePrice !== originalPrice;

                            return (
                              <div key={p.type} className={`bg-white border border-slate-200 border-l-4 ${p.border} rounded-lg px-2 py-1.5`}>
                                <div className="text-[9px] font-semibold uppercase tracking-wide text-slate-500 truncate">{p.label}</div>
                                {isDiscounted ? (
                                  <>
                                    <div className="text-[9px] text-slate-400 line-through leading-tight">FJ${originalPrice.toFixed(2)}</div>
                                    <span className={`text-[12px] font-bold ${p.text}`}>FJ${effectivePrice.toFixed(2)}</span>
                                  </>
                                ) : (
                                  <span className={`text-[12px] font-bold ${p.text}`}>FJ${effectivePrice.toFixed(2)}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Actions — icon buttons, centered */}
                        <div className="flex items-center justify-center gap-2 pt-2 border-t border-slate-100">
                          <button
                            onClick={() => openRouteModal(route)}
                            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors"
                            title="Edit"
                            style={{ color: 'var(--color-violet-600)', backgroundColor: 'color-mix(in srgb, var(--color-violet-500) 10%, white)' }}
                          >
                            {icons.pencil("w-4 h-4")}
                          </button>
                          <button
                            onClick={() => openDiscountModal(route)}
                            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${hasActiveDiscount(route) ? "text-amber-600 bg-amber-50 hover:bg-amber-100" : "text-emerald-600 bg-emerald-50 hover:bg-emerald-100"}`}
                            title={hasActiveDiscount(route) ? "Edit Discount" : "Add Discount"}
                          >
                            {icons.tag("w-4 h-4")}
                          </button>
                          <button
                            onClick={() => deleteRoute(route.id)}
                            className="w-9 h-9 flex items-center justify-center text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                            title="Delete"
                          >
                            {icons.trash("w-4 h-4")}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== ROLES & PERMISSIONS TAB ===================== */}
        {activeSection === "roles" && (() => {
          const builtInRoles = ["super_admin", "admin", "agent", "dock"];
          const visibleRoles = Object.keys(rolePermissions).filter(r => r !== "super_admin");
          const customRoles = visibleRoles.filter(r => !builtInRoles.includes(r));

          return (
          <div className="space-y-4 sm:space-y-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] sm:text-sm text-slate-500 min-w-0">
                <span className="hidden sm:inline">{isSuperAdmin ? "Configure which features each role can access." : "View which features each role can access. Contact your system administrator to make changes."}</span>
                <span className="sm:hidden">{isSuperAdmin ? "Configure role access" : "View role access (read-only)"}</span>
              </p>
              {isSuperAdmin && (
                <button onClick={() => { setNewRoleName(""); setNewRolePerms({}); setShowCreateRoleModal(true); }} className="btn-primary text-[12px] sm:text-sm flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 flex-shrink-0 whitespace-nowrap">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
                  <span className="hidden sm:inline">Create Role</span>
                  <span className="sm:hidden">New Role</span>
                </button>
              )}
            </div>

            {/* Permissions grid — scrolls horizontally on mobile */}
            <div className="glass-card overflow-x-auto scrollbar-hide">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-bold text-slate-600 uppercase w-48">Permission</th>
                    {visibleRoles.map(role => (
                      <th key={role} className="px-3 py-3 text-center">
                        <div className="text-xs font-bold text-slate-700 uppercase">{role.replace(/_/g, ' ')}</div>
                        {isSuperAdmin && !builtInRoles.includes(role) && (
                          <button
                            onClick={async () => {
                              if (!window.confirm(`Delete custom role "${role}"? Users with this role will need to be reassigned.`)) return;
                              try {
                                await Permissions.deleteRole(role);
                                showMessage(`Role "${role}" deleted`);
                                loadSettings();
                              } catch (err) { showMessage(err.message, true); }
                            }}
                            className="text-[10px] text-rose-500 hover:text-rose-700 font-medium mt-0.5"
                          >
                            delete
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ALL_PERMISSIONS.map(perm => (
                    <tr key={perm.key} className="border-b border-slate-100 hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-slate-900">{perm.label}</div>
                        <div className="text-xs text-slate-400">{perm.desc}</div>
                      </td>
                      {visibleRoles.map(role => {
                        const granted = rolePermissions[role]?.[perm.key] ?? false;
                        const canEdit = isSuperAdmin;
                        return (
                          <td key={role} className="px-3 py-3 text-center">
                            <button
                              onClick={async () => {
                                if (!canEdit) return;
                                try {
                                  await Permissions.update(role, perm.key, !granted);
                                  setRolePermissions(prev => ({ ...prev, [role]: { ...prev[role], [perm.key]: !granted } }));
                                } catch (err) { showMessage(err.message, true); }
                              }}
                              disabled={!canEdit}
                              className={`w-10 h-6 rounded-full transition-all duration-200 relative ${granted ? "bg-violet-500" : "bg-slate-300"} ${canEdit ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
                            >
                              <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all duration-200 ${granted ? "left-[18px]" : "left-0.5"}`} />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="text-xs text-slate-400">
              Built-in roles (admin, agent, dock) cannot be deleted. Custom roles can be deleted if no users are assigned to them.
            </div>
          </div>
          );
        })()}

        {/* Create Role Modal */}
        {showCreateRoleModal && createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 " onClick={() => setShowCreateRoleModal(false)} />
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md animate-scale-in">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-slate-900">Create Custom Role</h3>
                <button onClick={() => setShowCreateRoleModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Role Name *</label>
                  <input type="text" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} className="glass-input w-full" placeholder="e.g. supervisor, auditor, manager" />
                  <p className="text-xs text-slate-400 mt-1">Will be stored as: <span className="font-mono">{newRoleName.trim().toLowerCase().replace(/\s+/g, '_') || '...'}</span></p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
                  <div className="space-y-2">
                    {ALL_PERMISSIONS.map(perm => (
                      <label key={perm.key} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-slate-50 cursor-pointer">
                        <div>
                          <span className="text-sm font-medium text-slate-800">{perm.label}</span>
                          <span className="text-xs text-slate-400 ml-2">{perm.desc}</span>
                        </div>
                        <input
                          type="checkbox"
                          checked={!!newRolePerms[perm.key]}
                          onChange={(e) => setNewRolePerms(prev => ({ ...prev, [perm.key]: e.target.checked }))}
                          className="w-4 h-4 text-violet-600 rounded border-slate-300 focus:ring-violet-500"
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3">
                <button onClick={() => setShowCreateRoleModal(false)} className="btn-secondary text-sm">Cancel</button>
                <button
                  onClick={async () => {
                    if (!newRoleName.trim()) { showMessage("Role name is required", true); return; }
                    try {
                      await Permissions.createRole(newRoleName, newRolePerms);
                      showMessage(`Role "${newRoleName}" created`);
                      setShowCreateRoleModal(false);
                      loadSettings();
                    } catch (err) { showMessage(err.message, true); }
                  }}
                  className="btn-primary text-sm"
                >
                  Create Role
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

        {/* ===================== SETTINGS TAB ===================== */}
        {activeSection === "settings" && (
          <div className="space-y-5">
            {/* Top row: Ticket Validity + Color Picker side by side */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Ticket Validity */}
            <div className="card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                  {icons.sliders("w-4 h-4 text-violet-600")}
                </div>
                <div>
                  <h3 className="text-[13px] font-semibold text-slate-800">Ticket Validity Period</h3>
                  <p className="text-[11px] text-slate-400">Default days a ticket remains valid from travel date</p>
                </div>
              </div>
              <div className="p-5">
                <div>
                  <label className="block text-[12px] font-medium text-slate-600 mb-1.5">Validity (days)</label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={ticketValidityDays}
                    onChange={(e) => setTicketValidityDays(e.target.value)}
                    className="input w-full"
                    placeholder="7"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">1 - 365 days</p>
                </div>
                <div className="mt-4 flex items-center gap-3">
                  <button onClick={saveSettings} disabled={settingsLoading} className="btn-primary disabled:opacity-50">
                    {settingsLoading ? (
                      <span className="flex items-center gap-2">
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Saving...
                      </span>
                    ) : "Save Settings"}
                  </button>
                  {settingsMessage && (
                    <span className={`text-[12px] font-medium ${settingsMessage.startsWith("Error") ? "text-rose-600" : "text-emerald-600"}`}>
                      {settingsMessage}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Primary Color (admin/super_admin only) */}
            {(currentUserRole === "admin" || currentUserRole === "super_admin") && <ColorPicker />}
            </div>{/* end top grid */}

            {/* SMTP Configuration (admin/super_admin only) */}
            {(currentUserRole === "admin" || currentUserRole === "super_admin") && (
              <div className="card overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-8 h-8 bg-violet-100 rounded-lg flex items-center justify-center">
                    <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-[13px] font-semibold text-slate-800">Email / SMTP Configuration</h3>
                    <p className="text-[11px] text-slate-400">Configure email for ticket delivery and user onboarding</p>
                  </div>
                </div>
                <div className="p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-slate-600">SMTP Host</label>
                      <input type="text" value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} className="input w-full" placeholder="smtp.gmail.com" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-slate-600">Port</label>
                      <input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: e.target.value })} className="input w-full" placeholder="587" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-slate-600">Username</label>
                      <input type="text" value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} className="input w-full" placeholder="your@email.com" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-slate-600">Password</label>
                      <input type="password" value={smtp.pass} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} className="input w-full" placeholder="App password" />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-slate-600">From Email</label>
                      <input type="email" value={smtp.from_email} onChange={(e) => setSmtp({ ...smtp, from_email: e.target.value })} className="input w-full" placeholder="noreply@company.com" />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-[12px] font-medium text-slate-600">From Name</label>
                      <input type="text" value={smtp.from_name} onChange={(e) => setSmtp({ ...smtp, from_name: e.target.value })} className="input w-full" placeholder="Goundar Shipping" />
                    </div>
                  </div>
                  <div className="space-y-1.5 max-w-xs">
                    <label className="block text-[12px] font-medium text-slate-600">Encryption</label>
                    <select value={smtp.encryption} onChange={(e) => setSmtp({ ...smtp, encryption: e.target.value })} className="select w-full">
                      <option value="tls">TLS (Recommended)</option>
                      <option value="ssl">SSL</option>
                      <option value="none">None</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button onClick={saveSmtp} disabled={smtpLoading} className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-5 py-2 text-[12px] transition-colors disabled:opacity-50">
                      {smtpLoading ? "Saving..." : "Save SMTP Settings"}
                    </button>
                    {smtpMessage && (
                      <span className={`text-[12px] font-medium ${smtpMessage.includes("Error") ? "text-rose-600" : "text-emerald-600"}`}>
                        {smtpMessage}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== INSTANCES TAB (super_admin only) ===================== */}
        {activeSection === "instances" && currentUserRole === "super_admin" && (
          <div className="space-y-5">
            {/* Info banner */}
            <div className="card p-4 bg-violet-50/60 border-violet-200/60">
              <p className="text-[12px] text-violet-800">
                Each instance runs at its own URL path. Production is at <code className="font-mono bg-white px-1.5 py-0.5 rounded text-[11px]">/</code>,
                other instances at <code className="font-mono bg-white px-1.5 py-0.5 rounded text-[11px]">/name/</code>.
                Each instance has its own users, teams, bookings, and configuration — fully isolated.
              </p>
            </div>

            {/* Instance cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {instances.map((inst) => {
                const isProduction = inst.name === "production";
                const instanceUrl = isProduction ? "/" : `/${inst.name}/`;
                return (
                  <div
                    key={inst.id}
                    className="group card p-5 relative hover:border-slate-300 hover:shadow-md"
                  >
                    {/* Actions */}
                    {!isProduction && (
                      <div className="absolute top-3 right-3 z-20 flex items-center space-x-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-all duration-300">
                        <button
                          onClick={() => handleDeleteInstance(inst.name)}
                          className="p-2 rounded-xl text-rose-600 bg-rose-50/80 hover:bg-rose-100 sm:text-slate-400 sm:bg-transparent sm:hover:text-rose-600 sm:hover:bg-rose-50/80 transition-all duration-200"
                          title="Delete instance"
                        >
                          {icons.trash()}
                        </button>
                      </div>
                    )}

                    <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3" style={{ backgroundColor: (inst.color || '#10b981') + '20' }}>
                      {icons.database("w-5 h-5")}
                    </div>
                    <h3 className="text-[14px] font-bold text-slate-900 mb-0.5 pr-12">{inst.label}</h3>
                    <p className="text-[11px] font-mono text-slate-400 mb-1">{inst.db_name}</p>
                    <p className="text-[10px] text-slate-400 mb-3">
                      URL: <code className="font-mono bg-slate-100 px-1.5 py-0.5 rounded">{instanceUrl}</code>
                    </p>

                    <a
                      href={instanceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full transition-colors"
                      style={{ backgroundColor: (inst.color || '#10b981') + '15', color: inst.color || '#10b981' }}
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      Open {inst.label}
                    </a>
                  </div>
                );
              })}

              {/* Add New Instance */}
              <button
                onClick={() => setShowInstanceModal(true)}
                className="group border-2 border-dashed border-slate-300/60 rounded-2xl p-5 flex flex-col items-center justify-center min-h-[180px] hover:border-violet-400/60 hover:bg-violet-50/20 transition-all duration-300"
              >
                <div className="w-12 h-12 rounded-full bg-white group-hover:bg-violet-100/80 flex items-center justify-center mb-3 transition-all duration-300">
                  {icons.plus("w-6 h-6 text-slate-400 group-hover:text-violet-600 transition-colors duration-300")}
                </div>
                <span className="text-sm font-medium text-slate-500 group-hover:text-violet-700 transition-colors duration-300">Add Instance</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ==================== INSTANCE MODAL ==================== */}
      {showInstanceModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowInstanceModal(false)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-scale-in">
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 shadow-lg shadow-violet-500/20">
                  {icons.database("w-5 h-5 text-white")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Create New Instance</h3>
                  <p className="text-xs text-slate-500 mt-0.5">A separate database for testing or staging</p>
                </div>
              </div>
              <button onClick={() => setShowInstanceModal(false)} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                {icons.x()}
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Instance Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={instanceForm.name}
                  onChange={(e) => setInstanceForm({ ...instanceForm, name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                  className="glass-input w-full font-mono"
                  placeholder="e.g., test, staging"
                />
                <p className="text-[11px] text-slate-400 mt-1">Lowercase letters, numbers, dashes only. Used as the identifier.</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Display Label <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={instanceForm.label}
                  onChange={(e) => setInstanceForm({ ...instanceForm, label: e.target.value })}
                  className="glass-input w-full"
                  placeholder="e.g., Test Environment"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Badge Color</label>
                <div className="flex items-center gap-2">
                  {["#10b981", "#f59e0b", "#3b82f6", "#ef4444", "#8b5cf6", "#ec4899"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setInstanceForm({ ...instanceForm, color: c })}
                      className={`w-8 h-8 rounded-lg transition-all ${instanceForm.color === c ? "ring-2 ring-offset-2 ring-violet-500 scale-110" : "hover:scale-105"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-[12px] text-amber-800 font-medium">
                  This will create a new MySQL database <span className="font-mono font-bold">booking_app_{instanceForm.name || '...'}</span> with empty routes, vessels, and bookings. Users and settings are shared across all instances.
                </p>
              </div>
            </div>
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-slate-100 flex justify-end gap-3 z-10">
              <button onClick={() => setShowInstanceModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={handleCreateInstance} className="btn-primary">Create Instance</button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ==================== SERVICE TYPE MODAL ==================== */}
      {showServiceTypeModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 " onClick={closeServiceTypeModal} />
          {/* Modal Content */}
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-scale-in">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 shadow-lg shadow-violet-500/20">
                  {icons.tag("w-5 h-5 text-white")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingServiceType ? "Edit Service Type" : "Create Service Type"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Configure service category and VAT rate</p>
                </div>
              </div>
              <button onClick={closeServiceTypeModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                {icons.x()}
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Service Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={serviceTypeForm.name}
                  onChange={(e) => setServiceTypeForm({ ...serviceTypeForm, name: e.target.value })}
                  className="glass-input w-full"
                  placeholder="e.g., Express Service"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  VAT Rate (%) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    value={serviceTypeForm.vat_rate}
                    onChange={(e) => setServiceTypeForm({ ...serviceTypeForm, vat_rate: parseFloat(e.target.value) || 0 })}
                    className="glass-input w-full pr-10"
                    placeholder="12.5"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">%</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                <textarea
                  value={serviceTypeForm.description}
                  onChange={(e) => setServiceTypeForm({ ...serviceTypeForm, description: e.target.value })}
                  rows={3}
                  className="glass-input w-full resize-none"
                  placeholder="Brief description of this service type"
                />
              </div>

              {/* VAT Preview Panel */}
              <div className="border-t border-slate-100 pt-5">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">VAT Calculation Preview</h4>
                <div className="grid grid-cols-2 gap-3">
                  {[50, 100, 150, 200].map((basePrice) => {
                    const vat = (basePrice * serviceTypeForm.vat_rate) / 100;
                    const total = basePrice + vat;
                    return (
                      <div key={basePrice} className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-3">
                        <div className="text-xs text-slate-500 mb-0.5">Base: FJ${basePrice.toFixed(2)}</div>
                        <div className="text-xs text-emerald-600 mb-0.5">VAT: FJ${vat.toFixed(2)}</div>
                        <div className="text-sm font-bold text-slate-900">Total: FJ${total.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-slate-100 flex justify-end gap-3 z-10">
              <button onClick={closeServiceTypeModal} className="btn-secondary">Cancel</button>
              <button onClick={handleServiceTypeSubmit} className="btn-primary">
                {editingServiceType ? "Update Service Type" : "Create Service Type"}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ==================== VESSEL MODAL ==================== */}
      {showVesselModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 " onClick={closeVesselModal} />
          {/* Modal Content */}
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-scale-in">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 shadow-lg shadow-violet-500/20">
                  {icons.ship("w-5 h-5 text-white")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingVessel ? "Edit Vessel" : "Add Vessel"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Manage vessel information and capacity</p>
                </div>
              </div>
              <button onClick={closeVesselModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                {icons.x()}
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Vessel Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={vesselForm.name}
                  onChange={(e) => setVesselForm({ ...vesselForm, name: e.target.value })}
                  className="glass-input w-full"
                  placeholder="e.g., MV Island Explorer"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Seat Capacity <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    value={vesselForm.seat_capacity}
                    onChange={(e) => setVesselForm({ ...vesselForm, seat_capacity: e.target.value })}
                    className="glass-input w-full pr-16"
                    placeholder="200"
                    min="1"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-medium">seats</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Description</label>
                <textarea
                  value={vesselForm.description}
                  onChange={(e) => setVesselForm({ ...vesselForm, description: e.target.value })}
                  rows={3}
                  className="glass-input w-full resize-none"
                  placeholder="Brief description of this vessel"
                />
              </div>

              {/* Capacity Preview */}
              {vesselForm.seat_capacity && parseInt(vesselForm.seat_capacity) > 0 && (
                <div className="border-t border-slate-100 pt-5">
                  <div className="bg-violet-50/60 border border-violet-200/60 rounded-xl p-4">
                    <h4 className="text-xs font-semibold text-teal-800 uppercase tracking-wider mb-3">Capacity Preview</h4>
                    <div className="flex items-center">
                      {icons.users("w-5 h-5 text-violet-600 mr-2")}
                      <span className="text-2xl font-bold text-teal-900">{vesselForm.seat_capacity}</span>
                      <span className="text-sm text-violet-700 ml-2">total passengers</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-slate-100 flex justify-end gap-3 z-10">
              <button onClick={closeVesselModal} className="btn-secondary">Cancel</button>
              <button onClick={handleVesselSubmit} className="btn-primary">
                {editingVessel ? "Update Vessel" : "Add Vessel"}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ==================== PAYMENT METHOD MODAL ==================== */}
      {showPaymentMethodModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closePaymentMethodModal} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto animate-scale-in">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 shadow-lg shadow-violet-500/20">
                  {icons.card("w-5 h-5 text-white")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingPaymentMethod ? "Edit Payment Method" : "Add Payment Method"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Types available when confirming a booking</p>
                </div>
              </div>
              <button onClick={closePaymentMethodModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                {icons.x()}
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">
                  Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={paymentMethodForm.name}
                  onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, name: e.target.value })}
                  className="glass-input w-full"
                  placeholder="e.g., Bank Transfer"
                />
              </div>

              {!editingPaymentMethod && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Code <span className="text-slate-400 font-normal">(optional, auto-generated from name)</span>
                  </label>
                  <input
                    type="text"
                    value={paymentMethodForm.code}
                    onChange={(e) => setPaymentMethodForm({ ...paymentMethodForm, code: e.target.value })}
                    className="glass-input w-full font-mono"
                    placeholder="bank-transfer"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Lowercase, dash-separated. Must be unique.</p>
                </div>
              )}

              {editingPaymentMethod && (
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Code</label>
                  <input
                    type="text"
                    value={paymentMethodForm.code}
                    readOnly
                    className="glass-input w-full font-mono bg-slate-50 text-slate-500 cursor-not-allowed"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Code cannot be changed after creation.</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Sort Order</label>
                <input
                  type="number"
                  value={paymentMethodForm.sort_order}
                  onChange={(e) =>
                    setPaymentMethodForm({ ...paymentMethodForm, sort_order: parseInt(e.target.value) || 0 })
                  }
                  className="glass-input w-full"
                  placeholder="1"
                />
                <p className="text-[11px] text-slate-400 mt-1">Lower numbers appear first in the booking screen.</p>
              </div>

              {editingPaymentMethod && (
                <div className="border-t border-slate-100 pt-5">
                  <div className="flex items-center justify-between bg-slate-50/60 border border-slate-200/60 rounded-xl p-4">
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">Status</h4>
                      <p className="text-xs text-slate-500">
                        {paymentMethodForm.is_active
                          ? "Agents can select this method at booking time"
                          : "Hidden from the booking screen"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentMethodForm({ ...paymentMethodForm, is_active: !paymentMethodForm.is_active })
                      }
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        paymentMethodForm.is_active ? "bg-violet-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          paymentMethodForm.is_active ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-slate-100 flex justify-end gap-3 z-10">
              <button onClick={closePaymentMethodModal} className="btn-secondary">Cancel</button>
              <button onClick={handlePaymentMethodSubmit} className="btn-primary">
                {editingPaymentMethod ? "Update Payment Method" : "Add Payment Method"}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ==================== ROUTE MODAL ==================== */}
      {showRouteModal && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 " onClick={closeRouteModal} />
          {/* Modal Content */}
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-scale-in">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 shadow-lg shadow-violet-500/20">
                  {icons.pin("w-5 h-5 text-white")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {editingRoute ? "Edit Route" : "Create Route"}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">Configure route details and passenger pricing</p>
                </div>
              </div>
              <button onClick={closeRouteModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                {icons.x()}
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Route Info Section */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Route Information</h4>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-2">
                      Service Type <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={routeForm.service_type_id}
                      onChange={(e) => setRouteForm({ ...routeForm, service_type_id: e.target.value })}
                      className="glass-select w-full"
                    >
                      <option value="">Select service type</option>
                      {serviceTypes.map((st) => (
                        <option key={st.id} value={st.id}>{st.name} ({st.vat_rate}% VAT)</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Source <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={routeForm.source}
                        onChange={(e) => setRouteForm({ ...routeForm, source: e.target.value })}
                        className="glass-input w-full"
                        placeholder="e.g., Suva"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-2">
                        Destination <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={routeForm.destination}
                        onChange={(e) => setRouteForm({ ...routeForm, destination: e.target.value })}
                        className="glass-input w-full"
                        placeholder="e.g., Levuka"
                      />
                    </div>
                  </div>
                </div>

                {/* Auto-create/update return route checkbox */}
                {routeForm.source.trim() && routeForm.destination.trim() && (() => {
                  const reverseExists = routes.some(
                    (r) =>
                      r.source === routeForm.destination.trim() &&
                      r.destination === routeForm.source.trim() &&
                      String(r.service_type_id) === String(routeForm.service_type_id)
                  );
                  return reverseExists ? (
                    <div className="mt-4">
                      <div className="flex items-center gap-3 p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-xl">
                        {icons.check("w-5 h-5 text-emerald-600 flex-shrink-0")}
                        <div>
                          <span className="text-sm font-medium text-emerald-700">Return route exists</span>
                          <span className="text-xs text-emerald-600 block mt-0.5">
                            <span className="font-semibold">{routeForm.destination} &rarr; {routeForm.source}</span> is already configured
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <label className="flex items-center gap-3 p-3 bg-slate-50/80 border border-slate-200/60 rounded-xl cursor-pointer hover:bg-slate-100/60 transition-all duration-300">
                        <input
                          type="checkbox"
                          checked={routeForm.createReturnRoute}
                          onChange={(e) => setRouteForm({ ...routeForm, createReturnRoute: e.target.checked })}
                          className="w-4.5 h-4.5 rounded border-slate-300 text-violet-600 focus:ring-violet-500/20 cursor-pointer"
                        />
                        <div>
                          <span className="text-sm font-medium text-slate-700">Also create return route</span>
                          <span className="text-xs text-slate-500 block mt-0.5">
                            Auto-creates <span className="font-semibold">{routeForm.destination} &rarr; {routeForm.source}</span> with the same pricing
                          </span>
                        </div>
                      </label>
                    </div>
                  );
                })()}
              </div>

              {/* Divider */}
              <div className="border-t border-slate-100"></div>

              {/* VEP/VIP Info Banner */}
              <div className="bg-blue-50/60 border border-blue-200/60 rounded-xl p-4">
                <div className="flex items-start">
                  {icons.info("w-5 h-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5")}
                  <div className="text-sm text-blue-800">
                    <strong>Pricing Modes:</strong> <strong className="font-semibold">VEP</strong> (VAT Exclusive) - enter base price, VAT is added. <strong className="font-semibold">VIP</strong> (VAT Inclusive) - enter total price, VAT is extracted.
                  </div>
                </div>
              </div>

              {/* Pricing Section - 2x2 grid */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Passenger Type Pricing</h4>
                  <button
                    onClick={() => setShowPriceCalculator(!showPriceCalculator)}
                    className="text-sm text-violet-600 hover:text-violet-700 font-medium flex items-center transition-colors duration-200"
                  >
                    {icons.calculator("w-4 h-4 mr-1")}
                    {showPriceCalculator ? "Hide Calculator" : "Show Calculator"}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {passengerTypes.map((p) => (
                    <div key={p.type} className={`border-l-4 ${p.border} bg-slate-50/50 border border-slate-200/60 rounded-xl overflow-hidden`}>
                      <div className={`${p.headerBg} px-4 py-2.5 border-b ${p.borderLight}`}>
                        <div className="flex items-center justify-between">
                          <h5 className={`text-sm font-semibold uppercase tracking-wide ${p.text}`}>{p.label}</h5>
                          {/* VEP/VIP Toggle - pill buttons */}
                          <div className="bg-white rounded-lg p-0.5 flex border border-slate-200/40">
                            <button
                              onClick={() => setRouteForm({ ...routeForm, [`${p.type}_price_mode`]: "VEP" })}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-300 ${
                                routeForm[`${p.type}_price_mode`] === "VEP"
                                  ? `bg-white shadow-sm ${p.text}`
                                  : "text-slate-400"
                              }`}
                            >
                              VEP
                            </button>
                            <button
                              onClick={() => setRouteForm({ ...routeForm, [`${p.type}_price_mode`]: "VIP" })}
                              className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-300 ${
                                routeForm[`${p.type}_price_mode`] === "VIP"
                                  ? `bg-white shadow-sm ${p.text}`
                                  : "text-slate-400"
                              }`}
                            >
                              VIP
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 space-y-3">
                        {/* Price Input */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            {routeForm[`${p.type}_price_mode`] === "VEP" ? "Base Price (FJ$)" : "Total Price (FJ$)"}
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={routeForm[`${p.type}_price_input`]}
                            onChange={(e) => setRouteForm({ ...routeForm, [`${p.type}_price_input`]: e.target.value })}
                            className="glass-input w-full text-sm"
                            placeholder="0.00"
                          />
                        </div>

                        {/* Breakdown: Base / +VAT / = Total */}
                        {routeForm[`${p.type}_price_input`] && parseFloat(routeForm[`${p.type}_price_input`]) > 0 && (
                          <div className="bg-white rounded-lg p-3 space-y-1.5 border border-slate-200/40">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Base</span>
                              <span className="font-medium text-slate-700">FJ${routeForm[`${p.type}_base_price`].toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">+ VAT</span>
                              <span className="font-medium text-emerald-600">FJ${routeForm[`${p.type}_vat`].toFixed(2)}</span>
                            </div>
                            <div className="border-t border-slate-200/40 pt-1.5">
                              <div className="flex justify-between text-xs">
                                <span className="font-semibold text-slate-700">= Total</span>
                                <span className={`font-bold ${p.text}`}>FJ${routeForm[`${p.type}_total`].toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Live Calculator Panel */}
              {showPriceCalculator && (
                <div className="bg-slate-50/80 border border-slate-200/60 rounded-xl p-5">
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Live Price Summary</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {passengerTypes.map((p) => (
                      <div key={p.type} className={`bg-white border-l-4 ${p.border} border border-slate-200/40 rounded-xl p-3 text-center`}>
                        <div className="text-xs text-slate-500 mb-1">{p.label}</div>
                        <div className={`text-lg font-bold ${p.text}`}>FJ${routeForm[`${p.type}_total`].toFixed(2)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-slate-100 flex justify-end gap-3 z-10">
              <button onClick={closeRouteModal} className="btn-secondary">Cancel</button>
              <button onClick={handleRouteSubmit} className="btn-primary">
                {editingRoute ? "Update Route" : "Create Route"}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ==================== DISCOUNT MODAL ==================== */}
      {showDiscountModal && editingRouteForDiscount && createPortal(
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 " onClick={closeDiscountModal} />
          {/* Modal Content */}
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto animate-scale-in">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 py-4 border-b border-slate-100 flex items-center justify-between z-10">
              <div className="flex items-center">
                <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-amber-700 rounded-xl flex items-center justify-center mr-3 flex-shrink-0 shadow-lg shadow-amber-500/20">
                  {icons.tag("w-5 h-5 text-white")}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Manage Discount Pricing</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {editingRouteForDiscount.source} to {editingRouteForDiscount.destination}
                  </p>
                </div>
              </div>
              <button onClick={closeDiscountModal} className="p-2 hover:bg-slate-100 rounded-xl transition-colors">
                {icons.x()}
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6">
              {/* Enable/Disable Toggle */}
              <div className="bg-amber-50/60 border border-amber-200/60 rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-amber-900">Discount Status</h4>
                    <p className="text-xs text-amber-700 mt-1">
                      {discountForm.discount_enabled ? "Discount pricing is currently active" : "Enable discount pricing for this route"}
                    </p>
                  </div>
                  <button
                    onClick={() => setDiscountForm({ ...discountForm, discount_enabled: !discountForm.discount_enabled })}
                    className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 ${
                      discountForm.discount_enabled ? "bg-amber-500" : "bg-slate-300"
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${
                        discountForm.discount_enabled ? "translate-x-6" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Regular Prices */}
              <div>
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Regular Prices</h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {passengerTypes.map((p) => (
                    <div key={p.type} className={`bg-slate-50/80 border border-slate-200/60 border-l-4 ${p.border} rounded-xl p-3 text-center`}>
                      <div className="text-xs text-slate-500 mb-1">{p.label}</div>
                      <div className={`text-lg font-bold ${p.text}`}>
                        FJ${(parseFloat(editingRouteForDiscount[`${p.type}_price`]) || 0).toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discount Pricing Section */}
              {!!discountForm.discount_enabled && (
                <>
                  <div className="border-t border-slate-100"></div>
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Discount Pricing</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {passengerTypes.map((p) => {
                        const originalPrice = parseFloat(editingRouteForDiscount[`${p.type}_price`]) || 0;
                        const discountTotal = discountForm[`discount_${p.type}_total`] || 0;
                        const savings = originalPrice - discountTotal;

                        return (
                          <div key={p.type} className={`border-l-4 ${p.border} bg-slate-50/50 border border-slate-200/60 rounded-xl overflow-hidden`}>
                            <div className={`${p.headerBg} px-4 py-2.5 border-b ${p.borderLight}`}>
                              <div className="flex items-center justify-between">
                                <h5 className={`text-sm font-semibold uppercase tracking-wide ${p.text}`}>{p.label}</h5>
                                {/* VEP/VIP Toggle */}
                                <div className="bg-white rounded-lg p-0.5 flex border border-slate-200/40">
                                  <button
                                    onClick={() => setDiscountForm({ ...discountForm, [`discount_${p.type}_price_mode`]: "VEP" })}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-300 ${
                                      discountForm[`discount_${p.type}_price_mode`] === "VEP"
                                        ? `bg-white shadow-sm ${p.text}`
                                        : "text-slate-400"
                                    }`}
                                  >
                                    VEP
                                  </button>
                                  <button
                                    onClick={() => setDiscountForm({ ...discountForm, [`discount_${p.type}_price_mode`]: "VIP" })}
                                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all duration-300 ${
                                      discountForm[`discount_${p.type}_price_mode`] === "VIP"
                                        ? `bg-white shadow-sm ${p.text}`
                                        : "text-slate-400"
                                    }`}
                                  >
                                    VIP
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div className="p-4 space-y-3">
                              {/* Price Input */}
                              <div>
                                <label className="block text-xs font-medium text-slate-600 mb-1">
                                  {discountForm[`discount_${p.type}_price_mode`] === "VEP" ? "Discount Base Price (FJ$)" : "Discount Total Price (FJ$)"}
                                </label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={discountForm[`discount_${p.type}_price_input`]}
                                  onChange={(e) => setDiscountForm({ ...discountForm, [`discount_${p.type}_price_input`]: e.target.value })}
                                  className="glass-input w-full text-sm"
                                  placeholder="0.00"
                                />
                              </div>

                              {/* Breakdown */}
                              {discountForm[`discount_${p.type}_price_input`] && parseFloat(discountForm[`discount_${p.type}_price_input`]) > 0 && (
                                <div className="bg-white rounded-lg p-3 space-y-1.5 border border-slate-200/40">
                                  <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Base</span>
                                    <span className="font-medium text-slate-700">FJ${discountForm[`discount_${p.type}_base_price`].toFixed(2)}</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">+ VAT</span>
                                    <span className="font-medium text-emerald-600">FJ${discountForm[`discount_${p.type}_vat`].toFixed(2)}</span>
                                  </div>
                                  <div className="border-t border-slate-200/40 pt-1.5">
                                    <div className="flex justify-between text-xs">
                                      <span className="font-semibold text-slate-700">= Total</span>
                                      <span className={`font-bold ${p.text}`}>FJ${discountTotal.toFixed(2)}</span>
                                    </div>
                                  </div>
                                  {savings > 0 && (
                                    <div className="flex justify-between text-xs pt-1">
                                      <span className="font-semibold text-emerald-700">Savings</span>
                                      <span className="font-bold text-emerald-700">FJ${savings.toFixed(2)}</span>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Savings Summary */}
                  <div className="border-t border-slate-100 pt-5">
                    <div className="bg-emerald-50/60 border border-emerald-200/60 rounded-xl p-5">
                      <h4 className="text-xs font-semibold text-emerald-800 uppercase tracking-wider mb-4">Discount Summary</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {passengerTypes.map((p) => {
                          const originalPrice = parseFloat(editingRouteForDiscount[`${p.type}_price`]) || 0;
                          const discountTotal = discountForm[`discount_${p.type}_total`] || 0;
                          const savings = originalPrice - discountTotal;
                          const savingsPercent = originalPrice > 0 ? ((savings / originalPrice) * 100).toFixed(0) : 0;

                          return (
                            <div key={p.type} className="bg-white border border-emerald-200/60 rounded-xl p-3 text-center">
                              <div className="text-xs text-slate-500 mb-1.5">{p.label}</div>
                              {savings > 0 ? (
                                <>
                                  <div className="inline-flex items-center px-2 py-0.5 bg-emerald-100/80 text-emerald-700 text-sm font-bold rounded-md mb-1">-{savingsPercent}%</div>
                                  <div className="text-xs text-emerald-600">Save FJ${savings.toFixed(2)}</div>
                                </>
                              ) : (
                                <div className="text-xs text-slate-400 py-2">No discount</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white rounded-b-2xl px-6 py-4 border-t border-slate-100 flex justify-end gap-3 z-10">
              <button onClick={closeDiscountModal} className="btn-secondary">Cancel</button>
              <button
                onClick={handleDiscountSubmit}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl hover:from-amber-600 hover:to-amber-700 transition-all duration-300 font-semibold text-sm shadow-lg shadow-amber-500/20"
              >
                {discountForm.discount_enabled ? "Save Discount Pricing" : "Disable Discount"}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
