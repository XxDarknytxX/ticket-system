import "dotenv/config";
import express from "express";
import cors from "cors";
import poolManager from "./config/db.js";
import { instanceMiddleware } from "./middleware/instance.js";
import { makeAdminController } from "./controllers/adminController.js";
import { makeServiceController } from "./controllers/serviceController.js";
import { makeBookingController } from "./controllers/bookingController.js";
import { makeScanController } from "./controllers/scanController.js";
import { makeSettingsController } from "./controllers/settingsController.js";
import { makeTicketLayoutController } from "./controllers/ticketLayoutController.js";
import { makePaymentMethodController } from "./controllers/paymentMethodController.js";
import { makeInstanceController } from "./controllers/instanceController.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeServiceRouter } from "./routes/services.js";
import { makeBookingRouter } from "./routes/bookings.js";
import { makeScanRouter } from "./routes/scans.js";
import { makeSettingsRouter } from "./routes/settings.js";
import { makeLayoutRouter } from "./routes/layouts.js";
import { makePaymentMethodRouter } from "./routes/paymentMethods.js";
import { makeInstanceRouter } from "./routes/instances.js";

const app = express();

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      "http://localhost:3000",
      "http://localhost:3001",
      "http://localhost:5173",
      process.env.CORS_ORIGIN,
      /^https:\/\/.*\.devtunnels\.ms$/,
      /^https:\/\/.*\.app\.github\.dev$/,
      /^https:\/\/.*\.githubpreview\.dev$/,
      /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.netlify\.app$/,
    ].filter(Boolean);

    const isAllowed = allowedOrigins.some((allowed) => {
      if (typeof allowed === "string") return origin === allowed;
      if (allowed instanceof RegExp) return allowed.test(origin);
      return false;
    });

    if (isAllowed) callback(null, true);
    else {
      console.log("Blocked origin:", origin);
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

if (process.env.NODE_ENV === "development") {
  app.use((req, _res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
  });
}

let pool; // shared pool (users, settings, teams, audit_logs)

try {
  pool = await poolManager.getSharedPool();
  console.log("Shared database connection established");

  // Ensure shared-DB tables exist (users, teams, etc. are created by schema.sql,
  // but role_permissions + system_settings may need runtime creation)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        role_name VARCHAR(50) NOT NULL,
        permission VARCHAR(100) NOT NULL,
        granted BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_role_perm (role_name, permission),
        INDEX idx_role_permissions_role (role_name)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS system_settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    await pool.query(
      `INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('ticket_validity_days', '7')`
    );
  } catch (e) {
    console.error("Shared table migration error:", e.message);
  }

  // Ensure the active instance DB has its tables (runs instance schema)
  try {
    const activePool = await poolManager.getActiveInstancePool();
    console.log(`Active instance pool ready: ${await poolManager.getActiveInstanceName()}`);
  } catch (e) {
    console.error("Instance pool init error:", e.message);
  }

  console.log("Database initialization complete");
} catch (error) {
  console.error("Failed to initialize database:", error);
  process.exit(1);
}

// Controllers that use the SHARED pool (users, settings, auth, license, audit)
const adminController = makeAdminController(pool);
const settingsController = makeSettingsController(pool);
const instanceController = makeInstanceController(poolManager);

// Controllers that use INSTANCE data are created with the shared pool,
// but will read from req.instancePool at request time (set by middleware).
// We pass the shared pool so they can still JOIN to users/teams when needed.
const serviceController = makeServiceController(pool);
const bookingController = makeBookingController(pool);
const scanController = makeScanController(pool);
const ticketLayoutController = makeTicketLayoutController(pool);
const paymentMethodController = makePaymentMethodController(pool);

// Instance middleware — attaches req.instancePool on every authed request
const attachInstance = instanceMiddleware(poolManager);

// Routes: auth + settings mount BEFORE instance middleware (no instance needed for login)
app.use("/api", makeAuthRouter(adminController, pool));
app.use("/api", makeSettingsRouter(settingsController, pool));

// Instance management routes (super_admin only, uses shared pool directly)
app.use("/api", makeInstanceRouter(instanceController));

// All other routes get instance middleware so req.instancePool is available
app.use("/api", attachInstance, makeServiceRouter(serviceController));
app.use("/api", attachInstance, makeBookingRouter(bookingController, pool));
app.use("/api", attachInstance, makeScanRouter(scanController, pool));
app.use("/api", attachInstance, makeLayoutRouter(ticketLayoutController));
app.use("/api", attachInstance, makePaymentMethodRouter(paymentMethodController));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    version: "2.0.0",
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "Goundar Shipping API",
    version: "2.0.0",
    endpoints: {
      health: "/health",
      auth: "/api/login, /api/register, /api/me",
      users: "/api/users (admin only)",
      services: "/api/service-types, /api/routes, /api/vessels",
      bookings: "/api/bookings, /api/bookings/reports",
      scanning: "/api/tickets/:id/verify, /api/tickets/:id/board",
      instances: "/api/instances (super_admin only)",
    },
  });
});

app.use((error, _req, res, _next) => {
  console.error("Server error:", error);
  if (error.name === "ValidationError") {
    return res.status(400).json({ error: "Validation failed", details: error.message });
  }
  if (error.code === "LIMIT_FILE_SIZE") {
    return res.status(413).json({ error: "File too large" });
  }
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
  });
});

app.use("*", (req, res) => {
  res.status(404).json({
    error: "Route not found",
    path: req.originalUrl,
    method: req.method,
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`\u{1F6A2} Goundar Shipping API v2.0 listening on http://localhost:${port}`);
  console.log(`\u{1F4E6} Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`\u{1F310} CORS Origin: ${process.env.CORS_ORIGIN || "http://localhost:3000"}`);
  console.log(`\u{1F3E5} Health check: http://localhost:${port}/health`);
});
