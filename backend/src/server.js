import "dotenv/config";
import express from "express";
import cors from "cors";
import { getPool } from "./config/db.js";
import { makeAdminController } from "./controllers/adminController.js";
import { makeServiceController } from "./controllers/serviceController.js";
import { makeBookingController } from "./controllers/bookingController.js";
import { makeScanController } from "./controllers/scanController.js";
import { makeSettingsController } from "./controllers/settingsController.js";
import { makeTicketLayoutController } from "./controllers/ticketLayoutController.js";
import { makePaymentMethodController } from "./controllers/paymentMethodController.js";
import { makeAuthRouter } from "./routes/auth.js";
import { makeServiceRouter } from "./routes/services.js";
import { makeBookingRouter } from "./routes/bookings.js";
import { makeScanRouter } from "./routes/scans.js";
import { makeSettingsRouter } from "./routes/settings.js";
import { makeLayoutRouter } from "./routes/layouts.js";
import { makePaymentMethodRouter } from "./routes/paymentMethods.js";

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

let pool;
let adminController;
let serviceController;
let bookingController;
let scanController;
let settingsController;
let ticketLayoutController;
let paymentMethodController;

try {
  pool = await getPool();
  console.log("Database connection established");

  // Runtime migration: ensure payment_methods table + bookings.payment_method column exist
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS payment_methods (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_payment_methods_active (is_active),
        INDEX idx_payment_methods_sort (sort_order)
      )
    `);
    // Seed default payment methods (only inserts missing rows thanks to UNIQUE on code)
    await pool.query(
      `INSERT IGNORE INTO payment_methods (code, name, sort_order) VALUES
        ('cash', 'Cash', 1),
        ('m-paisa', 'M-PAiSA', 2),
        ('my-cash', 'MyCash', 3),
        ('card', 'Card', 4)`
    );
    // Add bookings.payment_method column if missing
    const [colRows] = await pool.query(
      `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND COLUMN_NAME = 'payment_method'`
    );
    if (colRows[0].c === 0) {
      await pool.query(`ALTER TABLE bookings ADD COLUMN payment_method VARCHAR(50) NULL AFTER notes`);
      await pool.query(`ALTER TABLE bookings ADD INDEX idx_bookings_payment_method (payment_method)`);
    }
    console.log("Payment methods migration OK");
  } catch (migErr) {
    console.error("Payment methods migration failed:", migErr.message);
  }

  adminController = makeAdminController(pool);
  serviceController = makeServiceController(pool);
  bookingController = makeBookingController(pool);
  scanController = makeScanController(pool);
  settingsController = makeSettingsController(pool);
  ticketLayoutController = makeTicketLayoutController(pool);
  paymentMethodController = makePaymentMethodController(pool);

  console.log("Controllers initialized");
} catch (error) {
  console.error("Failed to initialize database or controllers:", error);
  process.exit(1);
}

app.use("/api", makeAuthRouter(adminController, pool));
// Settings router must be mounted before routers that use global requireAuth
// (service/booking/scan), otherwise their router.use(requireAuth) will block
// /api/settings/public before it can reach this router.
app.use("/api", makeSettingsRouter(settingsController, pool));
app.use("/api", makeServiceRouter(serviceController));
app.use("/api", makeBookingRouter(bookingController, pool));
app.use("/api", makeScanRouter(scanController, pool));
app.use("/api", makeLayoutRouter(ticketLayoutController));
app.use("/api", makePaymentMethodRouter(paymentMethodController));

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
      scans: "/api/scans/history, /api/scans/stats",
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
