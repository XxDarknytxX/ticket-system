import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

export function makeLayoutRouter(controller) {
  const router = Router();

  router.get("/ticket-layouts", requireAuth, controller.getAll);
  router.get("/ticket-layouts/:id", requireAuth, controller.getById);
  router.post("/ticket-layouts", requireAuth, controller.create);
  router.put("/ticket-layouts/:id", requireAuth, controller.update);
  router.delete("/ticket-layouts/:id", requireAuth, controller.delete);

  return router;
}
