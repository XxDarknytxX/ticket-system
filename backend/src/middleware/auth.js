import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Authentication token required" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email, role }
    next();
  } catch (error) {
    console.error("JWT verification error:", error.message);
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access requires one of: ${roles.join(", ")}` });
    }
    next();
  };
}

export function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== "admin" && req.user.role !== "super_admin") {
    return res.status(403).json({ error: "Administrator access required" });
  }
  next();
}

/**
 * Middleware factory that checks the role_permissions table for a specific permission.
 * Super admins always pass. For other roles, checks the granted flag in role_permissions.
 * Falls back to hardcoded defaults if no DB row exists.
 */
export function requirePermission(pool, permission) {
  const defaultPerms = {
    agent: ["dashboard", "booking", "ticket_search"],
    dock: ["scanner"],
    admin: [
      "dashboard", "booking", "ticket_search", "reports", "scanner",
      "scan_history", "configuration", "users", "teams", "license_overview",
    ],
  };

  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    // Super admin bypasses all permission checks
    if (req.user.role === "super_admin") return next();

    try {
      const [rows] = await pool.query(
        "SELECT granted FROM role_permissions WHERE role_name = ? AND permission = ?",
        [req.user.role, permission]
      );
      if (rows.length > 0) {
        // Explicit DB entry for this permission — use it
        if (rows[0].granted) return next();
        return res.status(403).json({ error: `You do not have permission: ${permission}` });
      }
      // No DB row for this specific permission — fall back to hardcoded defaults
      // (the role may have other permissions in DB, but this one isn't configured there)
      const defaults = defaultPerms[req.user.role] || [];
      if (defaults.includes(permission)) return next();
      return res.status(403).json({ error: `You do not have permission: ${permission}` });
    } catch (err) {
      console.error("Permission check error:", err.message);
      // On DB error, fall back to hardcoded defaults
      const defaults = defaultPerms[req.user.role] || [];
      if (defaults.includes(permission)) return next();
      return res.status(403).json({ error: `You do not have permission: ${permission}` });
    }
  };
}
