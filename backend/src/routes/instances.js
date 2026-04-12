import { Router } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";

export function makeInstanceRouter(controller) {
  const router = Router();

  router.use(requireAuth);
  router.use(requireRole("super_admin"));

  router.get("/instances", controller.getInstances);
  router.post("/instances", controller.createInstance);
  router.delete("/instances/:name", controller.deleteInstance);

  return router;
}
