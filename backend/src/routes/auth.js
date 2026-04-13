import { Router } from "express";
import { body } from "express-validator";
import { requireAuth, requireAdmin, requirePermission, requireRole } from "../middleware/auth.js";

export function makeAuthRouter(controller, pool) {
  const router = Router();

  // Public routes
  router.post(
    "/register",
    [
      body("email").isEmail().withMessage("Valid email required"),
      body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
      body("role").optional().isString().withMessage("Role must be admin, agent, or dock"),
    ],
    controller.register
  );

  router.post(
    "/login",
    [
      body("email").isEmail().withMessage("Valid email required"),
      body("password").notEmpty().withMessage("Password required"),
    ],
    controller.login
  );

  // Public: consume reset token
  router.post("/reset-password", controller.consumeResetToken);

  // Public: verify 2FA during login (uses tempToken, no requireAuth)
  router.post("/2fa/verify-login", controller.verifyLogin2FA);

  // Protected routes
  router.get("/me", requireAuth, controller.me);
  router.get("/dashboard", requireAuth, requirePermission(pool, "dashboard"), controller.dashboard);

  // User Management Routes (Admin Only)
  router.get("/users", requireAuth, requirePermission(pool, "users"), controller.getUsers);
  router.get("/users/:id", requireAuth, requirePermission(pool, "users"), controller.getUserById);
  router.post(
    "/users",
    requireAuth,
    requirePermission(pool, "users"),
    [
      body("email").isEmail().withMessage("Valid email required"),
      body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
      body("role").isString().withMessage("Role must be admin, agent, or dock"),
    ],
    controller.createUserByAdmin
  );
  router.put(
    "/users/:id",
    requireAuth,
    requirePermission(pool, "users"),
    [
      body("email").optional().isEmail().withMessage("Valid email required if provided"),
      body("password")
        .optional()
        .isLength({ min: 6 })
        .withMessage("Password must be at least 6 characters if provided"),
      body("role").optional().isString().withMessage("Role must be admin, agent, or dock if provided"),
    ],
    controller.updateUser
  );
  router.delete("/users/:id", requireAuth, requirePermission(pool, "users"), controller.deleteUser);
  router.post("/users/:id/send-onboarding", requireAuth, requirePermission(pool, "users"), controller.sendOnboarding);
  router.post("/users/:id/reset-password", requireAuth, requirePermission(pool, "users"), controller.resetPassword);
  router.put("/users/:id/activate", requireAuth, requirePermission(pool, "users"), controller.activateUser);
  router.put("/users/:id/deactivate", requireAuth, requirePermission(pool, "users"), controller.deactivateUser);

  // Teams routes (Admin Only)
  router.get("/teams", requireAuth, requirePermission(pool, "teams"), controller.getTeams);
  router.post("/teams", requireAuth, requirePermission(pool, "teams"), controller.createTeam);
  router.put("/teams/:id", requireAuth, requirePermission(pool, "teams"), controller.updateTeam);
  router.delete("/teams/:id", requireAuth, requirePermission(pool, "teams"), controller.deleteTeam);
  router.post("/teams/assign", requireAuth, requirePermission(pool, "teams"), controller.assignUserToTeam);

  // Permissions routes (super_admin manages, admin can view all, any user can view own)
  router.get("/permissions", requireAuth, requireAdmin, controller.getPermissions);
  router.get("/permissions/me", requireAuth, controller.getMyPermissions);
  router.put("/permissions", requireAuth, requireRole("super_admin"), controller.updatePermission);
  router.post("/roles", requireAuth, requireRole("super_admin"), controller.createRole);
  router.delete("/roles/:role_name", requireAuth, requireRole("super_admin"), controller.deleteRole);

  // 2FA management (authenticated)
  router.post("/2fa/setup", requireAuth, controller.setup2FA);
  router.post("/2fa/verify", requireAuth, controller.verify2FA);
  router.post("/2fa/disable", requireAuth, controller.disable2FA);
  router.post("/users/:id/reset-2fa", requireAuth, requirePermission(pool, "users"), controller.reset2FA);

  // License management (super_admin only)
  router.get("/license", requireAuth, requireRole("super_admin", "admin"), controller.getLicenseInfo);
  router.put("/license/limits", requireAuth, requireRole("super_admin"), controller.updateLicenseLimits);
  router.put("/license", requireAuth, requireRole("super_admin"), controller.updateMaxUsers); // legacy

  // Audit logs (super_admin only)
  router.get("/audit-logs", requireAuth, requireRole("super_admin"), controller.getAuditLogs);

  return router;
}
