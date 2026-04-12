/** Instance Controller — manage database instances (super_admin only) */
import { logAudit } from "../utils/audit.js";

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
          "SELECT * FROM database_instances ORDER BY is_active DESC, created_at ASC"
        );
        const activeName = await poolManager.getActiveInstanceName();
        return send.ok(res, { instances: rows, activeInstance: activeName });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/instances/active
    getActiveInstance: async (_req, res) => {
      try {
        const name = await poolManager.getActiveInstanceName();
        const info = await poolManager.getInstanceInfo(name);
        return send.ok(res, { activeInstance: name, instance: info });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/instances
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

        // Create the actual MySQL database + tables
        const instancePool = await poolManager.createInstanceDb(dbName);

        // Register in the shared database
        const [result] = await pool.query(
          "INSERT INTO database_instances (name, label, db_name, is_active, color) VALUES (?, ?, ?, FALSE, ?)",
          [slug, String(label).trim(), dbName, color || "#f59e0b"]
        );

        const [newRow] = await pool.query("SELECT * FROM database_instances WHERE id = ?", [result.insertId]);

        await logAudit(pool, req, {
          action: "instance.create",
          targetType: "instance",
          targetId: slug,
          details: { label, dbName },
        });

        return send.created(res, { instance: newRow[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/instances/:name/switch
    switchInstance: async (req, res) => {
      const { name } = req.params;
      try {
        const pool = await sharedPool();

        const info = await poolManager.getInstanceInfo(name);
        if (!info) return send.notFound(res, "Instance not found");

        // Verify the instance DB is accessible
        try {
          const iPool = await poolManager.getInstancePool(name);
          await iPool.query("SELECT 1");
        } catch (dbErr) {
          return send.bad(res, `Cannot connect to instance database: ${dbErr.message}`);
        }

        // Update active flags
        await pool.query("UPDATE database_instances SET is_active = FALSE");
        await pool.query("UPDATE database_instances SET is_active = TRUE WHERE name = ?", [name]);
        await pool.query(
          "INSERT INTO system_settings (setting_key, setting_value) VALUES ('active_instance', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
          [name, name]
        );

        await logAudit(pool, req, {
          action: "instance.switch",
          targetType: "instance",
          targetId: name,
          details: { label: info.label, dbName: info.db_name },
        });

        return send.ok(res, { activeInstance: name, instance: info });
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

        // Don't allow deleting the active instance
        const activeName = await poolManager.getActiveInstanceName();
        if (name === activeName) {
          return send.bad(res, "Cannot delete the currently active instance. Switch to another instance first.");
        }

        // Don't allow deleting production if it points to the shared DB
        if (info.db_name === (process.env.DATABASE_NAME || "booking_app")) {
          return send.bad(res, "Cannot delete the primary production database instance.");
        }

        // Drop the actual MySQL database
        await poolManager.dropInstanceDb(info.db_name);

        // Remove the row
        await pool.query("DELETE FROM database_instances WHERE name = ?", [name]);

        await logAudit(pool, req, {
          action: "instance.delete",
          targetType: "instance",
          targetId: name,
          details: { label: info.label, dbName: info.db_name },
        });

        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
