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
      "http://localhost:3000", "http://localhost:3001", "http://localhost:5173",
      process.env.CORS_ORIGIN,
      /^https:\/\/.*\.devtunnels\.ms$/, /^https:\/\/.*\.app\.github\.dev$/,
      /^https:\/\/.*\.githubpreview\.dev$/, /^https:\/\/.*\.vercel\.app$/,
      /^https:\/\/.*\.netlify\.app$/,
    ].filter(Boolean);
    const isAllowed = allowedOrigins.some((a) =>
      typeof a === "string" ? origin === a : a instanceof RegExp ? a.test(origin) : false
    );
    if (isAllowed) callback(null, true);
    else { console.log("Blocked origin:", origin); callback(new Error("Not allowed by CORS")); }
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

// ── Initialize shared pool ──
let sharedPool;
try {
  sharedPool = await poolManager.getSharedPool();
  console.log("Shared database connection established");

  // Ensure production instance DB has all tables
  try {
    const prodPool = await poolManager.getInstancePool("production");
    console.log("Production instance pool ready");

    // Runtime migration: add totp columns if missing
    try {
      const [cols] = await prodPool.query(
        "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'users' AND COLUMN_NAME = 'totp_secret'"
      );
      if (cols[0].c === 0) {
        await prodPool.query("ALTER TABLE users ADD COLUMN totp_secret VARCHAR(64) NULL AFTER created_by");
        await prodPool.query("ALTER TABLE users ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER totp_secret");
        await prodPool.query("ALTER TABLE users ADD COLUMN totp_backup_codes JSON NULL AFTER totp_enabled");
        console.log("Added 2FA columns to users table");
      }
    } catch (migErr) {
      console.error("2FA migration error:", migErr.message);
    }

    // Also add to shared super_admins if missing
    try {
      const [saCols] = await sharedPool.query(
        "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'super_admins' AND COLUMN_NAME = 'totp_secret'"
      );
      if (saCols[0].c === 0) {
        await sharedPool.query("ALTER TABLE super_admins ADD COLUMN totp_secret VARCHAR(64) NULL AFTER last_name");
        await sharedPool.query("ALTER TABLE super_admins ADD COLUMN totp_enabled BOOLEAN NOT NULL DEFAULT FALSE AFTER totp_secret");
        await sharedPool.query("ALTER TABLE super_admins ADD COLUMN totp_backup_codes JSON NULL AFTER totp_enabled");
        console.log("Added 2FA columns to super_admins table");
      }
    } catch (migErr) {
      console.error("Super admin 2FA migration error:", migErr.message);
    }
  } catch (e) {
    console.error("Production instance init error:", e.message);
  }
} catch (error) {
  console.error("Failed to initialize database:", error);
  process.exit(1);
}

// ── Controllers ──
// Controllers are created without a fixed pool — they use req.instancePool at request time.
// We pass sharedPool as default for backward compat; handlers override with req.instancePool.
const adminController = makeAdminController(sharedPool);
const serviceController = makeServiceController(sharedPool);
const bookingController = makeBookingController(sharedPool);
const scanController = makeScanController(sharedPool);
const settingsController = makeSettingsController(sharedPool);
const ticketLayoutController = makeTicketLayoutController(sharedPool);
const paymentMethodController = makePaymentMethodController(sharedPool);
const instanceController = makeInstanceController(poolManager);

const attachInstance = instanceMiddleware(poolManager);

// ── Instance management routes (super_admin, no instance needed) ──
// These use the shared pool directly, mounted at /api/instances
app.use("/api", makeInstanceRouter(instanceController));

// ── Helper: build instance-scoped router ──
// All other routes are mounted twice:
//   /api/...              → production instance (default)
//   /:instance/api/...    → named instance
function mountInstanceRoutes(prefix) {
  const router = express.Router({ mergeParams: true });

  // Instance middleware resolves req.instancePool from :instance param
  router.use(attachInstance);

  // Settings (public endpoint first, then auth-protected)
  router.use(makeSettingsRouter(settingsController, sharedPool));

  // Auth routes — login checks super_admins first, then instance users
  router.use(makeAuthRouter(adminController, sharedPool));
  router.use(makeServiceRouter(serviceController));
  router.use(makeBookingRouter(bookingController, sharedPool));
  router.use(makeScanRouter(scanController, sharedPool));
  router.use(makeLayoutRouter(ticketLayoutController));
  router.use(makePaymentMethodRouter(paymentMethodController));

  app.use(prefix, router);
}

// Mount: /api/* for production, /:instance/api/* for named instances
mountInstanceRoutes("/api");
mountInstanceRoutes("/:instance/api");

// ── Health + Info ──
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" });
});

app.get("/", (_req, res) => {
  res.json({
    name: "Goundar Shipping API",
    version: "2.0.0",
    instances: "GET /api/instances",
    production: "/api/...",
    otherInstances: "/{instance}/api/...",
  });
});

// ── Error handling ──
app.use((error, _req, res, _next) => {
  console.error("Server error:", error);
  if (error.name === "ValidationError") return res.status(400).json({ error: "Validation failed" });
  if (error.code === "LIMIT_FILE_SIZE") return res.status(413).json({ error: "File too large" });
  res.status(500).json({
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? error.message : "Something went wrong",
  });
});

app.use("*", (req, res) => {
  res.status(404).json({ error: "Route not found", path: req.originalUrl });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`\u{1F6A2} Goundar Shipping API v2.0 listening on http://localhost:${port}`);
  console.log(`\u{1F4E6} Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`\u{1F310} CORS Origin: ${process.env.CORS_ORIGIN || "http://localhost:3000"}`);
});
