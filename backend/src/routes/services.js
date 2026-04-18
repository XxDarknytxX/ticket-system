import { Router } from "express";
import { body } from "express-validator";
import { requireAuth } from "../middleware/auth.js";

export function makeServiceRouter(controller) {
  const router = Router();

  // All routes require authentication
  router.use(requireAuth);

  // ============================================================================
  // SERVICE TYPES
  // ============================================================================

  router.get("/service-types", controller.getServiceTypes);
  router.post(
    "/service-types",
    [
      body("name").notEmpty().withMessage("Service type name is required"),
      body("description").optional(),
      body("vat_rate").optional().isFloat({ min: 0, max: 100 }).withMessage("VAT rate must be between 0 and 100"),
    ],
    controller.createServiceType
  );
  router.put(
    "/service-types/:id",
    [
      body("name").notEmpty().withMessage("Service type name is required"),
      body("description").optional(),
      body("vat_rate").isFloat({ min: 0, max: 100 }).withMessage("VAT rate must be between 0 and 100"),
    ],
    controller.updateServiceType
  );

  // ============================================================================
  // VESSEL MANAGEMENT
  // ============================================================================

  router.get("/vessels", controller.getVessels);
  router.post(
    "/vessels",
    [
      body("name").notEmpty().withMessage("Vessel name is required"),
      body("seat_capacity").isInt({ min: 1 }).withMessage("Seat capacity must be at least 1"),
      body("description").optional(),
      body("status").optional().isIn(["active", "in_repair", "retired"]).withMessage("Invalid status"),
    ],
    controller.createVessel
  );
  router.put(
    "/vessels/:id",
    [
      body("name").optional().notEmpty().withMessage("Vessel name cannot be empty"),
      body("seat_capacity").optional().isInt({ min: 1 }).withMessage("Seat capacity must be at least 1"),
      body("description").optional(),
      body("status").optional().isIn(["active", "in_repair", "retired"]).withMessage("Invalid status"),
    ],
    controller.updateVessel
  );
  router.delete("/vessels/:id", controller.deleteVessel);

  // ============================================================================
  // ROUTE MANAGEMENT
  // ============================================================================

  router.get("/routes", controller.getRoutes);
  router.post(
    "/routes",
    [
      body("service_type_id").isInt({ min: 1 }).withMessage("Valid service type ID is required"),
      body("source").notEmpty().withMessage("Source is required"),
      body("destination").notEmpty().withMessage("Destination is required"),
      body("adult_price").isFloat({ min: 0 }).withMessage("Adult price must be a positive number"),
      body("student_price").isFloat({ min: 0 }).withMessage("Student price must be a positive number"),
      body("child_price").isFloat({ min: 0 }).withMessage("Child price must be a positive number"),
      body("infant_price").optional().isFloat({ min: 0 }).withMessage("Infant price must be a positive number"),
    ],
    controller.createRoute
  );
  router.put(
    "/routes/:id",
    [
      body("source").notEmpty().withMessage("Source is required"),
      body("destination").notEmpty().withMessage("Destination is required"),
      body("adult_price").isFloat({ min: 0 }).withMessage("Adult price must be a positive number"),
      body("student_price").isFloat({ min: 0 }).withMessage("Student price must be a positive number"),
      body("child_price").isFloat({ min: 0 }).withMessage("Child price must be a positive number"),
      body("infant_price").optional().isFloat({ min: 0 }).withMessage("Infant price must be a positive number"),
    ],
    controller.updateRoute
  );
  
  // Discount pricing endpoint
  router.put(
    "/routes/:id/discount",
    [
      body("discount_enabled").isBoolean().withMessage("Discount enabled must be a boolean"),
      body("discount_adult_price").optional().isFloat({ min: 0 }).withMessage("Discount adult price must be a positive number"),
      body("discount_student_price").optional().isFloat({ min: 0 }).withMessage("Discount student price must be a positive number"),
      body("discount_child_price").optional().isFloat({ min: 0 }).withMessage("Discount child price must be a positive number"),
      body("discount_infant_price").optional().isFloat({ min: 0 }).withMessage("Discount infant price must be a positive number"),
    ],
    controller.updateRouteDiscount
  );
  
  router.delete("/routes/:id", controller.deleteRoute);

  return router;
}