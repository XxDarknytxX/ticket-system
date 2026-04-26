import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export function makeManifestRouter(controller, pool) {
  const router = Router();

  router.use(requireAuth);

  // ─── Departures (schedule) ───────────────────────────────────────────────
  router.get("/departures",
    requirePermission(pool, "manifest_view"),
    controller.listDepartures
  );

  router.get("/departures/:id",
    requirePermission(pool, "manifest_view"),
    controller.getDeparture
  );

  router.post(
    "/departures",
    requirePermission(pool, "schedule_edit"),
    [
      body("route_id").isInt({ min: 1 }).withMessage("route_id required"),
      body("vessel_id").isInt({ min: 1 }).withMessage("vessel_id required"),
      body("departure_date").isISO8601().withMessage("departure_date must be YYYY-MM-DD"),
      body("departure_time").matches(/^\d{2}:\d{2}(:\d{2})?$/).withMessage("departure_time must be HH:MM"),
      body("notes").optional({ checkFalsy: true }),
    ],
    controller.createDeparture
  );

  router.post("/departures/bulk",
    requirePermission(pool, "schedule_edit"),
    controller.bulkCreateDepartures
  );

  router.put("/departures/:id",
    requirePermission(pool, "schedule_edit"),
    controller.updateDeparture
  );

  router.post("/departures/:id/complete",
    requirePermission(pool, "schedule_edit"),
    controller.completeDeparture
  );

  router.delete("/departures/:id",
    requirePermission(pool, "schedule_edit"),
    controller.deleteDeparture
  );

  // ─── Manifest views ──────────────────────────────────────────────────────
  router.get("/departures/:id/manifest",
    requirePermission(pool, "manifest_view"),
    controller.getLiteralManifest
  );

  router.get("/departures/:id/projected",
    requirePermission(pool, "manifest_view"),
    controller.getProjectedManifest
  );

  router.get("/departures/:id/report",
    requirePermission(pool, "manifest_view"),
    controller.getTripReport
  );

  return router;
}
