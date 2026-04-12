/** Payment Methods Controller - configurable booking payment types */
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
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);

const isAdmin = (req) => req.user?.role === "admin" || req.user?.role === "super_admin";

export function makePaymentMethodController(pool) {
  const db = (req) => req.instancePool || pool;

  return {
    // GET /api/payment-methods  (any authenticated user)
    getPaymentMethods: async (req, res) => {
      try {
        const [rows] = await db(req).query(
          "SELECT id, code, name, is_active, sort_order FROM payment_methods ORDER BY sort_order ASC, id ASC"
        );
        return send.ok(res, { paymentMethods: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/payment-methods  (admin)
    createPaymentMethod: async (req, res) => {
      if (!isAdmin(req)) return send.forbidden(res, "Admin access required");
      const { name, code, sort_order } = req.body;
      if (!name || !String(name).trim()) return send.bad(res, "Name is required");

      const finalCode = slugify(code || name);
      if (!finalCode) return send.bad(res, "Invalid code");

      try {
        const [result] = await db(req).query(
          "INSERT INTO payment_methods (code, name, sort_order) VALUES (?, ?, ?)",
          [finalCode, String(name).trim(), parseInt(sort_order) || 0]
        );
        const [rows] = await db(req).query("SELECT * FROM payment_methods WHERE id = ?", [result.insertId]);
        await logAudit(pool, req, {
          action: "payment_method.create",
          targetType: "payment_method",
          targetId: String(result.insertId),
          details: { code: finalCode, name },
        });
        return send.created(res, { paymentMethod: rows[0] });
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") return send.bad(res, "Payment method code already exists");
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/payment-methods/:id  (admin)
    updatePaymentMethod: async (req, res) => {
      if (!isAdmin(req)) return send.forbidden(res, "Admin access required");
      const { id } = req.params;
      const { name, is_active, sort_order } = req.body;

      try {
        const [existing] = await db(req).query("SELECT * FROM payment_methods WHERE id = ?", [id]);
        if (existing.length === 0) return send.notFound(res, "Payment method not found");

        const next = {
          name: name !== undefined ? String(name).trim() : existing[0].name,
          is_active: is_active !== undefined ? (is_active ? 1 : 0) : existing[0].is_active,
          sort_order: sort_order !== undefined ? parseInt(sort_order) || 0 : existing[0].sort_order,
        };

        await db(req).query(
          "UPDATE payment_methods SET name = ?, is_active = ?, sort_order = ? WHERE id = ?",
          [next.name, next.is_active, next.sort_order, id]
        );
        const [rows] = await db(req).query("SELECT * FROM payment_methods WHERE id = ?", [id]);
        await logAudit(pool, req, {
          action: "payment_method.update",
          targetType: "payment_method",
          targetId: String(id),
          details: next,
        });
        return send.ok(res, { paymentMethod: rows[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/payment-methods/:id  (admin)
    deletePaymentMethod: async (req, res) => {
      if (!isAdmin(req)) return send.forbidden(res, "Admin access required");
      const { id } = req.params;
      try {
        const [existing] = await db(req).query("SELECT * FROM payment_methods WHERE id = ?", [id]);
        if (existing.length === 0) return send.notFound(res, "Payment method not found");

        await db(req).query("DELETE FROM payment_methods WHERE id = ?", [id]);
        await logAudit(pool, req, {
          action: "payment_method.delete",
          targetType: "payment_method",
          targetId: String(id),
          details: { code: existing[0].code, name: existing[0].name },
        });
        return send.ok(res, { success: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
