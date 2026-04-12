import { Router } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

export function makePaymentMethodRouter(controller) {
  const router = Router();

  router.use(requireAuth);

  // Any authenticated user can read (agents need it at booking time)
  router.get("/payment-methods", controller.getPaymentMethods);

  // Admin-only CRUD
  router.post("/payment-methods", requireAdmin, controller.createPaymentMethod);
  router.put("/payment-methods/:id", requireAdmin, controller.updatePaymentMethod);
  router.delete("/payment-methods/:id", requireAdmin, controller.deletePaymentMethod);

  return router;
}
