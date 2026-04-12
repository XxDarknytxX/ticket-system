import { Router } from "express";
import { requireAuth, requireAdmin, requirePermission } from "../middleware/auth.js";

export function makeSettingsRouter(controller, pool) {
  const router = Router();

  // Public: theme color + app name only (no auth) — used by login page
  router.get("/settings/public", controller.getPublicSettings);

  // Protected routes — per-route auth (NOT router.use) to avoid blocking other routes
  router.get("/settings", requireAuth, requirePermission(pool, "configuration"), controller.getSettings);
  router.put("/settings/:key", requireAuth, requireAdmin, controller.updateSetting);

  return router;
}
