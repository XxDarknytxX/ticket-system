import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function makeInstanceRouter(controller) {
  const router = Router();

  // Per-route auth (NOT router.use) to avoid blocking other /api routes
  const auth = [requireAuth, requireRole("super_admin")];

  router.get("/instances", ...auth, controller.getInstances);
  router.post("/instances", ...auth, controller.createInstance);
  router.delete("/instances/:name", ...auth, controller.deleteInstance);

  return router;
}
