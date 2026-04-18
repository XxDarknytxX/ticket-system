// src/components/AgentBooking.js
import React, { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useReactToPrint } from "react-to-print";
import { Services, Bookings, PaymentMethods } from "../services/api";
import TicketDocument from "./TicketDocument";

export default function AgentBooking() {
  /* ═══════════════════════ STATE ═══════════════════════ */
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Lookup data
  const [serviceTypes, setServiceTypes] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [vessels, setVessels] = useState([]);

  // Step 1 selections
  const [selectedServiceType, setSelectedServiceType] = useState("");
  const [selectedRoute, setSelectedRoute] = useState(null);
  const [selectedTier, setSelectedTier] = useState<"economy" | "first_class">("economy");
  const [selectedVessel, setSelectedVessel] = useState(null);
  const [selectedReturnVessel, setSelectedReturnVessel] = useState(null);
  const [bookingType, setBookingType] = useState("one_way");
  const [travelDate, setTravelDate] = useState("");
  const [returnDate, setReturnDate] = useState("");
  const [customValidityDays, setCustomValidityDays] = useState("");

  // Multi-destination legs
  const [legs, setLegs] = useState([
    { routeId: "", route: null, vesselId: "", vessel: null, travelDate: "" },
    { routeId: "", route: null, vesselId: "", vessel: null, travelDate: "" },
  ]);

  // Step 2 passengers
  const [passengers, setPassengers] = useState([]);

  // Notes field
  const [notes, setNotes] = useState("");

  // Payment method (set at Step 3 review)
  const [paymentMethodOptions, setPaymentMethodOptions] = useState<any[]>([]);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>("");

  // Passenger modal state
  const [isPassengerModalOpen, setIsPassengerModalOpen] = useState(false);
  const [editingPassengerIndex, setEditingPassengerIndex] = useState(null);
  const [modalFormData, setModalFormData] = useState({
    name: "",
    email: "",
    phone: "",
    gender: "",
    passengerType: "adult",
  });

  // Step 4 booked tickets
  const [bookedTickets, setBookedTickets] = useState([]);
  const [singleTicketToPrint, setSingleTicketToPrint] = useState(null);
  const [deliveryMode, setDeliveryMode] = useState("print"); // "print" | "email_customer" | "email_individual"
  const [emailSending, setEmailSending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [customEmail, setCustomEmail] = useState(""); // selected email or "__manual__"
  const [manualEmail, setManualEmail] = useState("");

  /* ═══════════════════════ REFS ═══════════════════════ */
  const allTicketsRef = useRef(null);
  const singleTicketRef = useRef(null);

  /* ═══════════════════════ PRINT HANDLERS ═══════════════════════ */

  // Print via react-to-print (used for single ticket)
  const handlePrintSingle = useReactToPrint({
    contentRef: singleTicketRef,
    documentTitle: () => `Ticket_${singleTicketToPrint?.ticket_id || "single"}`,
    pageStyle: `@page { size: 187mm 82mm; margin: 0; }`,
  });

  const printSingleTicket = (ticket) => {
    setSingleTicketToPrint(ticket);
    setTimeout(() => handlePrintSingle(), 200);
  };

  // Print ALL tickets using react-to-print with allTicketsRef
  const handlePrintAll = useReactToPrint({
    contentRef: allTicketsRef,
    documentTitle: `Tickets_${travelDate || "booking"}`,
    pageStyle: `
      @page { size: 187mm 82mm; margin: 0; }
      html, body {
        margin: 0 !important; padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .ticket-container {
        display: block;
        width: 187mm;
        height: 82mm;
        overflow: hidden;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
      }
      .ticket-container:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .ticket-page {
        width: 187mm !important;
        height: 82mm !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        overflow: hidden !important;
      }
    `,
  });

  /* ═══════════════════════ DATA FETCHING ═══════════════════════ */
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        const [stData, vData, pmData] = await Promise.all([
          Services.getServiceTypes(),
          Services.getVessels("active"),
          PaymentMethods.getAll().catch(() => ({ paymentMethods: [] })),
        ]);
        setServiceTypes(stData.serviceTypes || []);
        setVessels(vData.vessels || []);
        const activePm = (pmData.paymentMethods || []).filter((p: any) => p.is_active);
        setPaymentMethodOptions(activePm);
        if (activePm.length > 0) setSelectedPaymentMethod(activePm[0].code);
      } catch (err) {
        setError(`Error loading data: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    if (!selectedServiceType) {
      setRoutes([]);
      setSelectedRoute(null);
      return;
    }
    const loadRoutes = async () => {
      try {
        const data = await Services.getRoutes(selectedServiceType);
        setRoutes(data.routes || []);
      } catch (err) {
        setError(`Error loading routes: ${err.message}`);
      }
    };
    loadRoutes();
  }, [selectedServiceType]);

  /* ═══════════════════════ PRICING HELPERS ═══════════════════════ */
  // Resolve tier for a given route — if tier isn't explicitly requested, use selectedTier
  // falling back to economy if the route doesn't actually offer first_class.
  const resolveTier = (route: any, requestedTier?: "economy" | "first_class") => {
    const want = requestedTier || selectedTier || "economy";
    if (want === "first_class" && route?.first_class_enabled) return "first_class";
    return "economy";
  };

  const getEffectivePrice = (route: any, type: string, tierOverride?: "economy" | "first_class") => {
    if (!route) return 0;
    const tier = resolveTier(route, tierOverride);
    if (tier === "first_class") {
      if (route.first_class_discount_enabled) {
        const dp = parseFloat(route[`first_class_discount_${type}_price`]);
        if (dp > 0) return dp;
      }
      return parseFloat(route[`first_class_${type}_price`]) || 0;
    }
    if (route.discount_enabled) {
      const dp = parseFloat(route[`discount_${type}_price`]);
      if (dp > 0) return dp;
    }
    return parseFloat(route[`${type}_price`]) || 0;
  };

  const isPriceDiscounted = (route: any, type: string, tierOverride?: "economy" | "first_class") => {
    if (!route) return false;
    const tier = resolveTier(route, tierOverride);
    if (tier === "first_class") {
      if (!route.first_class_discount_enabled) return false;
      const dp = parseFloat(route[`first_class_discount_${type}_price`]);
      const rp = parseFloat(route[`first_class_${type}_price`]);
      return dp > 0 && dp < rp;
    }
    if (!route.discount_enabled) return false;
    const dp = parseFloat(route[`discount_${type}_price`]);
    const rp = parseFloat(route[`${type}_price`]);
    return dp > 0 && dp < rp;
  };

  const calculateTicketPrice = (route: any, passengerType: string, tierOverride?: "economy" | "first_class") => {
    const totalPrice = getEffectivePrice(route, passengerType, tierOverride);
    const vatRate = parseFloat(route.vat_rate) || 0;
    const basePrice = totalPrice / (1 + vatRate / 100);
    const vatAmount = totalPrice - basePrice;
    return {
      basePrice: parseFloat(basePrice.toFixed(2)),
      vatRate,
      vatAmount: parseFloat(vatAmount.toFixed(2)),
      totalPrice: parseFloat(totalPrice.toFixed(2)),
    };
  };

  const getPassengerPrice = (passenger) => {
    if (!selectedRoute) return { basePrice: 0, vatRate: 0, vatAmount: 0, totalPrice: 0 };
    return calculateTicketPrice(selectedRoute, passenger.passengerType);
  };

  const getReturnPassengerPrice = (passenger) => {
    if (!reverseRoute) return { basePrice: 0, vatRate: 0, vatAmount: 0, totalPrice: 0 };
    return calculateTicketPrice(reverseRoute, passenger.passengerType);
  };

  const getTotals = () => {
    let totalBase = 0;
    let totalVat = 0;
    let totalPrice = 0;
    passengers.forEach((p) => {
      if (bookingType === "multi") {
        legs.forEach((leg) => {
          if (leg.route) {
            const lp = getLegPassengerPrice(leg, p);
            totalBase += lp.basePrice;
            totalVat += lp.vatAmount;
            totalPrice += lp.totalPrice;
          }
        });
      } else {
        const outbound = getPassengerPrice(p);
        totalBase += outbound.basePrice;
        totalVat += outbound.vatAmount;
        totalPrice += outbound.totalPrice;
        if (bookingType === "return" && reverseRoute) {
          const ret = getReturnPassengerPrice(p);
          totalBase += ret.basePrice;
          totalVat += ret.vatAmount;
          totalPrice += ret.totalPrice;
        }
      }
    });
    return {
      base: parseFloat(totalBase.toFixed(2)),
      vat: parseFloat(totalVat.toFixed(2)),
      total: parseFloat(totalPrice.toFixed(2)),
    };
  };

  /* ═══════════════════════ MULTI-DESTINATION HELPERS ═══════════════════════ */
  const addLeg = () => {
    if (legs.length >= 6) return;
    setLegs([...legs, { routeId: "", route: null, vesselId: "", vessel: null, travelDate: "" }]);
  };

  const removeLeg = (index) => {
    if (legs.length <= 2) return;
    setLegs(legs.filter((_, i) => i !== index));
  };

  const updateLeg = (index, field, value) => {
    const updated = [...legs];
    updated[index] = { ...updated[index], [field]: value };
    if (field === "routeId") {
      const route = routes.find((r) => String(r.id) === String(value));
      updated[index].route = route || null;
    }
    if (field === "vesselId") {
      const vessel = vessels.find((v) => String(v.id) === String(value));
      updated[index].vessel = vessel || null;
    }
    setLegs(updated);
  };

  const getLegPassengerPrice = (leg, passenger) => {
    if (!leg.route) return { basePrice: 0, vatRate: 0, vatAmount: 0, totalPrice: 0 };
    return calculateTicketPrice(leg.route, passenger.passengerType);
  };

  const validateLegsConnect = () => {
    for (let i = 0; i < legs.length - 1; i++) {
      if (legs[i].route && legs[i + 1].route) {
        if (legs[i].route.destination !== legs[i + 1].route.source) {
          return `Leg ${i + 1} destination (${legs[i].route.destination}) doesn't connect to Leg ${i + 2} source (${legs[i + 1].route.source})`;
        }
      }
    }
    return null;
  };

  /* ═══════════════════════ UI HELPERS ═══════════════════════ */
  const showMessage = (text) => {
    setMessage(text);
    setTimeout(() => setMessage(""), 5000);
  };

  const showError = (text) => {
    setError(text);
    setTimeout(() => setError(""), 5000);
  };

  const money = (n) => (isFinite(+n) ? Number(n).toFixed(2) : "0.00");

  const passengerTypeAccentBorder = (type) => {
    const map = {
      adult: "border-l-violet-500",
      student: "border-l-emerald-500",
      child: "border-l-amber-500",
      infant: "border-l-violet-500",
    };
    return map[type] || "border-l-slate-400";
  };

  const passengerTypeButtonClass = (type, isActive) => {
    const map = {
      adult: isActive
        ? "bg-violet-600 text-white ring-2 ring-violet-600 ring-offset-1"
        : "bg-white text-slate-600 border border-slate-200/60 hover:bg-white",
      student: isActive
        ? "bg-emerald-600 text-white ring-2 ring-emerald-600 ring-offset-1"
        : "bg-white text-slate-600 border border-slate-200/60 hover:bg-white",
      child: isActive
        ? "bg-amber-500 text-white ring-2 ring-amber-500 ring-offset-1"
        : "bg-white text-slate-600 border border-slate-200/60 hover:bg-white",
      infant: isActive
        ? "bg-violet-600 text-white ring-2 ring-violet-600 ring-offset-1"
        : "bg-white text-slate-600 border border-slate-200/60 hover:bg-white",
    };
    return map[type] || "";
  };

  /* ═══════════════════════ PASSENGER MODAL MANAGEMENT ═══════════════════════ */
  const openPassengerModal = (index = null) => {
    setEditingPassengerIndex(index);
    if (index !== null && passengers[index]) {
      const passenger = passengers[index];
      setModalFormData({
        name: passenger.name,
        email: passenger.email,
        phone: passenger.phone,
        gender: passenger.gender,
        passengerType: passenger.passengerType,
      });
    } else {
      setModalFormData({
        name: "",
        email: "",
        phone: "",
        gender: "",
        passengerType: "adult",
      });
    }
    setIsPassengerModalOpen(true);
  };

  const closePassengerModal = () => {
    setIsPassengerModalOpen(false);
    setEditingPassengerIndex(null);
    setModalFormData({
      name: "",
      email: "",
      phone: "",
      gender: "",
      passengerType: "adult",
    });
  };

  const savePassenger = () => {
    if (!modalFormData.name.trim()) {
      showError("Please enter passenger name");
      return;
    }
    if (!["male", "female"].includes(modalFormData.gender)) {
      showError("Please select passenger gender");
      return;
    }

    if (editingPassengerIndex !== null) {
      const updated = [...passengers];
      updated[editingPassengerIndex] = {
        ...updated[editingPassengerIndex],
        ...modalFormData,
      };
      setPassengers(updated);
    } else {
      setPassengers([
        ...passengers,
        {
          id: Date.now(),
          ...modalFormData,
        },
      ]);
    }

    closePassengerModal();
  };

  const removePassenger = (index) => {
    setPassengers(passengers.filter((_, i) => i !== index));
  };

  /* ═══════════════════════ RESET MODAL FORM ON OPEN ═══════════════════════ */
  useEffect(() => {
    if (isPassengerModalOpen && editingPassengerIndex !== null && passengers[editingPassengerIndex]) {
      const passenger = passengers[editingPassengerIndex];
      setModalFormData({
        name: passenger.name,
        email: passenger.email,
        phone: passenger.phone,
        gender: passenger.gender,
        passengerType: passenger.passengerType,
      });
    }
  }, [isPassengerModalOpen, editingPassengerIndex, passengers]);

  /* ═══════════════════════ REVERSE ROUTE LOOKUP ═══════════════════════ */
  const reverseRoute = bookingType === "return" && selectedRoute
    ? routes.find(
        (r) =>
          r.source === selectedRoute.destination &&
          r.destination === selectedRoute.source
      )
    : null;

  /* ═══════════════════════ VALIDATION ═══════════════════════ */
  const validateStep1 = () => {
    if (bookingType === "multi") {
      if (legs.length < 2) return "Multi-destination requires at least 2 legs";
      for (let i = 0; i < legs.length; i++) {
        if (!legs[i].route) return `Please select a route for Leg ${i + 1}`;
        if (!legs[i].vessel) return `Please select a vessel for Leg ${i + 1}`;
        if (!legs[i].travelDate) return `Please select a travel date for Leg ${i + 1}`;
      }
      for (let i = 0; i < legs.length - 1; i++) {
        if (legs[i].travelDate && legs[i + 1].travelDate && legs[i + 1].travelDate < legs[i].travelDate) {
          return `Leg ${i + 2} date cannot be before Leg ${i + 1} date`;
        }
      }
      const connectErr = validateLegsConnect();
      if (connectErr) return connectErr;
      return null;
    }
    if (!selectedRoute) return "Please select a route";
    if (!selectedVessel) return "Please select a vessel";
    if (!travelDate) return "Please select a travel date";
    if (bookingType === "return" && !returnDate)
      return "Please select a return date";
    if (bookingType === "return" && !selectedReturnVessel)
      return "Please select a vessel for the return trip";
    if (bookingType === "return" && !reverseRoute)
      return `No reverse route found (${selectedRoute.destination} → ${selectedRoute.source}). Please ask an admin to create it first.`;
    return null;
  };

  const validateStep2 = () => {
    if (passengers.length === 0) return "Please add at least one passenger";
    for (let i = 0; i < passengers.length; i++) {
      if (!passengers[i].name.trim())
        return `Please enter a name for Passenger ${i + 1}`;
      if (!["male", "female"].includes(passengers[i].gender))
        return `Please select a gender for Passenger ${i + 1}`;
    }
    return null;
  };

  const goToStep = (target) => {
    if (target < step) {
      setStep(target);
      return;
    }
    if (target > step) {
      if (step === 1) {
        const err = validateStep1();
        if (err) { showError(err); return; }
      }
      if (step === 2 || (step === 1 && target > 2)) {
        if (step >= 2 || target > 2) {
          const err = validateStep2();
          if (err) { showError(err); return; }
        }
      }
      setStep(target);
    }
  };

  const nextStep = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) { showError(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { showError(err); return; }
    }
    setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  /* ═══════════════════════ BOOKING SUBMISSION ═══════════════════════ */
  const confirmBooking = async () => {
    if (paymentMethodOptions.length > 0 && !selectedPaymentMethod) {
      showError("Please select a payment method before confirming");
      return;
    }
    try {
      setLoading(true);
      setError("");

      const results = [];

      if (bookingType === "multi") {
        for (const passenger of passengers) {
          for (const leg of legs) {
            const legTier = (selectedTier === "first_class" && leg.route?.first_class_enabled) ? "first_class" : "economy";
            const payload = {
              customer_name: passenger.name,
              customer_email: passenger.email || "",
              customer_phone: passenger.phone || "",
              customer_gender: passenger.gender || null,
              route_id: leg.route.id,
              vessel_id: leg.vessel.id,
              passenger_type: passenger.passengerType,
              booking_type: "multi",
              tier: legTier,
              travel_date: leg.travelDate,
              notes: notes || undefined,
              payment_method: selectedPaymentMethod || undefined,
            } as any;
            if (customValidityDays) {
              payload.custom_validity_days = parseInt(customValidityDays, 10);
            }
            const response = await Bookings.createBooking(payload);
            results.push(response.booking);
          }
        }
      } else {
        for (const passenger of passengers) {
          const outboundTier = (selectedTier === "first_class" && selectedRoute?.first_class_enabled) ? "first_class" : "economy";
          const basePayload = {
            customer_name: passenger.name,
            customer_email: passenger.email || "",
            customer_phone: passenger.phone || "",
            customer_gender: passenger.gender || null,
            route_id: selectedRoute.id,
            vessel_id: selectedVessel.id,
            passenger_type: passenger.passengerType,
            tier: outboundTier,
            notes: notes || undefined,
            payment_method: selectedPaymentMethod || undefined,
          } as any;
          if (customValidityDays) {
            basePayload.custom_validity_days = parseInt(customValidityDays, 10);
          }

          // Outbound ticket
          const outboundPayload = {
            ...basePayload,
            booking_type: "one_way",
            travel_date: travelDate,
          };
          const outboundResponse = await Bookings.createBooking(outboundPayload);
          results.push(outboundResponse.booking);

          // Return ticket
          if (bookingType === "return" && returnDate && reverseRoute) {
            const returnTier = (selectedTier === "first_class" && reverseRoute?.first_class_enabled) ? "first_class" : "economy";
            const returnPayload = {
              ...basePayload,
              booking_type: "return",
              travel_date: returnDate,
              vessel_id: selectedReturnVessel.id,
              route_id: reverseRoute.id,
              tier: returnTier,
            };
            const returnResponse = await Bookings.createBooking(returnPayload);
            results.push(returnResponse.booking);
          }
        }
      }

      setBookedTickets(results);
      setStep(4);
      showMessage(`All ${results.length} tickets booked successfully!`);
    } catch (err) {
      showError(`Error creating bookings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  /* ═══════════════════════ RESET ═══════════════════════ */
  const resetWizard = () => {
    setStep(1);
    setSelectedServiceType("");
    setSelectedRoute(null);
    setSelectedVessel(null);
    setSelectedReturnVessel(null);
    setBookingType("one_way");
    setTravelDate("");
    setReturnDate("");
    setCustomValidityDays("");
    setNotes("");
    if (paymentMethodOptions.length > 0) setSelectedPaymentMethod(paymentMethodOptions[0].code);
    setLegs([
      { routeId: "", route: null, vesselId: "", vessel: null, travelDate: "" },
      { routeId: "", route: null, vesselId: "", vessel: null, travelDate: "" },
    ]);
    setPassengers([]);
    setBookedTickets([]);
    setSingleTicketToPrint(null);
    setError("");
    setMessage("");
    setIsPassengerModalOpen(false);
    setEditingPassengerIndex(null);
  };

  /* ═══════════════════════ LOADING STATE ═══════════════════════ */
  if (loading && step === 1 && serviceTypes.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <div className="w-10 h-10 border-[3px] border-violet-200 border-t-violet-600 rounded-full animate-spin" />
          <div className="flex flex-col items-center gap-1">
            <span className="text-[14px] font-semibold text-slate-700">Loading Booking</span>
            <span className="text-[12px] text-slate-400">Preparing booking system...</span>
          </div>
        </div>
      </div>
    );
  }

  /* ═══════════════════════ STEP INDICATOR ═══════════════════════ */
  const steps = [
    { num: 1, label: "Route & Travel", icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
      </svg>
    )},
    { num: 2, label: "Passengers", icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    )},
    { num: 3, label: "Review", icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    )},
    { num: 4, label: "Confirmation", icon: (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    )},
  ];

  const StepIndicator = () => (
    <div className="glass-card p-3 sm:p-4 animate-fade-in-up">
      <div className="flex items-center justify-between max-w-2xl mx-auto">
        {steps.map((s, idx) => (
          <div key={s.num} className="flex items-center flex-1 last:flex-initial">
            {/* Step circle + label */}
            <div className="flex flex-col items-center relative">
              <div
                className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 relative z-10 ${
                  step > s.num
                    ? "bg-violet-600 text-white shadow-md shadow-violet-600/25"
                    : step === s.num
                    ? "bg-violet-600 text-white shadow-lg shadow-violet-500/40 ring-4 ring-violet-400/20"
                    : "bg-white  text-slate-400 border-2 border-slate-200/60"
                }`}
              >
                {step > s.num ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  s.icon
                )}
              </div>
              <span
                className={`mt-2.5 text-xs font-medium transition-all duration-300 text-center whitespace-nowrap hidden sm:block ${
                  step > s.num
                    ? "text-violet-600"
                    : step === s.num
                    ? "text-violet-700 font-semibold"
                    : "text-slate-400"
                }`}
              >
                {s.label}
              </span>
            </div>
            {/* Connecting line */}
            {idx < steps.length - 1 && (
              <div className="flex-1 mx-2 sm:mx-4 relative h-0.5 mt-[-18px] sm:mt-[-20px]">
                <div className="absolute inset-0 bg-slate-200/60 rounded-full"></div>
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ease-out ${
                    step > s.num ? "bg-violet-600 w-full" : "bg-slate-200/60 w-0"
                  }`}
                ></div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  /* ═══════════════════════ SEARCHABLE ROUTE SELECT ═══════════════════════ */
  const SearchableRouteSelect = ({ value, onChange, disabled, placeholder, compact }: any) => {
    const [query, setQuery] = useState("");
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });

    const selectedRoute = routes.find((r) => String(r.id) === String(value));

    const filtered = query.trim()
      ? routes.filter((r) => {
          const q = query.toLowerCase();
          return (
            r.source.toLowerCase().includes(q) ||
            r.destination.toLowerCase().includes(q) ||
            `${r.source} ${r.destination}`.toLowerCase().includes(q)
          );
        })
      : routes;

    // Calculate dropdown position when opening
    const updateDropdownPos = useCallback(() => {
      if (inputRef.current) {
        const rect = inputRef.current.getBoundingClientRect();
        setDropdownPos({
          top: rect.bottom + 6,
          left: rect.left,
          width: rect.width,
        });
      }
    }, []);

    // Close on outside click (check both wrapper and portal dropdown)
    useEffect(() => {
      const handleClick = (e) => {
        if (wrapperRef.current && !wrapperRef.current.contains(e.target) &&
            !e.target.closest('[data-route-dropdown]')) {
          setIsOpen(false);
        }
      };
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }, []);

    // Update position on scroll/resize when open
    useEffect(() => {
      if (!isOpen) return;
      updateDropdownPos();
      const handleScrollResize = () => updateDropdownPos();
      window.addEventListener("scroll", handleScrollResize, true);
      window.addEventListener("resize", handleScrollResize);
      return () => {
        window.removeEventListener("scroll", handleScrollResize, true);
        window.removeEventListener("resize", handleScrollResize);
      };
    }, [isOpen, updateDropdownPos]);

    const handleSelect = (route) => {
      onChange(String(route.id));
      setQuery("");
      setIsOpen(false);
    };

    const handleClear = (e) => {
      e.stopPropagation();
      onChange("");
      setQuery("");
    };

    const py = compact ? "py-2" : "py-3";
    const pl = compact ? "pl-3" : "pl-10";

    return (
      <div ref={wrapperRef} className="relative">
        {/* Input */}
        <div className="relative" ref={inputRef}>
          {!compact && (
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4.5 h-4.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          )}
          <input
            type="text"
            value={isOpen ? query : selectedRoute ? `${selectedRoute.source} → ${selectedRoute.destination}` : ""}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!isOpen) setIsOpen(true);
            }}
            onFocus={() => {
              setIsOpen(true);
              setQuery("");
              updateDropdownPos();
            }}
            placeholder={disabled ? "Select service type first" : placeholder || "Search routes..."}
            disabled={disabled}
            className={`w-full ${pl} pr-8 ${py} glass-input disabled:opacity-50 disabled:cursor-not-allowed text-sm`}
            autoComplete="off"
          />
          {/* Right icons */}
          <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-0.5">
            {selectedRoute && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors"
                title="Clear route"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Dropdown - rendered via portal to body to escape all stacking contexts */}
        {isOpen && !disabled && createPortal(
          <div
            data-route-dropdown="true"
            className="bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto"
            style={{
              position: 'fixed',
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              zIndex: 9999,
            }}
          >
            {filtered.length === 0 ? (
              <div className="px-4 py-3 text-sm text-slate-400 text-center">
                No routes match &ldquo;{query}&rdquo;
              </div>
            ) : (
              filtered.map((r) => {
                const isSelected = String(r.id) === String(value);
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => handleSelect(r)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-all duration-200 flex items-center justify-between ${
                      isSelected
                        ? "bg-violet-50/80 text-teal-800 font-medium"
                        : "text-slate-700 hover:bg-slate-50/80"
                    }`}
                  >
                    <span>
                      {r.source} <span className="text-slate-400">&rarr;</span> {r.destination}
                      {!!r.discount_enabled && (
                        <span className="ml-1.5 text-[10px] bg-amber-100/80 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                          Discount
                        </span>
                      )}
                    </span>
                    {isSelected && (
                      <svg className="w-4 h-4 text-violet-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                );
              })
            )}
          </div>,
          document.body
        )}
      </div>
    );
  };

  /* ═══════════════════════ INLINE SVG ICON COMPONENTS ═══════════════════════ */
  const IconShip = () => (
    <svg className="w-4.5 h-4.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 17h1l2-6h12l2 6h1M5 17l-2 4h18l-2-4M12 3v4m-4 0h8" />
    </svg>
  );

  const IconMapPin = () => (
    <svg className="w-4.5 h-4.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );

  const IconCalendar = () => (
    <svg className="w-4.5 h-4.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );

  /* ═══════════════════════ STEP 1: ROUTE & TRAVEL ═══════════════════════ */
  const Step1 = () => (
    <div className="p-4 sm:p-5 animate-fade-in-up">
      <div className="mb-4">
        <div className="flex items-center space-x-3 mb-1">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-400/20 to-violet-600/20 flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-semibold text-slate-900">
              Route & Travel Details
            </h2>
            <p className="text-[12px] text-slate-500">
              Choose your service, route, vessel, and travel dates
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-5">
        {/* Left Column: Form Fields */}
        <div className="space-y-3.5">
          {/* Booking Type - FIRST */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Booking Type <span className="text-rose-500">*</span>
            </label>
            <div className="flex rounded-xl bg-slate-100/60  p-1 border border-slate-200">
              <button type="button" onClick={() => setBookingType("one_way")}
                className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 text-[12px] sm:text-sm font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 whitespace-nowrap ${bookingType === "one_way" ? "bg-white  text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                One-Way
              </button>
              <button type="button" onClick={() => setBookingType("return")}
                className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 text-[12px] sm:text-sm font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 whitespace-nowrap ${bookingType === "return" ? "bg-white  text-violet-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
                Return
              </button>
              <button type="button" onClick={() => setBookingType("multi")}
                className={`flex-1 min-w-0 px-2 sm:px-4 py-2.5 text-[12px] sm:text-sm font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-1.5 whitespace-nowrap ${bookingType === "multi" ? "bg-white  text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                Multi
              </button>
            </div>
          </div>

          {/* Service Type */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700">
              Service Type <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <IconShip />
              </div>
              <select
                value={selectedServiceType}
                onChange={(e) => {
                  setSelectedServiceType(e.target.value);
                  setSelectedRoute(null);
                }}
                className="w-full pl-10 pr-4 glass-select text-sm"
              >
                <option value="">Choose service type...</option>
                {serviceTypes.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>

          {/* Route & Vessel (hidden for multi) */}
          {bookingType !== "multi" && (<>
          <div className="space-y-1.5 animate-fade-in-up delay-150">
            <label className="block text-sm font-medium text-slate-700">
              Route <span className="text-rose-500">*</span>
            </label>
            <SearchableRouteSelect
              value={selectedRoute ? selectedRoute.id : ""}
              onChange={(val) => {
                const route = routes.find((r) => String(r.id) === String(val));
                setSelectedRoute(route || null);
                setSelectedTier("economy"); // reset tier on route change
              }}
              disabled={!selectedServiceType}
              placeholder="Search routes..."
            />
          </div>

          {/* Tier selector — only shown when route has first-class pricing enabled */}
          {selectedRoute?.first_class_enabled && (
            <div className="space-y-1.5 animate-fade-in-up delay-150">
              <label className="block text-sm font-medium text-slate-700">Travel Class</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTier("economy")}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                    selectedTier === "economy"
                      ? "border-violet-500 bg-violet-50 text-violet-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-violet-500" />
                  Economy
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedTier("first_class")}
                  className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 font-semibold text-sm transition-all ${
                    selectedTier === "first_class"
                      ? "border-sky-500 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
                  }`}
                >
                  <span className="w-2 h-2 rounded-full bg-sky-500" />
                  First Class
                </button>
              </div>
            </div>
          )}

          {/* Vessels - side by side for return */}
          <div className={`grid gap-4 ${bookingType === "return" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">
                {bookingType === "return" ? "Outbound Vessel" : "Vessel"} <span className="text-rose-500">*</span>
              </label>
              <select
                value={selectedVessel ? selectedVessel.id : ""}
                onChange={(e) => {
                  const vessel = vessels.find((v) => String(v.id) === String(e.target.value));
                  setSelectedVessel(vessel || null);
                }}
                className="w-full glass-select text-sm"
              >
                <option value="">Choose vessel...</option>
                {vessels.map((v) => (
                  <option key={v.id} value={v.id}>{v.name} ({v.seat_capacity} seats)</option>
                ))}
              </select>
            </div>
            {bookingType === "return" && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Return Vessel <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedReturnVessel ? selectedReturnVessel.id : ""}
                  onChange={(e) => {
                    const vessel = vessels.find((v) => String(v.id) === String(e.target.value));
                    setSelectedReturnVessel(vessel || null);
                  }}
                  className="w-full glass-select text-sm"
                >
                  <option value="">Choose return vessel...</option>
                  {vessels.map((v) => (
                    <option key={v.id} value={v.id}>{v.name} ({v.seat_capacity} seats)</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          </>)}

          {/* ═══ MULTI-DESTINATION LEG BUILDER ═══ */}
          {bookingType === "multi" && (
            <div className="space-y-4 animate-fade-in-up delay-300">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-slate-700">
                  Journey Legs <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={addLeg}
                  disabled={legs.length >= 6}
                  className="text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" />
                  </svg>
                  Add Leg ({legs.length}/6)
                </button>
              </div>

              {/* Visual chain */}
              <div className="flex items-center gap-1 flex-wrap text-xs text-slate-500 glass-card p-3 bg-indigo-50/30">
                {legs.map((leg, i) => (
                  <React.Fragment key={i}>
                    <span className={`font-semibold ${leg.route ? "text-violet-700" : "text-slate-400"}`}>
                      {leg.route ? leg.route.source : "?"}
                    </span>
                    <svg className="w-3 h-3 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                    {i === legs.length - 1 && (
                      <span className={`font-semibold ${leg.route ? "text-emerald-700" : "text-slate-400"}`}>
                        {leg.route ? leg.route.destination : "?"}
                      </span>
                    )}
                  </React.Fragment>
                ))}
              </div>

              {/* Connectivity warning */}
              {validateLegsConnect() && (
                <div className="flex items-center gap-2 p-3 bg-amber-50/80  border border-amber-200/50 rounded-xl">
                  <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-xs text-amber-700">{validateLegsConnect()}</span>
                </div>
              )}

              {/* Leg cards */}
              {legs.map((leg, index) => (
                <div key={index} className="glass-card p-4 space-y-3 relative bg-slate-50/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-indigo-100/80 text-indigo-700 font-bold text-xs flex items-center justify-center">
                        {index + 1}
                      </div>
                      <span className="text-sm font-semibold text-slate-700">Leg {index + 1}</span>
                      {leg.route && (
                        <span className="text-xs text-slate-400">
                          {leg.route.source} &rarr; {leg.route.destination}
                        </span>
                      )}
                    </div>
                    {legs.length > 2 && (
                      <button
                        type="button"
                        onClick={() => removeLeg(index)}
                        className="text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 rounded-lg p-1.5 transition-all duration-200"
                        title="Remove leg"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Route selector */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600">Route</label>
                    <SearchableRouteSelect
                      value={leg.routeId}
                      onChange={(val) => updateLeg(index, "routeId", val)}
                      disabled={!selectedServiceType}
                      placeholder="Search routes..."
                      compact
                    />
                  </div>

                  {/* Vessel selector */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600">Vessel</label>
                    <select
                      value={leg.vesselId}
                      onChange={(e) => updateLeg(index, "vesselId", e.target.value)}
                      className="w-full px-3 py-2 glass-select text-sm"
                    >
                      <option value="">Choose vessel...</option>
                      {vessels.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} ({v.seat_capacity} seats)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Date picker */}
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600">Travel Date</label>
                    <input
                      type="date"
                      value={leg.travelDate}
                      onChange={(e) => updateLeg(index, "travelDate", e.target.value)}
                      className="w-full px-3 py-2 glass-input text-sm"
                      min={index > 0 && legs[index - 1].travelDate
                        ? legs[index - 1].travelDate
                        : new Date().toISOString().split("T")[0]}
                    />
                  </div>
                </div>
              ))}

              {/* Custom Validity Override for multi */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">
                  Custom Validity (days)
                  <span className="text-slate-400 font-normal ml-1">&mdash; optional</span>
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={customValidityDays}
                  onChange={(e) => setCustomValidityDays(e.target.value)}
                  className="w-full glass-input text-sm"
                  placeholder="Default from config (e.g. 7)"
                />
              </div>
            </div>
          )}

          {/* ═══ ONE-WAY / RETURN FIELDS (hidden when multi) ═══ */}
          {bookingType !== "multi" && (<>
          {/* Dates - side by side for return */}
          <div className={`grid gap-4 ${bookingType === "return" ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"}`}>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700">
                Travel Date <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={travelDate}
                onChange={(e) => setTravelDate(e.target.value)}
                className="w-full glass-input text-sm"
                min={new Date().toISOString().split("T")[0]}
              />
            </div>
            {bookingType === "return" && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700">
                  Return Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={returnDate}
                  onChange={(e) => setReturnDate(e.target.value)}
                  className="w-full glass-input text-sm"
                  min={travelDate || new Date().toISOString().split("T")[0]}
                />
              </div>
            )}
          </div>

          {/* Reverse route indicator */}
          {bookingType === "return" && selectedRoute && (
            reverseRoute ? (
              <div className="flex items-center gap-2 p-3 bg-emerald-50/80  border border-emerald-200/50 rounded-xl animate-fade-in-up">
                <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-xs text-emerald-700">
                  Return route found: <span className="font-semibold">{reverseRoute.source} → {reverseRoute.destination}</span>
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-3 bg-rose-50/80  border border-rose-200/50 rounded-xl animate-fade-in-up">
                <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.834-1.964-.834-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
                <span className="text-xs text-rose-700">
                  No reverse route found ({selectedRoute.destination} → {selectedRoute.source}). Ask an admin to create it.
                </span>
              </div>
            )
          )}

          {/* Custom Validity Override */}
          <div className="animate-fade-in-up delay-400">
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              Custom Validity (days)
              <span className="text-slate-400 font-normal ml-1">— optional</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <input
                type="number"
                min="1"
                max="365"
                value={customValidityDays}
                onChange={(e) => setCustomValidityDays(e.target.value)}
                className="w-full pl-10 pr-4 glass-input text-sm"
                placeholder="Default from config (e.g. 7)"
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Leave empty to use the global default validity period</p>
          </div>
          </>)}
        </div>

        {/* Right Column: Route Preview */}
        <div className="animate-fade-in-up delay-200">
          {/* Multi-destination preview */}
          {bookingType === "multi" && legs.some((l) => l.route) ? (
            <div className="glass-card p-5 bg-gradient-to-br from-slate-50/40 to-indigo-50/20 h-full">
              <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center">
                <svg className="w-4 h-4 text-indigo-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Multi-Destination Preview
              </h3>

              {/* Legs summary */}
              {legs.map((leg, index) =>
                leg.route ? (
                  <div key={index} className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-6 h-6 rounded-md bg-indigo-100/80 text-indigo-700 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                        {index + 1}
                      </div>
                      <h4 className="text-xs font-semibold text-slate-700">
                        {leg.route.source} &rarr; {leg.route.destination}
                      </h4>
                      {leg.travelDate && (
                        <span className="text-[10px] text-slate-400 ml-auto">{leg.travelDate}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                      {["adult", "student", "child", "infant"].map((type) => {
                        const effective = getEffectivePrice(leg.route, type);
                        return (
                          <div key={type} className="bg-white  rounded-xl p-2 text-center border border-slate-200">
                            <p className="text-[10px] text-slate-500 capitalize">{type}</p>
                            <p className="font-semibold text-slate-900 text-sm">
                              FJ${effective.toFixed(2)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {leg.vessel && (
                      <p className="text-[10px] text-slate-400 mt-1.5">
                        Vessel: {leg.vessel.name} &middot; Includes {leg.route.vat_rate}% VAT
                        {!!leg.route.discount_enabled && " · Discount active"}
                      </p>
                    )}
                  </div>
                ) : null
              )}
            </div>
          ) : selectedRoute ? (
            <div className="glass-card p-5 bg-gradient-to-br from-slate-50/40 to-violet-50/20 h-full">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                  <svg className="w-4 h-4 text-violet-600 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Route Preview
                </h3>
                <div className="flex items-center gap-1.5">
                  {selectedRoute.first_class_enabled && (
                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full border ${selectedTier === "first_class" ? "bg-sky-100 text-sky-700 border-sky-200" : "bg-violet-100 text-violet-700 border-violet-200"}`}>
                      {selectedTier === "first_class" ? "First Class" : "Economy"}
                    </span>
                  )}
                  {!!selectedRoute.discount_enabled && (
                    <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-1 rounded-full border border-amber-200">
                      Discount Active
                    </span>
                  )}
                </div>
              </div>

              {/* Route visual - clean horizontal layout */}
              <div className="bg-slate-50 rounded-xl p-4 mb-4 border border-slate-100">
                <div className="flex items-center gap-3">
                  {/* Source */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-1">Departure</p>
                    <p className="text-sm font-bold text-slate-900 truncate">{selectedRoute.source}</p>
                  </div>
                  {/* Arrow */}
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center shadow-md shadow-violet-500/20">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                  {/* Destination */}
                  <div className="flex-1 min-w-0 text-right">
                    <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider mb-1">Arrival</p>
                    <p className="text-sm font-bold text-slate-900 truncate">{selectedRoute.destination}</p>
                  </div>
                </div>
              </div>

              {/* Service & Vessel chips */}
              <div className={`grid gap-2 mb-4 ${bookingType === "return" ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2"}`}>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Service</p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">
                    {serviceTypes.find((st) => String(st.id) === String(selectedServiceType))?.name || "--"}
                  </p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                  <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    {bookingType === "return" ? "Outbound Vessel" : "Vessel"}
                  </p>
                  <p className="text-sm font-bold text-slate-800 mt-0.5">
                    {selectedVessel ? `${selectedVessel.name} (${selectedVessel.seat_capacity})` : "--"}
                  </p>
                </div>
                {bookingType === "return" && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Return Vessel</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">
                      {selectedReturnVessel ? `${selectedReturnVessel.name} (${selectedReturnVessel.seat_capacity})` : "--"}
                    </p>
                  </div>
                )}
              </div>

              {/* Pricing grid */}
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <h4 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-wider">
                  {bookingType === "return" && reverseRoute ? "Outbound Prices (VAT Incl.)" : "Prices (VAT Incl.)"}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {[
                    { type: "adult", label: "Adult", color: "teal" },
                    { type: "student", label: "Student", color: "emerald" },
                    { type: "child", label: "Child", color: "amber" },
                    { type: "infant", label: "Infant", color: "violet" },
                  ].map((p) => {
                    const effective = getEffectivePrice(selectedRoute, p.type);
                    const original = parseFloat(selectedRoute[`${p.type}_price`]);
                    const discounted = isPriceDiscounted(selectedRoute, p.type);
                    return (
                      <div key={p.type} className="bg-white rounded-lg p-2.5 text-center border border-slate-100">
                        <p className="text-[10px] text-slate-400 font-semibold uppercase">{p.label}</p>
                        {discounted && (
                          <p className="text-xs text-slate-400 line-through">FJ${original.toFixed(2)}</p>
                        )}
                        <p className="text-base font-bold text-slate-900">FJ${effective.toFixed(2)}</p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10px] text-slate-400 text-center mt-3 pt-2 border-t border-slate-100">
                  Includes {selectedRoute.vat_rate}% VAT{!!selectedRoute.discount_enabled && " · Discount pricing applied"}
                </p>
              </div>

              {/* Return Pricing grid */}
              {bookingType === "return" && reverseRoute && (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 mt-3">
                  <h4 className="text-[10px] font-bold text-slate-400 mb-3 uppercase tracking-wider">
                    Return Prices (VAT Incl.)
                    <span className="ml-2 normal-case tracking-normal font-medium">
                      {reverseRoute.source} → {reverseRoute.destination}
                    </span>
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { type: "adult", label: "Adult" },
                      { type: "student", label: "Student" },
                      { type: "child", label: "Child" },
                      { type: "infant", label: "Infant" },
                    ].map((p) => {
                      const effective = getEffectivePrice(reverseRoute, p.type);
                      const original = parseFloat(reverseRoute[`${p.type}_price`]);
                      const discounted = isPriceDiscounted(reverseRoute, p.type);
                      const outboundPrice = getEffectivePrice(selectedRoute, p.type);
                      const sameAsOutbound = effective === outboundPrice;
                      return (
                        <div key={p.type} className="bg-white rounded-lg p-2.5 text-center border border-slate-100">
                          <p className="text-[10px] text-slate-400 font-semibold uppercase">{p.label}</p>
                          {discounted && (
                            <p className="text-xs text-slate-400 line-through">FJ${original.toFixed(2)}</p>
                          )}
                          <p className="text-base font-bold text-slate-900">FJ${effective.toFixed(2)}</p>
                          {sameAsOutbound ? (
                            <p className="text-[10px] text-emerald-500">Same as outbound</p>
                          ) : (
                            <p className="text-[10px] text-amber-500">Different from outbound</p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-400 text-center mt-3 pt-2 border-t border-slate-100">
                    Includes {reverseRoute.vat_rate}% VAT{!!reverseRoute.discount_enabled && " · Discount pricing applied"}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="hidden lg:flex flex-col items-center justify-center h-full glass-card p-8 border-dashed">
              <svg className="w-16 h-16 text-slate-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
              <p className="text-sm text-slate-400 text-center">Select a service type and route to see preview</p>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="mt-4 flex justify-end animate-fade-in-up delay-400">
        <button
          onClick={nextStep}
          className="w-full sm:w-auto btn-primary flex items-center justify-center gap-2 text-sm"
        >
          Next: Add Passengers
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </button>
      </div>
    </div>
  );

  /* ═══════════════════════ STEP 2: PASSENGERS ═══════════════════════ */
  const Step2 = () => {
    const totals = getTotals();

    return (
      <div className="p-4 sm:p-5 animate-fade-in-up">
        <div className="mb-4">
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-400/20 to-violet-600/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                Passengers
              </h2>
              <p className="text-sm text-slate-500">
                Add and configure passengers for this booking
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left: Passenger list */}
          <div className="flex-1 min-w-0">
            {/* Add Passenger Button */}
            <div className="mb-4 animate-fade-in-up delay-100">
              <button
                onClick={() => openPassengerModal()}
                className="w-full sm:w-auto group px-5 py-3 border-2 border-dashed border-violet-300/60 text-violet-700 font-medium rounded-2xl hover:bg-violet-50/50 hover:border-violet-400/80 transition-all duration-300 flex items-center justify-center text-sm "
              >
                <div className="w-7 h-7 rounded-full bg-violet-100/80 flex items-center justify-center mr-2.5 group-hover:bg-violet-200/80 transition-colors">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                    />
                  </svg>
                </div>
                Add Passenger
              </button>
            </div>

            {/* Empty state */}
            {passengers.length === 0 && (
              <div className="text-center py-14 glass-card bg-gradient-to-b from-slate-50/40 to-white/60 border-dashed animate-fade-in-up delay-200">
                <div className="w-16 h-16 rounded-2xl bg-slate-100/60 flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-8 h-8 text-slate-300"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </div>
                <h3 className="text-sm font-semibold text-slate-700 mb-1">
                  No passengers added yet
                </h3>
                <p className="text-xs text-slate-500">
                  Click "Add Passenger" to start adding travellers
                </p>
              </div>
            )}

            {/* Passenger list cards */}
            {passengers.length > 0 && (
              <div className="space-y-3">
                {passengers.map((passenger, index) => {
                  const outPrice = getPassengerPrice(passenger);
                  const retPrice = bookingType === "return" && reverseRoute ? getReturnPassengerPrice(passenger) : null;
                  const multiTotal = bookingType === "multi"
                    ? legs.reduce((sum, leg) => sum + (leg.route ? getLegPassengerPrice(leg, passenger).totalPrice : 0), 0)
                    : 0;
                  const combinedPrice = bookingType === "multi"
                    ? multiTotal
                    : outPrice.totalPrice + (retPrice?.totalPrice || 0);
                  return (
                    <div
                      key={passenger.id}
                      className="group glass-card-hover overflow-hidden animate-fade-in-up"
                      style={{ animationDelay: `${100 + index * 75}ms` }}
                    >
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        {/* Number badge */}
                        <div className="w-8 h-8 bg-violet-600 rounded-xl flex items-center justify-center text-white font-bold text-xs flex-shrink-0 shadow-sm shadow-violet-500/25">
                          {index + 1}
                        </div>

                        {/* Name & details */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 truncate">
                            {passenger.name || `Passenger ${index + 1}`}
                          </p>
                          <p className="text-xs text-slate-400 mt-0.5">
                            {passenger.gender
                              ? passenger.gender.charAt(0).toUpperCase() +
                                passenger.gender.slice(1)
                              : "--"}
                            {passenger.email && ` · ${passenger.email}`}
                          </p>
                        </div>

                        {/* Type badge */}
                        <span
                          className={`badge badge-${passenger.passengerType} text-[10px] font-bold uppercase flex-shrink-0`}
                        >
                          {passenger.passengerType}
                        </span>

                        {/* Price */}
                        <div className="flex-shrink-0 text-right">
                          <span className="text-sm font-bold text-slate-800 tabular-nums">
                            FJ${money(combinedPrice)}
                          </span>
                          {retPrice && (
                            <p className="text-[10px] text-slate-400 tabular-nums">
                              {money(outPrice.totalPrice)} + {money(retPrice.totalPrice)}
                            </p>
                          )}
                          {bookingType === "multi" && legs.filter((l) => l.route).length > 0 && (
                            <p className="text-[10px] text-indigo-400 tabular-nums">
                              {legs.filter((l) => l.route).length} legs
                            </p>
                          )}
                        </div>

                        {/* Edit button */}
                        <button
                          onClick={() => openPassengerModal(index)}
                          className="text-slate-400 hover:text-violet-600 hover:bg-violet-50/60 rounded-xl p-2 transition-all duration-200 flex-shrink-0 opacity-0 group-hover:opacity-100"
                          title="Edit passenger"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={() => removePassenger(index)}
                          className="text-slate-400 hover:text-rose-600 hover:bg-rose-50/60 rounded-xl p-2 transition-all duration-200 flex-shrink-0 opacity-0 group-hover:opacity-100"
                          title="Remove passenger"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Notes Field */}
            <div className="mt-5 animate-fade-in-up delay-300">
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                Notes <span className="text-slate-400 text-xs">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full glass-input text-sm min-h-[80px] resize-y"
                placeholder="Add any additional notes about this booking..."
                rows={3}
              />
            </div>
          </div>

          {/* Right: Booking Summary Sidebar */}
          {passengers.length > 0 && (
            <div className="lg:w-80 flex-shrink-0 animate-fade-in-up delay-200">
              <div className="lg:sticky lg:top-4">
                <div className="glass-card p-5">
                  <h3 className="text-sm font-semibold text-slate-800 mb-4 flex items-center">
                    <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-400/20 to-violet-600/20 flex items-center justify-center mr-2">
                      <svg
                        className="w-3.5 h-3.5 text-violet-600"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    Booking Summary
                  </h3>

                  {/* Route as visual path */}
                  <div className="bg-white  rounded-xl p-3 mb-4 border border-slate-100/60 space-y-2">
                    {bookingType === "multi" ? (
                      legs.map((leg, li) =>
                        leg.route ? (
                          <div key={li} className={li > 0 ? "pt-2 border-t border-slate-200/60" : ""}>
                            <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wider mb-1">
                              Leg {li + 1}
                            </p>
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0"></div>
                              <div className="flex-1 border-t border-dashed border-slate-300/60"></div>
                              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></div>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-xs font-medium text-slate-700">{leg.route.source}</span>
                              <span className="text-xs font-medium text-slate-700">{leg.route.destination}</span>
                            </div>
                            <div className="flex items-center justify-center mt-0.5">
                              <span className="text-[10px] text-slate-400">{leg.travelDate || "No date set"}</span>
                            </div>
                          </div>
                        ) : null
                      )
                    ) : (
                      <>
                        {/* Outbound */}
                        <div>
                          {bookingType === "return" && (
                            <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wider mb-1">Outbound</p>
                          )}
                          <div className="flex items-center space-x-2">
                            <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0"></div>
                            <div className="flex-1 border-t border-dashed border-slate-300/60"></div>
                            <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></div>
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-xs font-medium text-slate-700">{selectedRoute?.source}</span>
                            <span className="text-xs font-medium text-slate-700">{selectedRoute?.destination}</span>
                          </div>
                          <div className="flex items-center justify-center mt-0.5">
                            <span className="text-[10px] text-slate-400">{travelDate || "No date set"}</span>
                          </div>
                        </div>
                        {/* Return */}
                        {bookingType === "return" && reverseRoute && (
                          <div className="pt-2 border-t border-slate-200/60">
                            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider mb-1">Return</p>
                            <div className="flex items-center space-x-2">
                              <div className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></div>
                              <div className="flex-1 border-t border-dashed border-slate-300/60"></div>
                              <div className="w-2 h-2 rounded-full bg-violet-500 flex-shrink-0"></div>
                            </div>
                            <div className="flex justify-between mt-1">
                              <span className="text-xs font-medium text-slate-700">{reverseRoute.source}</span>
                              <span className="text-xs font-medium text-slate-700">{reverseRoute.destination}</span>
                            </div>
                            <div className="flex items-center justify-center mt-0.5">
                              <span className="text-[10px] text-slate-400">{returnDate || "No date set"}</span>
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Passenger count badges */}
                  <div className="flex flex-wrap gap-1.5 mb-4">
                    {['adult', 'student', 'child', 'infant'].map(type => {
                      const count = passengers.filter(p => p.passengerType === type).length;
                      if (count === 0) return null;
                      return (
                        <span key={type} className={`badge badge-${type} text-[10px] font-bold uppercase`}>
                          {count} {type}{count > 1 ? 's' : ''}
                        </span>
                      );
                    })}
                  </div>

                  {/* Passenger price breakdown */}
                  <div className="border-t border-slate-200/60 pt-3 space-y-0.5">
                    {passengers.map((p, i) => {
                      if (bookingType === "multi") {
                        const totalForPax = legs.reduce((sum, leg) =>
                          sum + (leg.route ? getLegPassengerPrice(leg, p).totalPrice : 0), 0);
                        return (
                          <React.Fragment key={p.id}>
                            <div className="flex justify-between items-center py-1.5 text-sm">
                              <div className="flex items-center space-x-2 min-w-0">
                                <span className="w-5 h-5 bg-violet-100/80 text-violet-700 rounded-md text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                  {i + 1}
                                </span>
                                <span className="text-slate-700 text-xs truncate">
                                  {p.name || `Passenger ${i + 1}`}
                                  <span className="text-slate-400 ml-1">({p.passengerType})</span>
                                </span>
                              </div>
                              <span className="font-medium text-slate-800 text-xs flex-shrink-0 ml-2 tabular-nums">
                                FJ${money(totalForPax)}
                              </span>
                            </div>
                            {legs.map((leg, li) => leg.route && (
                              <div key={li} className="flex justify-between items-center py-1 pl-7 text-xs">
                                <span className="text-indigo-400 truncate">
                                  Leg {li + 1}: {leg.route.source}&rarr;{leg.route.destination}
                                </span>
                                <span className="font-medium text-slate-600 flex-shrink-0 ml-2 tabular-nums">
                                  FJ${money(getLegPassengerPrice(leg, p).totalPrice)}
                                </span>
                              </div>
                            ))}
                            <div className="border-b border-slate-100/60"></div>
                          </React.Fragment>
                        );
                      }
                      const outPrice = getPassengerPrice(p);
                      const retPrice = bookingType === "return" && reverseRoute ? getReturnPassengerPrice(p) : null;
                      return (
                        <React.Fragment key={p.id}>
                          <div className="flex justify-between items-center py-1.5 text-sm">
                            <div className="flex items-center space-x-2 min-w-0">
                              <span className="w-5 h-5 bg-violet-100/80 text-violet-700 rounded-md text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                {i + 1}
                              </span>
                              <span className="text-slate-700 text-xs truncate">
                                {p.name || `Passenger ${i + 1}`}
                                <span className="text-slate-400 ml-1">({p.passengerType})</span>
                              </span>
                            </div>
                            <span className="font-medium text-slate-800 text-xs flex-shrink-0 ml-2 tabular-nums">
                              FJ${money(outPrice.totalPrice)}
                            </span>
                          </div>
                          {retPrice && (
                            <div className="flex justify-between items-center py-1 pl-7 text-xs">
                              <span className="text-slate-400 truncate">
                                ↩ Return
                              </span>
                              <span className="font-medium text-slate-600 flex-shrink-0 ml-2 tabular-nums">
                                FJ${money(retPrice.totalPrice)}
                              </span>
                            </div>
                          )}
                          <div className="border-b border-slate-100/60"></div>
                        </React.Fragment>
                      );
                    })}
                  </div>

                  {/* Totals */}
                  <div className="border-t border-slate-200/60 pt-3 mt-3 space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">Subtotal (Base):</span>
                      <span className="font-medium text-slate-700 tabular-nums">
                        FJ${money(totals.base)}
                      </span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-500">
                        VAT ({selectedRoute?.vat_rate || 0}%):
                      </span>
                      <span className="font-medium text-amber-600 tabular-nums">
                        FJ${money(totals.vat)}
                      </span>
                    </div>
                    <div className="bg-gradient-to-r from-violet-50/80 to-emerald-50/80  -mx-5 px-5 py-3 mt-3 rounded-b-2xl border-t border-violet-100/40">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-semibold text-slate-700">Grand Total</span>
                        <span className="text-lg font-bold text-violet-700 tabular-nums">FJ${money(totals.total)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Passenger Modal - portal to body to escape transform stacking context */}
        {isPassengerModalOpen && createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40 "
              onClick={closePassengerModal}
            ></div>

            {/* Modal */}
            <div className="relative bg-white  rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 transform transition-all animate-fade-in-up">
              {/* Header */}
              <div className="px-6 py-4 border-b border-slate-200/60 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400/20 to-violet-600/20 flex items-center justify-center">
                    <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900">
                    {editingPassengerIndex !== null
                      ? "Edit Passenger"
                      : "Add Passenger"}
                  </h3>
                </div>
                <button
                  onClick={closePassengerModal}
                  className="text-slate-400 hover:text-slate-600 transition-colors rounded-xl hover:bg-slate-100/60 p-1.5"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-5">
                {/* Section: Personal Information */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Personal Information
                  </h4>
                  {/* Name */}
                  <div className="space-y-1.5 mb-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Full Name <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        value={modalFormData.name}
                        onChange={(e) =>
                          setModalFormData({ ...modalFormData, name: e.target.value })
                        }
                        className="w-full pl-10 pr-4 glass-input text-sm"
                        placeholder="Enter full name"
                      />
                    </div>
                  </div>

                  {/* Gender Toggle */}
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700">
                      Gender <span className="text-rose-500">*</span>
                    </label>
                    <div className="flex rounded-xl bg-slate-100/60  p-1 border border-slate-200">
                      <button
                        type="button"
                        onClick={() =>
                          setModalFormData({ ...modalFormData, gender: "male" })
                        }
                        className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                          modalFormData.gender === "male"
                            ? "bg-white  text-violet-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="7" r="4" strokeWidth={1.5} />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.5 21c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" />
                        </svg>
                        Male
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setModalFormData({ ...modalFormData, gender: "female" })
                        }
                        className={`flex-1 px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                          modalFormData.gender === "female"
                            ? "bg-white  text-violet-700 shadow-sm"
                            : "text-slate-500 hover:text-slate-700"
                        }`}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="7" r="4" strokeWidth={1.5} />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5.5 21c0-3.59 2.91-6.5 6.5-6.5s6.5 2.91 6.5 6.5" />
                        </svg>
                        Female
                      </button>
                    </div>
                  </div>
                </div>

                {/* Section: Contact Details */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    Contact Details
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Email */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        Email <span className="text-slate-400 text-xs">(optional)</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                        </div>
                        <input
                          type="email"
                          value={modalFormData.email}
                          onChange={(e) =>
                            setModalFormData({ ...modalFormData, email: e.target.value })
                          }
                          className="w-full pl-10 pr-4 glass-input text-sm"
                          placeholder="email@example.com"
                        />
                      </div>
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700">
                        Phone <span className="text-slate-400 text-xs">(optional)</span>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          </svg>
                        </div>
                        <input
                          type="tel"
                          value={modalFormData.phone}
                          onChange={(e) =>
                            setModalFormData({ ...modalFormData, phone: e.target.value })
                          }
                          className="w-full pl-10 pr-4 glass-input text-sm"
                          placeholder="+679 123 4567"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section: Type & Pricing */}
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 flex items-center">
                    <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    Type & Pricing
                  </h4>
                  {/* Passenger Type */}
                  <div className="space-y-1.5 mb-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Passenger Type
                    </label>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {["adult", "student", "child", "infant"].map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() =>
                            setModalFormData({
                              ...modalFormData,
                              passengerType: type,
                            })
                          }
                          className={`px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-300 capitalize ${passengerTypeButtonClass(
                            type,
                            modalFormData.passengerType === type
                          )}`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Price display */}
                  <div className="bg-gradient-to-r from-violet-50/80 to-emerald-50/80  rounded-xl p-3.5 border border-violet-100/40">
                    <div className="flex justify-between items-center">
                      <span className="text-xs font-medium text-slate-600 flex items-center">
                        <svg className="w-3.5 h-3.5 mr-1.5 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Ticket Price
                        {selectedRoute &&
                          isPriceDiscounted(
                            selectedRoute,
                            modalFormData.passengerType
                          ) && (
                            <span className="ml-2 badge badge-expired text-[10px]">
                              Discounted
                            </span>
                          )}
                      </span>
                      <span className="text-base font-bold text-violet-700 tabular-nums">
                        FJ$
                        {money(
                          calculateTicketPrice(
                            selectedRoute,
                            modalFormData.passengerType
                          ).totalPrice
                        )}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-200/60 flex justify-end gap-3 bg-slate-50/30  rounded-b-2xl">
                <button
                  onClick={closePassengerModal}
                  className="btn-secondary text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={savePassenger}
                  className="btn-primary text-sm"
                >
                  {editingPassengerIndex !== null ? "Update Passenger" : "Add Passenger"}
                </button>
              </div>
            </div>
          </div>
        , document.body)}

        {/* Navigation */}
        <div className="mt-7 flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0 sm:space-x-3 animate-fade-in-up delay-400">
          <button
            onClick={prevStep}
            className="w-full sm:w-auto btn-secondary flex items-center justify-center gap-2 text-sm order-2 sm:order-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back
          </button>
          <button
            onClick={nextStep}
            className="w-full sm:w-auto btn-primary flex items-center justify-center gap-2 text-sm order-1 sm:order-2"
          >
            Next: Review Booking
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </button>
        </div>
      </div>
    );
  };

  /* ═══════════════════════ STEP 3: REVIEW ═══════════════════════ */
  const Step3 = () => {
    const totals = getTotals();

    return (
      <div className="p-4 sm:p-5 animate-fade-in-up">
        <div className="mb-4">
          <div className="flex items-center space-x-3 mb-1">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-400/20 to-violet-600/20 flex items-center justify-center">
              <svg className="w-4 h-4 text-violet-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-semibold text-slate-900">
                Review Booking
              </h2>
              <p className="text-sm text-slate-500">
                Please review all details before confirming
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          {/* Route & Travel Info */}
          <div className="glass-card overflow-hidden animate-fade-in-up delay-100">
            <div className="px-5 py-3.5 border-b border-slate-200/40 bg-white  flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                <svg className="w-4 h-4 text-violet-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Route & Travel Details
              </h3>
              <button
                onClick={() => goToStep(1)}
                className="btn-ghost text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 px-2.5 py-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </div>
            <div className="p-5">
              {bookingType === "multi" ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-slate-500">Booking Type:</span>
                    <span className="badge badge-completed text-xs capitalize">Multi-destination</span>
                    <span className="text-xs text-slate-400 ml-auto">
                      {serviceTypes.find((st) => String(st.id) === String(selectedServiceType))?.name || "--"}
                    </span>
                  </div>
                  {legs.map((leg, index) => (
                    <div key={index} className="flex items-start space-x-3 bg-white  rounded-xl p-3 border border-slate-200">
                      <div className="w-8 h-8 rounded-xl bg-indigo-100/80 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-indigo-700">{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs text-indigo-500 block">Leg {index + 1}</span>
                        <span className="font-medium text-slate-800 text-sm">
                          {leg.route?.source} &rarr; {leg.route?.destination}
                        </span>
                        <div className="flex gap-3 mt-1 text-xs text-slate-500">
                          <span>{leg.vessel?.name || "--"}</span>
                          <span>&middot;</span>
                          <span>{leg.travelDate || "--"}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  {customValidityDays && (
                    <div className="flex items-center gap-2 text-xs text-slate-500 pt-2 border-t border-slate-100/60">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Custom Validity: <span className="font-medium text-slate-700">{customValidityDays} days</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <IconMapPin />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">
                        {bookingType === "return" ? "Outbound Route" : "Route"}
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedRoute?.source} → {selectedRoute?.destination}
                      </span>
                    </div>
                  </div>
                  {bookingType === "return" && reverseRoute && (
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <IconMapPin />
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Return Route</span>
                        <span className="font-medium text-slate-800">
                          {reverseRoute.source} → {reverseRoute.destination}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <IconShip />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Service</span>
                      <span className="font-medium text-slate-800">
                        {serviceTypes.find(
                          (st) => String(st.id) === String(selectedServiceType)
                        )?.name || "--"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">
                        {bookingType === "return" ? "Outbound Vessel" : "Vessel"}
                      </span>
                      <span className="font-medium text-slate-800">
                        {selectedVessel?.name || "--"}
                      </span>
                    </div>
                  </div>
                  {bookingType === "return" && selectedReturnVessel && (
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Return Vessel</span>
                        <span className="font-medium text-slate-800">
                          {selectedReturnVessel.name}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                      </svg>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Booking Type</span>
                      <span className="font-medium text-slate-800 capitalize">
                        {bookingType.replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                      <IconCalendar />
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Travel Date</span>
                      <span className="font-medium text-slate-800">{travelDate}</span>
                    </div>
                  </div>
                  {bookingType === "return" && returnDate && (
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <IconCalendar />
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Return Date</span>
                        <span className="font-medium text-slate-800">{returnDate}</span>
                      </div>
                    </div>
                  )}
                  {customValidityDays && (
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 rounded-xl bg-white  border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 block">Custom Validity</span>
                        <span className="font-medium text-slate-800">{customValidityDays} days</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Notes (if provided) */}
          {notes && (
            <div className="glass-card overflow-hidden animate-fade-in-up delay-150">
              <div className="px-5 py-3.5 border-b border-slate-200/40 bg-white ">
                <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                  <svg className="w-4 h-4 text-violet-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Notes
                </h3>
              </div>
              <div className="p-5">
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{notes}</p>
              </div>
            </div>
          )}

          {/* Passengers */}
          <div className="glass-card overflow-hidden animate-fade-in-up delay-200">
            <div className="px-5 py-3.5 border-b border-slate-200/40 bg-white  flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                <svg className="w-4 h-4 text-violet-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Passengers
                <span className="ml-2 badge badge-boarded text-xs font-bold">{passengers.length}</span>
              </h3>
              <button
                onClick={() => goToStep(2)}
                className="btn-ghost text-xs text-violet-600 hover:text-violet-700 font-medium flex items-center gap-1 px-2.5 py-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit
              </button>
            </div>
            <div className="p-5 space-y-2.5">
              {passengers.map((p, i) => {
                const outPrice = getPassengerPrice(p);
                const retPrice = bookingType === "return" && reverseRoute ? getReturnPassengerPrice(p) : null;
                const multiPaxTotal = bookingType === "multi"
                  ? legs.reduce((sum, leg) => sum + (leg.route ? getLegPassengerPrice(leg, p).totalPrice : 0), 0)
                  : 0;
                const combinedTotal = bookingType === "multi"
                  ? multiPaxTotal
                  : outPrice.totalPrice + (retPrice?.totalPrice || 0);
                return (
                  <div
                    key={p.id}
                    className={`bg-white  p-3.5 rounded-xl border border-slate-200 border-l-4 ${passengerTypeAccentBorder(p.passengerType)} hover:shadow-sm transition-all duration-300`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-semibold text-slate-800">
                            {p.name}
                          </span>
                          <span
                            className={`badge badge-${p.passengerType} text-[10px] font-bold uppercase`}
                          >
                            {p.passengerType}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          {p.gender
                            ? p.gender.charAt(0).toUpperCase() + p.gender.slice(1)
                            : "--"}
                          {p.email && ` · ${p.email}`}
                          {p.phone && ` · ${p.phone}`}
                        </p>
                      </div>
                      <div className="text-right">
                        {bookingType === "multi" ? (
                          <>
                            <span className="text-sm font-bold text-slate-800 tabular-nums">
                              FJ${money(combinedTotal)}
                            </span>
                            <p className="text-[10px] text-indigo-400 mt-0.5">
                              {legs.filter((l) => l.route).length} legs
                            </p>
                          </>
                        ) : retPrice ? (
                          <>
                            <span className="text-sm font-bold text-slate-800 tabular-nums">
                              FJ${money(combinedTotal)}
                            </span>
                            <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                              Out FJ${money(outPrice.totalPrice)} + Ret FJ${money(retPrice.totalPrice)}
                            </p>
                          </>
                        ) : (
                          <span className="text-sm font-bold text-slate-800 tabular-nums">
                            FJ${money(outPrice.totalPrice)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Pricing Breakdown */}
          <div className="glass-card overflow-hidden animate-fade-in-up delay-300">
            <div className="px-5 py-3.5 border-b border-slate-200/40 bg-white ">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                <svg className="w-4 h-4 text-violet-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Pricing Breakdown
              </h3>
            </div>
            <div className="p-5">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200/40">
                    <th className="text-left py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Passenger
                    </th>
                    <th className="text-right py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Base
                    </th>
                    <th className="text-right py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      VAT
                    </th>
                    <th className="text-right py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {passengers.map((p, i) => {
                    if (bookingType === "multi") {
                      return (
                        <React.Fragment key={p.id}>
                          {legs.map((leg, li) => {
                            if (!leg.route) return null;
                            const legPrice = getLegPassengerPrice(leg, p);
                            return (
                              <tr key={`${p.id}-${li}`} className="border-b border-slate-100/40">
                                <td className="py-3 text-slate-700">
                                  {p.name}
                                  <span className="text-slate-400 ml-1.5 text-xs">({p.passengerType})</span>
                                  <span className="text-[10px] text-indigo-600 ml-1.5 font-medium">LEG {li + 1}</span>
                                </td>
                                <td className="py-3 text-right text-slate-600 tabular-nums">
                                  FJ${money(legPrice.basePrice)}
                                </td>
                                <td className="py-3 text-right text-amber-600 tabular-nums">
                                  FJ${money(legPrice.vatAmount)}
                                </td>
                                <td className="py-3 text-right font-medium text-slate-800 tabular-nums">
                                  FJ${money(legPrice.totalPrice)}
                                </td>
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    }
                    const outPrice = getPassengerPrice(p);
                    const retPrice = bookingType === "return" && reverseRoute ? getReturnPassengerPrice(p) : null;
                    return (
                      <React.Fragment key={p.id}>
                        <tr className={`border-b border-slate-100/40 ${i % 2 === 1 ? 'bg-white' : ''}`}>
                          <td className="py-3 text-slate-700">
                            {p.name}
                            <span className="text-slate-400 ml-1.5 text-xs">
                              ({p.passengerType})
                            </span>
                            {retPrice && (
                              <span className="text-[10px] text-violet-600 ml-1.5 font-medium">OUT</span>
                            )}
                          </td>
                          <td className="py-3 text-right text-slate-600 tabular-nums">
                            FJ${money(outPrice.basePrice)}
                          </td>
                          <td className="py-3 text-right text-amber-600 tabular-nums">
                            FJ${money(outPrice.vatAmount)}
                          </td>
                          <td className="py-3 text-right font-medium text-slate-800 tabular-nums">
                            FJ${money(outPrice.totalPrice)}
                          </td>
                        </tr>
                        {retPrice && (
                          <tr className={`border-b border-slate-100/40 ${i % 2 === 1 ? 'bg-white' : ''}`}>
                            <td className="py-3 text-slate-500 pl-4">
                              ↩ {p.name}
                              <span className="text-slate-400 ml-1.5 text-xs">
                                ({p.passengerType})
                              </span>
                              <span className="text-[10px] text-amber-600 ml-1.5 font-medium">RET</span>
                            </td>
                            <td className="py-3 text-right text-slate-600 tabular-nums">
                              FJ${money(retPrice.basePrice)}
                            </td>
                            <td className="py-3 text-right text-amber-600 tabular-nums">
                              FJ${money(retPrice.vatAmount)}
                            </td>
                            <td className="py-3 text-right font-medium text-slate-800 tabular-nums">
                              FJ${money(retPrice.totalPrice)}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200/60">
                    <td className="py-3 font-semibold text-slate-800">
                      Subtotal
                    </td>
                    <td className="py-3 text-right font-medium text-slate-700 tabular-nums">
                      FJ${money(totals.base)}
                    </td>
                    <td className="py-3 text-right font-medium text-amber-600 tabular-nums">
                      FJ${money(totals.vat)}
                    </td>
                    <td className="py-3 text-right font-bold text-slate-900 tabular-nums">
                      FJ${money(totals.total)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Payment Method */}
          <div className="glass-card overflow-hidden animate-fade-in-up delay-350">
            <div className="px-5 py-3.5 border-b border-slate-200/40 bg-white">
              <h3 className="text-sm font-semibold text-slate-800 flex items-center">
                <svg className="w-4 h-4 text-violet-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Payment Method
              </h3>
            </div>
            <div className="p-5">
              {paymentMethodOptions.length === 0 ? (
                <p className="text-[12px] text-slate-500 italic">
                  No payment methods configured. An admin can add them in Configuration → Settings.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {paymentMethodOptions.map((pm) => {
                    const active = selectedPaymentMethod === pm.code;
                    return (
                      <button
                        key={pm.id}
                        type="button"
                        onClick={() => setSelectedPaymentMethod(pm.code)}
                        className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-medium transition-all border ${
                          active
                            ? "bg-violet-50 text-violet-700 border-violet-300 shadow-sm"
                            : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={active ? "M5 13l4 4L19 7" : "M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2"} />
                        </svg>
                        {pm.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Grand Total */}
          <div className="glass-card bg-gradient-to-r from-violet-50/60 to-emerald-50/60 p-5 animate-fade-in-up delay-400">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-sm font-semibold text-slate-700">
                  Total Payment
                </span>
                <span className="ml-2 badge badge-confirmed text-xs font-bold">
                  {bookingType === "multi"
                    ? `${passengers.length * legs.filter((l) => l.route).length} tickets (${passengers.length} pax × ${legs.filter((l) => l.route).length} legs)`
                    : bookingType === "return" && reverseRoute
                    ? `${passengers.length * 2} tickets (${passengers.length} × 2)`
                    : `${passengers.length} ticket${passengers.length > 1 ? "s" : ""}`
                  }
                </span>
              </div>
              <span className="text-2xl font-bold text-violet-700 tabular-nums">
                FJ${money(totals.total)}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="mt-7 flex flex-col sm:flex-row justify-between space-y-2 sm:space-y-0 sm:space-x-3 animate-fade-in-up delay-500">
          <button
            onClick={prevStep}
            className="w-full sm:w-auto btn-secondary flex items-center justify-center gap-2 text-sm order-2 sm:order-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 17l-5-5m0 0l5-5m-5 5h12" />
            </svg>
            Back
          </button>
          <button
            onClick={confirmBooking}
            disabled={loading}
            className="w-full sm:w-auto btn-primary flex items-center justify-center gap-2 text-sm order-1 sm:order-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {(() => {
                  const ticketCount = bookingType === "multi"
                    ? passengers.length * legs.filter((l) => l.route).length
                    : bookingType === "return" && reverseRoute
                    ? passengers.length * 2
                    : passengers.length;
                  return `Confirm & Book ${ticketCount} Ticket${ticketCount > 1 ? "s" : ""}`;
                })()}
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  /* ═══════════════════════ STEP 4: CONFIRMATION ═══════════════════════ */
  const Step4 = () => (
    <div className="p-5 sm:p-7 animate-fade-in-up">
      {/* Success Banner */}
      <div className="glass-card bg-gradient-to-r from-emerald-50/60 to-violet-50/60 p-5 sm:p-6 mb-7 animate-fade-in-up">
        <div className="flex items-center">
          <div className="w-14 h-14 bg-emerald-100/80 rounded-2xl flex items-center justify-center flex-shrink-0 mr-5 ring-4 ring-emerald-500/10">
            <svg
              className="w-7 h-7 text-emerald-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              style={{ strokeDasharray: 100, strokeDashoffset: 0 }}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-800">
              All {bookedTickets.length} ticket
              {bookedTickets.length > 1 ? "s" : ""} booked successfully!
            </h3>
            <p className="text-sm text-emerald-700 mt-1">
              Tickets are ready for printing below.
            </p>
          </div>
        </div>
      </div>

      {/* Delivery Options */}
      <div className="card p-5 mb-6 animate-fade-in-up delay-100">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-[0.08em] mb-3">Ticket Delivery</p>
        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { id: "print", label: "Print Only", icon: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" },
            { id: "email_customer", label: "Email to Customer", icon: "M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" },
            { id: "email_individual", label: "Email Individually", icon: "M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" },
          ].map(opt => (
            <button
              key={opt.id}
              onClick={() => { setDeliveryMode(opt.id); setEmailSent(false); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[12px] font-medium transition-all border ${
                deliveryMode === opt.id
                  ? "bg-violet-50 text-violet-700 border-violet-300"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={opt.icon} />
              </svg>
              {opt.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {deliveryMode === "print" && (
            <button onClick={handlePrintAll} className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-5 py-2.5 text-[13px] flex items-center gap-2 transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              Print All Tickets
            </button>
          )}

          {deliveryMode === "email_customer" && (() => {
            const ticketEmails = [...new Set(bookedTickets.map((t: any) => t.customer_email).filter(Boolean))] as string[];
            const isManual = customEmail === "__manual__";
            const resolvedEmail = isManual ? manualEmail : (customEmail || ticketEmails[0] || "");

            return (
              <div className="flex flex-col gap-3 flex-1">
                {/* Email chips */}
                <div className="flex flex-wrap gap-1.5">
                  {ticketEmails.map((email) => (
                    <button
                      key={email}
                      onClick={() => { setCustomEmail(email); setEmailSent(false); }}
                      className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${
                        !isManual && (customEmail === email || (!customEmail && email === ticketEmails[0]))
                          ? "bg-violet-50 text-violet-700 border-violet-300"
                          : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      {email}
                    </button>
                  ))}
                  <button
                    onClick={() => { setCustomEmail("__manual__"); setManualEmail(""); setEmailSent(false); }}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-medium border transition-all ${
                      isManual ? "bg-violet-50 text-violet-700 border-violet-300" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    + Other email
                  </button>
                </div>

                {/* Manual input */}
                {isManual && (
                  <input
                    type="email"
                    autoFocus
                    value={manualEmail}
                    onChange={(e) => { setManualEmail(e.target.value); setEmailSent(false); }}
                    placeholder="Enter email address"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-[13px] text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500/15 focus:border-violet-400 transition-all"
                  />
                )}

                {/* Send */}
                <button
                  onClick={async () => {
                    if (!resolvedEmail) { showMessage("Please select or enter an email address."); return; }
                    setEmailSending(true);
                    try {
                      const ticketIds = bookedTickets.map((t: any) => t.ticket_id);
                      await Bookings.emailTickets(ticketIds, resolvedEmail);
                      setEmailSent(true);
                      showMessage(`Tickets emailed to ${resolvedEmail}`);
                    } catch (e: any) { showMessage(`Error: ${e.message}`); }
                    finally { setEmailSending(false); }
                  }}
                  disabled={emailSending || emailSent || !resolvedEmail}
                  className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-5 py-2.5 text-[13px] flex items-center gap-2 transition-colors disabled:opacity-50 w-fit"
                >
                  {emailSending ? (
                    <><div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" /> Sending...</>
                  ) : emailSent ? (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Sent!</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Send All Tickets</>
                  )}
                </button>
              </div>
            );
          })()}

          {deliveryMode === "email_individual" && (
            <button
              onClick={async () => {
                setEmailSending(true);
                try {
                  const ticketIds = bookedTickets.map((t: any) => t.ticket_id);
                  await Bookings.emailTickets(ticketIds);
                  setEmailSent(true);
                  showMessage("Tickets emailed to individual passengers");
                } catch (e: any) { showMessage(`Error: ${e.message}`); }
                finally { setEmailSending(false); }
              }}
              disabled={emailSending || emailSent}
              className="bg-slate-900 hover:bg-slate-800 text-white font-medium rounded-full px-5 py-2.5 text-[13px] flex items-center gap-2 transition-colors disabled:opacity-50"
            >
              {emailSending ? (
                <><div className="w-4 h-4 border-2 border-slate-400 border-t-white rounded-full animate-spin" /> Sending...</>
              ) : emailSent ? (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg> Sent!</>
              ) : (
                <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg> Email Each Passenger</>
              )}
            </button>
          )}

          <button onClick={resetWizard} className="px-4 py-2.5 text-[13px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors">
            New Booking
          </button>
        </div>
      </div>

      {/* Hidden print container - all tickets */}
      <div
        ref={allTicketsRef}
        data-print-root="true"
        className="no-print"
        style={{
          position: "absolute",
          left: "-10000px",
          visibility: "hidden",
          width: "187mm",
        }}
      >
        {bookedTickets.map((ticket) => (
          <div
            key={ticket.id}
            className="ticket-container"
            style={{
              width: '187mm',
              height: '82mm',
              overflow: 'hidden',
              pageBreakAfter: 'always',
            }}
          >
            <TicketDocument booking={ticket} />
          </div>
        ))}
      </div>

      {/* Hidden print container - single ticket (portal to body for window.print) */}
      {singleTicketToPrint && createPortal(
        <div
          ref={singleTicketRef}
          data-print-root="true"
          style={{
            position: "absolute",
            left: "-10000px",
            visibility: "hidden",
            width: "187mm",
          }}
        >
          <div className="ticket-container">
            <TicketDocument booking={singleTicketToPrint} />
          </div>
        </div>,
        document.body
      )}

      {/* Visible ticket cards */}
      <div className="space-y-4">
        {bookedTickets.map((ticket, index) => (
          <div
            key={ticket.id}
            className="group glass-card-hover overflow-hidden animate-fade-in-up"
            style={{ animationDelay: `${200 + index * 100}ms` }}
          >
            <div className="bg-gradient-to-r from-white/40 to-white/20  px-5 py-3.5 border-b border-slate-200/40 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-400/20 to-violet-600/20 flex items-center justify-center text-violet-700 font-bold text-xs">
                  {index + 1}
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-slate-800">
                    {ticket.customer_name}
                  </h4>
                  <p className="text-xs text-slate-500 font-mono">
                    {ticket.ticket_id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => printSingleTicket(ticket)}
                className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
              >
                <svg
                  className="w-3.5 h-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                Print Ticket
              </button>
            </div>
            <div className="p-4 sm:p-5">
              <TicketDocument booking={ticket} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  /* ═══════════════════════ MAIN RENDER ═══════════════════════ */
  return (
    <div className="space-y-3 sm:space-y-4 p-3 sm:p-5">
      {/* Error Message */}
      {error && (
        <div className="glass-card p-3.5 sm:p-4 bg-rose-50/60 border-rose-200/50 text-rose-700 animate-fade-in-up">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-xl bg-rose-100/80 flex items-center justify-center mr-3 flex-shrink-0">
              <svg className="w-4 h-4 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <span className="font-medium text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Success Message */}
      {message && !error && (
        <div className="glass-card p-3.5 sm:p-4 bg-emerald-50/60 border-emerald-200/50 text-emerald-700 animate-fade-in-up">
          <div className="flex items-center">
            <div className="w-8 h-8 rounded-xl bg-emerald-100/80 flex items-center justify-center mr-3 flex-shrink-0">
              <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <span className="font-medium text-sm">{message}</span>
          </div>
        </div>
      )}

      {/* Step Indicator */}
      {StepIndicator()}

      {/* Step Content */}
      <div className="glass-card">
        {step === 1 && Step1()}
        {step === 2 && Step2()}
        {step === 3 && Step3()}
        {step === 4 && Step4()}
      </div>
    </div>
  );
}
