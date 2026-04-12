/** Settings Controller - System configuration management */
import { logAudit } from "../utils/audit.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeSettingsController(pool) {
  const db = (req) => req.instancePool || pool;

  return {
    // GET /api/settings/public - unauthenticated, returns only safe theme fields
    getPublicSettings: async (req, res) => {
      try {
        const [rows] = await db(req).query(
          "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('primary_color','app_name')"
        );
        const settings = {};
        for (const row of rows) settings[row.setting_key] = row.setting_value;
        return send.ok(res, { settings });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/settings
    getSettings: async (req, res) => {
      try {
        const [rows] = await db(req).query("SELECT setting_key, setting_value FROM system_settings");
        const settings = {};
        for (const row of rows) {
          settings[row.setting_key] = row.setting_value;
        }
        return send.ok(res, { settings });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/settings/:key
    updateSetting: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return res.status(403).json({ error: "Admin access required" });
      }

      const { key } = req.params;
      const { value } = req.body;

      if (value === undefined || value === null) {
        return send.bad(res, "Setting value is required");
      }

      try {
        const [result] = await db(req).query(
          `INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [key, String(value)]
        );

        // Redact sensitive values from audit log
        const sensitiveKeys = ["smtp_pass"];
        const auditValue = sensitiveKeys.includes(key) ? "***" : String(value);
        await logAudit(db(req), req, {
          action: "settings.update",
          targetType: "setting",
          targetId: key,
          details: { key, value: auditValue },
        });
        return send.ok(res, { setting: { key, value: String(value) } });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
