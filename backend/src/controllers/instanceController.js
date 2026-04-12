/** Instance Controller — manage database instances (super_admin only) */
import bcrypt from "bcryptjs";
import { logAudit } from "../utils/audit.js";

/** Default role permissions seeded into every new instance */
const ALL_PERMISSIONS = [
  "dashboard", "booking", "ticket_search", "reports", "scanner",
  "scan_history", "configuration", "users", "teams", "license_overview",
];
const DEFAULT_ROLE_PERMS = {
  admin: ["dashboard", "booking", "ticket_search", "reports", "scanner", "scan_history", "configuration", "users", "teams", "license_overview"],
  agent: ["dashboard", "booking", "ticket_search"],
  dock: ["scanner"],
};

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  forbidden: (res, msg = "Forbidden") => res.status(403).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

const slugify = (s) =>
  String(s || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);

export function makeInstanceController(poolManager) {
  const sharedPool = () => poolManager.getSharedPool();

  return {
    // GET /api/instances
    getInstances: async (_req, res) => {
      try {
        const pool = await sharedPool();
        const [rows] = await pool.query(
          "SELECT * FROM database_instances ORDER BY created_at ASC"
        );
        return send.ok(res, { instances: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/instances — create a new instance with its own DB
    createInstance: async (req, res) => {
      const { name, label, color } = req.body;
      if (!name || !String(name).trim()) return send.bad(res, "Instance name is required");
      if (!label || !String(label).trim()) return send.bad(res, "Instance label is required");

      const slug = slugify(name);
      if (!slug) return send.bad(res, "Invalid instance name");

      const dbName = `booking_app_${slug}`;

      try {
        const pool = await sharedPool();

        // Check for duplicates
        const [existing] = await pool.query(
          "SELECT id FROM database_instances WHERE name = ? OR db_name = ?",
          [slug, dbName]
        );
        if (existing.length > 0) return send.bad(res, "An instance with this name already exists");

        // Create the actual MySQL database + all instance tables
        const instancePool = await poolManager.createInstanceDb(dbName);

        // Seed the super_admin user into the new instance's users table
        // so they can log in from the new instance URL
        const [saRows] = await pool.query("SELECT * FROM super_admins");
        for (const sa of saRows) {
          try {
            await instancePool.query(
              `INSERT IGNORE INTO users (email, first_name, last_name, password_hash, role, terminal_id) VALUES (?, ?, ?, ?, 'super_admin', '01')`,
              [sa.email, sa.first_name || null, sa.last_name || null, sa.password_hash]
            );
          } catch {} // ignore if already exists
        }

        // Seed default permissions for built-in roles
        for (const [role, granted] of Object.entries(DEFAULT_ROLE_PERMS)) {
          for (const perm of ALL_PERMISSIONS) {
            try {
              await instancePool.query(
                "INSERT IGNORE INTO role_permissions (role_name, permission, granted) VALUES (?, ?, ?)",
                [role, perm, granted.includes(perm) ? 1 : 0]
              );
            } catch {}
          }
        }

        // Register in the shared database
        const [result] = await pool.query(
          "INSERT INTO database_instances (name, label, db_name, color) VALUES (?, ?, ?, ?)",
          [slug, String(label).trim(), dbName, color || "#f59e0b"]
        );

        const [newRow] = await pool.query("SELECT * FROM database_instances WHERE id = ?", [result.insertId]);

        try {
          await logAudit(instancePool, req, {
            action: "instance.create",
            targetType: "instance",
            targetId: slug,
            details: { label, dbName },
          });
        } catch {}

        return send.created(res, { instance: newRow[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/instances/:name
    deleteInstance: async (req, res) => {
      const { name } = req.params;
      try {
        const pool = await sharedPool();

        const info = await poolManager.getInstanceInfo(name);
        if (!info) return send.notFound(res, "Instance not found");

        // Don't allow deleting production
        if (name === "production") {
          return send.bad(res, "Cannot delete the production instance.");
        }

        // Don't allow deleting if it points to the primary DB
        if (info.db_name === (process.env.DATABASE_NAME || "booking_app")) {
          return send.bad(res, "Cannot delete the primary production database instance.");
        }

        // Drop the actual MySQL database
        await poolManager.dropInstanceDb(info.db_name);

        // Remove the row
        await pool.query("DELETE FROM database_instances WHERE name = ?", [name]);

        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
