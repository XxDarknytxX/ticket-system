import { Router } from "express";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export function makeScanRouter(controller, pool) {
  const router = Router();

  // All scan routes require authentication
  router.use(requireAuth);

  // Verify a ticket by ticket ID (dock, admin, agent with scanner permission)
  router.get("/tickets/:ticketId/verify", requirePermission(pool, "scanner"), controller.verifyTicket);

  // Board a passenger (dock, admin with scanner permission)
  router.post("/tickets/:ticketId/board", requirePermission(pool, "scanner"), controller.boardPassenger);

  // Scan history (admin only)
  router.get("/scans/history", requirePermission(pool, "scan_history"), controller.getScanHistory);

  // Scan stats (admin only)
  router.get("/scans/stats", requirePermission(pool, "scan_history"), controller.getScanStats);

  return router;
}
