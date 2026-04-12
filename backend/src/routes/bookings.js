import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requirePermission } from "../middleware/auth.js";

export function makeBookingRouter(controller, pool) {
  const router = Router();

  router.use(requireAuth);

  // Booking routes - require booking permission
  router.get("/bookings", requirePermission(pool, "booking"), controller.getBookings);
  router.get("/bookings/search", requirePermission(pool, "ticket_search"), controller.searchBookings);

  // Reports - require reports permission
  router.get("/bookings/reports", requirePermission(pool, "reports"), controller.getBookingReports);
  router.get("/bookings/sales-report", requirePermission(pool, "reports"), controller.getSalesReport);
  router.get("/bookings/validation-report", requirePermission(pool, "reports"), controller.getValidationReport);

  // Dashboard stats - require dashboard permission
  router.get("/dashboard/stats", requirePermission(pool, "dashboard"), controller.getDashboardStats);

  // Wildcard route AFTER all static ones
  router.get("/bookings/:ticketId", requirePermission(pool, "booking"), controller.getBookingByTicketId);

  router.post(
    "/bookings",
    requirePermission(pool, "booking"),
    [
      body("customer_name").notEmpty().withMessage("Customer name is required"),
      body("customer_email").optional({ checkFalsy: true }).isEmail().withMessage("Valid email required if provided"),
      body("customer_phone").optional(),
      body("customer_gender").optional().isIn(["male", "female"]).withMessage("Gender must be male or female if provided"),
      body("route_id").isInt({ min: 1 }).withMessage("Valid route ID is required"),
      body("vessel_id").optional({ checkFalsy: true }).isInt({ min: 1 }).withMessage("Valid vessel ID required if provided"),
      body("booking_type").isIn(["one_way", "return", "multi"]).withMessage("Booking type must be one_way, return, or multi"),
      body("passenger_type").isIn(["adult", "student", "child", "infant"]).withMessage("Invalid passenger type"),
      body("travel_date").isISO8601().withMessage("Valid travel date is required"),
      body("return_date").optional({ checkFalsy: true }).isISO8601().withMessage("Valid return date required for return bookings"),
      body("custom_validity_days").optional({ checkFalsy: true }).isInt({ min: 1, max: 365 }).withMessage("Validity days must be between 1 and 365"),
      body("notes").optional({ checkFalsy: true }).isString().withMessage("Notes must be a string"),
      body("payment_method").optional({ checkFalsy: true }).isString().withMessage("Payment method must be a string"),
    ],
    controller.createBooking
  );

  router.put(
    "/bookings/:ticketId/status",
    requirePermission(pool, "booking"),
    [body("status").isIn(["confirmed", "cancelled", "completed", "boarded", "invalidated"]).withMessage("Invalid status")],
    controller.updateBookingStatus
  );

  router.post("/bookings/email-tickets", requirePermission(pool, "booking"), controller.emailTickets);

  return router;
}
