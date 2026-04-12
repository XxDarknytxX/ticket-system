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
/**
 * Default permissions — seeded into role_permissions on first check if no rows exist.
 * Once seeded, the DB is the sole source of truth (no more hardcoded fallbacks).
 */
const DEFAULT_PERMS = {
  agent: ["dashboard", "booking", "ticket_search"],
  dock: ["scanner"],
  admin: [
    "dashboard", "booking", "ticket_search", "reports", "scanner",
    "scan_history", "configuration", "users", "teams", "license_overview",
  ],
};

const ALL_PERMISSIONS = [
  "dashboard", "booking", "ticket_search", "reports", "scanner",
  "scan_history", "configuration", "users", "teams", "license_overview",
];

// Track which roles have been seeded in this process lifetime
const seededRoles = new Set();

export function requirePermission(pool, permission) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }
    if (req.user.role === "super_admin") return next();

    const role = req.user.role;

    try {
      const permPool = req.instancePool || pool;

      // If this role has never been checked, seed defaults if no DB rows exist
      if (!seededRoles.has(`${permPool.pool?.config?.connectionConfig?.database || 'default'}_${role}`)) {
        const [countRows] = await permPool.query(
          "SELECT COUNT(*) AS c FROM role_permissions WHERE role_name = ?", [role]
        );
        if (countRows[0].c === 0) {
          // No rows for this role — seed defaults
          const granted = DEFAULT_PERMS[role] || [];
          for (const perm of ALL_PERMISSIONS) {
            try {
              await permPool.query(
                "INSERT IGNORE INTO role_permissions (role_name, permission, granted) VALUES (?, ?, ?)",
                [role, perm, granted.includes(perm) ? 1 : 0]
              );
            } catch {}
          }
        }
        seededRoles.add(`${permPool.pool?.config?.connectionConfig?.database || 'default'}_${role}`);
      }

      // Always use DB — no hardcoded fallback
      const [rows] = await permPool.query(
        "SELECT granted FROM role_permissions WHERE role_name = ? AND permission = ?",
        [role, permission]
      );
      if (rows.length > 0) {
        if (rows[0].granted) return next();
        return res.status(403).json({ error: `You do not have permission: ${permission}` });
      }
      // Permission not in DB at all — deny by default
      return res.status(403).json({ error: `You do not have permission: ${permission}` });
    } catch (err) {
      console.error("Permission check error:", err.message);
      return res.status(403).json({ error: `Permission check failed` });
    }
  };
}
