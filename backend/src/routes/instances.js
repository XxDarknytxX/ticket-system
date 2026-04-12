import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function makeInstanceRouter(controller) {
  const router = Router();

  router.use(requireAuth);
  router.use(requireRole("super_admin"));

  router.get("/instances", controller.getInstances);
  router.get("/instances/active", controller.getActiveInstance);
  router.post("/instances", controller.createInstance);
  router.post("/instances/:name/switch", controller.switchInstance);
  router.delete("/instances/:name", controller.deleteInstance);

  return router;
}
