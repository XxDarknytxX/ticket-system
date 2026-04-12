// src/services/api.ts
const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || "http://localhost:5000/api";

class ApiClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  getAuthHeader() {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async request(method, endpoint, data = null) {
    const url = `${this.baseURL}${endpoint}`;
    const config = {
      method,
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeader(),
      },
    };

    if (data) {
      config.body = JSON.stringify(data);
    }

    const response = await fetch(url, config);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "An error occurred");
    }

    return result;
  }

  get(endpoint) {
    return this.request("GET", endpoint);
  }

  post(endpoint, data) {
    return this.request("POST", endpoint, data);
  }

  put(endpoint, data) {
    return this.request("PUT", endpoint, data);
  }

  delete(endpoint) {
    return this.request("DELETE", endpoint);
  }
}

const api = new ApiClient(API_BASE_URL);

export const Auth = {
  register: (userData) => api.post("/register", userData),
  login: (email, password) => api.post("/login", { email, password }),
  me: () => api.get("/me"),
  dashboard: () => api.get("/dashboard/stats"),

  // User Management (Admin only)
  getUsers: () => api.get("/users"),
  getUserById: (id) => api.get(`/users/${id}`),
  createUser: (userData) => api.post("/users", userData),
  updateUser: (id, userData) => api.put(`/users/${id}`, userData),
  deleteUser: (id) => api.delete(`/users/${id}`),

  // User Actions
  sendOnboarding: (id) => api.post(`/users/${id}/send-onboarding`),
  resetPassword: (id) => api.post(`/users/${id}/reset-password`),

  // Teams
  getTeams: () => api.get("/teams"),
  createTeam: (data) => api.post("/teams", data),
  updateTeam: (id, data) => api.put(`/teams/${id}`, data),
  deleteTeam: (id) => api.delete(`/teams/${id}`),
  assignUserToTeam: (data) => api.post("/teams/assign", data),
};

export const Services = {
  // Service Types
  getServiceTypes: () => api.get("/service-types"),
  createServiceType: (serviceType) => api.post("/service-types", serviceType),
  updateServiceType: (id, serviceType) => api.put(`/service-types/${id}`, serviceType),

  // Vessels
  getVessels: () => api.get("/vessels"),
  createVessel: (vessel) => api.post("/vessels", vessel),
  updateVessel: (id, vessel) => api.put(`/vessels/${id}`, vessel),
  deleteVessel: (id) => api.delete(`/vessels/${id}`),

  // Routes
  getRoutes: (serviceTypeId) => {
    const endpoint = serviceTypeId ? `/routes?service_type_id=${serviceTypeId}` : "/routes";
    return api.get(endpoint);
  },
  createRoute: (route) => api.post("/routes", route),
  updateRoute: (id, route) => api.put(`/routes/${id}`, route),
  deleteRoute: (id) => api.delete(`/routes/${id}`),

  // Discount Pricing
  updateRouteDiscount: (id, discountData) => api.put(`/routes/${id}/discount`, discountData),
};

export const Bookings = {
  getBookings: () => api.get("/bookings"),
  getBookingByTicketId: (ticketId) => api.get(`/bookings/${ticketId}`),
  searchBookings: (params) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== "" && v != null) query.append(k, v);
    });
    return api.get(`/bookings/search?${query.toString()}`);
  },
  getSalesReport: (period, teamId, dateFrom?, dateTo?, paymentMethod?, agentId?) => {
    const params = new URLSearchParams();
    params.append("period", period || "all");
    if (teamId !== null && teamId !== undefined) params.append("team_id", teamId);
    if (dateFrom) params.append("date_from", dateFrom);
    if (dateTo) params.append("date_to", dateTo);
    if (paymentMethod) params.append("payment_method", paymentMethod);
    if (agentId !== null && agentId !== undefined) params.append("agent_id", agentId);
    return api.get(`/bookings/sales-report?${params.toString()}`);
  },
  getValidationReport: () => api.get("/bookings/validation-report"),
  createBooking: (booking) => api.post("/bookings", booking),
  emailTickets: (ticket_ids, email) => api.post("/bookings/email-tickets", { ticket_ids, email }),
  updateBookingStatus: (ticketId, status) => api.put(`/bookings/${ticketId}/status`, { status }),
  getReports: () => api.get("/bookings/reports"),
};

export const Scanning = {
  verifyTicket: (ticketId) => api.get(`/tickets/${ticketId}/verify`),
  boardPassenger: (ticketId) => api.post(`/tickets/${ticketId}/board`),
  getScanHistory: () => api.get("/scans/history"),
  getScanStats: () => api.get("/scans/stats"),
};

export const Settings = {
  getSettings: () => api.get("/settings"),
  getPublicSettings: () => api.get("/settings/public"),
  updateSetting: (key, value) => api.put(`/settings/${key}`, { value }),
};

export const PaymentMethods = {
  getAll: () => api.get("/payment-methods"),
  create: (data) => api.post("/payment-methods", data),
  update: (id, data) => api.put(`/payment-methods/${id}`, data),
  delete: (id) => api.delete(`/payment-methods/${id}`),
};

export const Permissions = {
  getAll: () => api.get("/permissions"),
  getMine: () => api.get("/permissions/me"),
  update: (role_name, permission, granted) => api.put("/permissions", { role_name, permission, granted }),
  createRole: (role_name, permissions) => api.post("/roles", { role_name, permissions }),
  deleteRole: (role_name) => api.delete(`/roles/${role_name}`),
};

export const License = {
  getInfo: () => api.get("/license"),
  updateMaxUsers: (max_users) => api.put("/license", { max_users }),
  updateLimits: (limits) => api.put("/license/limits", { limits }),
  activateUser: (id) => api.put(`/users/${id}/activate`),
  deactivateUser: (id) => api.put(`/users/${id}/deactivate`),
};

export const Audit = {
  list: (params) => {
    const qs = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") qs.append(k, v);
      });
    }
    const q = qs.toString();
    return api.get(`/audit-logs${q ? "?" + q : ""}`);
  },
};

export default api;
