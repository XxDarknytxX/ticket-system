import { Router } from "express";
import { requireAuth, requireAdmin, requirePermission } from "../middleware/auth.js";

export function makeSettingsRouter(controller, pool) {
  const router = Router();

  // Public: theme color + app name only (no auth) — used by login page
  router.get("/settings/public", controller.getPublicSettings);

  router.use(requireAuth);

  // Only admin/super_admin can read all settings
  router.get("/settings", requirePermission(pool, "configuration"), controller.getSettings);
  router.put("/settings/:key", requireAdmin, controller.updateSetting);

  return router;
}
