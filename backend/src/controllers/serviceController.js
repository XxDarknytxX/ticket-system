import { validationResult } from "express-validator";

/** Local response helpers */
const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  unauthorized: (res, msg = "Unauthorized") => res.status(401).json({ error: msg }),
  forbidden: (res, msg = "Forbidden") => res.status(403).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

/** Factory — pool is the shared DB; instance-specific data uses req.instancePool */
export function makeServiceController(pool) {
  const db = (req) => req.instancePool || pool;

  return {
    // GET /api/service-types
    getServiceTypes: async (req, res) => {
      try {
        const [rows] = await db(req).query(
          "SELECT * FROM service_types ORDER BY created_at DESC"
        );
        return send.ok(res, { serviceTypes: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/service-types (admin only)
    createServiceType: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { name, description, vat_rate = 12.5 } = req.body;
      try {
        const [result] = await db(req).query(
          "INSERT INTO service_types (name, description, vat_rate) VALUES (?, ?, ?)",
          [name, description, vat_rate]
        );

        const [newServiceType] = await db(req).query(
          "SELECT * FROM service_types WHERE id = ?",
          [result.insertId]
        );

        return send.created(res, { serviceType: newServiceType[0] });
      } catch (e) {
        console.error(e);
        if (e.code === "ER_DUP_ENTRY") {
          return send.bad(res, "Service type with this name already exists");
        }
        return send.serverErr(res);
      }
    },

    // PUT /api/service-types/:id (admin only)
    updateServiceType: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;
      const { name, description, vat_rate } = req.body;

      try {
        const [result] = await db(req).query(
          "UPDATE service_types SET name = ?, description = ?, vat_rate = ? WHERE id = ?",
          [name, description, vat_rate, id]
        );

        if (result.affectedRows === 0) {
          return send.notFound(res, "Service type not found");
        }

        const [updated] = await db(req).query(
          "SELECT * FROM service_types WHERE id = ?",
          [id]
        );

        return send.ok(res, { serviceType: updated[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ============================================================================
    // VESSEL MANAGEMENT
    // ============================================================================

    // GET /api/vessels?status=active  (status optional — 'active' returns only active vessels)
    getVessels: async (req, res) => {
      try {
        const { status } = req.query;
        const allowed = new Set(["active", "in_repair", "retired"]);
        let sql = "SELECT * FROM vessels";
        const params = [];
        if (status && allowed.has(status)) {
          sql += " WHERE status = ?";
          params.push(status);
        }
        sql += " ORDER BY name ASC";
        const [rows] = await db(req).query(sql, params);
        return send.ok(res, { vessels: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/vessels (admin only)
    createVessel: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { name, seat_capacity, description, status } = req.body;
      const allowed = new Set(["active", "in_repair", "retired"]);
      const finalStatus = status && allowed.has(status) ? status : "active";
      try {
        const [result] = await db(req).query(
          "INSERT INTO vessels (name, seat_capacity, description, status) VALUES (?, ?, ?, ?)",
          [name, seat_capacity, description || null, finalStatus]
        );

        const [newVessel] = await db(req).query(
          "SELECT * FROM vessels WHERE id = ?",
          [result.insertId]
        );

        return send.created(res, { vessel: newVessel[0] });
      } catch (e) {
        console.error(e);
        if (e.code === "ER_DUP_ENTRY") {
          return send.bad(res, "Vessel with this name already exists");
        }
        return send.serverErr(res);
      }
    },

    // PUT /api/vessels/:id (admin only)
    updateVessel: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;
      const { name, seat_capacity, description, status } = req.body;
      const allowed = new Set(["active", "in_repair", "retired"]);

      try {
        // Build dynamic update to allow status-only patches
        const fields = [];
        const params = [];
        if (name !== undefined) { fields.push("name = ?"); params.push(name); }
        if (seat_capacity !== undefined) { fields.push("seat_capacity = ?"); params.push(seat_capacity); }
        if (description !== undefined) { fields.push("description = ?"); params.push(description || null); }
        if (status !== undefined && allowed.has(status)) { fields.push("status = ?"); params.push(status); }

        if (fields.length === 0) {
          return send.bad(res, "No fields to update");
        }
        params.push(id);

        const [result] = await db(req).query(
          `UPDATE vessels SET ${fields.join(", ")} WHERE id = ?`,
          params
        );

        if (result.affectedRows === 0) {
          return send.notFound(res, "Vessel not found");
        }

        const [updated] = await db(req).query(
          "SELECT * FROM vessels WHERE id = ?",
          [id]
        );

        return send.ok(res, { vessel: updated[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/vessels/:id (admin only)
    deleteVessel: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;

      try {
        // Check if vessel is being used in any bookings
        const [bookingsCheck] = await db(req).query(
          "SELECT COUNT(*) as count FROM bookings WHERE vessel_id = ?",
          [id]
        );

        if (bookingsCheck[0].count > 0) {
          return send.bad(res, 
            "Cannot delete vessel with existing bookings. Please reassign bookings first."
          );
        }

        const [result] = await db(req).query("DELETE FROM vessels WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
          return send.notFound(res, "Vessel not found");
        }

        return send.ok(res, { message: "Vessel deleted successfully" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ============================================================================
    // ROUTE MANAGEMENT (existing code)
    // ============================================================================

    // GET /api/routes
    getRoutes: async (req, res) => {
      const { service_type_id } = req.query;

      try {
        let query = `
          SELECT r.*, st.name as service_type_name, st.vat_rate 
          FROM routes r 
          JOIN service_types st ON r.service_type_id = st.id
        `;
        const params = [];

        if (service_type_id) {
          query += " WHERE r.service_type_id = ?";
          params.push(service_type_id);
        }

        query += " ORDER BY r.source, r.destination";

        const [rows] = await db(req).query(query, params);
        return send.ok(res, { routes: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/routes (admin only)
    createRoute: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const {
        service_type_id,
        source,
        destination,
        adult_price,
        student_price,
        child_price,
        infant_price = 0,
      } = req.body;

      try {
        const [result] = await db(req).query(
          "INSERT INTO routes (service_type_id, source, destination, adult_price, student_price, child_price, infant_price) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [
            service_type_id,
            source,
            destination,
            adult_price,
            student_price,
            child_price,
            infant_price,
          ]
        );

        const [newRoute] = await db(req).query(
          `
          SELECT r.*, st.name as service_type_name, st.vat_rate 
          FROM routes r 
          JOIN service_types st ON r.service_type_id = st.id 
          WHERE r.id = ?
        `,
          [result.insertId]
        );

        return send.created(res, { route: newRoute[0] });
      } catch (e) {
        console.error(e);
        if (e.code === "ER_DUP_ENTRY") {
          return send.bad(res, "Route between these locations already exists");
        }
        return send.serverErr(res);
      }
    },

    // PUT /api/routes/:id (admin only)
    updateRoute: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;
      const { source, destination, adult_price, student_price, child_price, infant_price } =
        req.body;

      try {
        const [result] = await db(req).query(
          "UPDATE routes SET source = ?, destination = ?, adult_price = ?, student_price = ?, child_price = ?, infant_price = ? WHERE id = ?",
          [source, destination, adult_price, student_price, child_price, infant_price, id]
        );

        if (result.affectedRows === 0) {
          return send.notFound(res, "Route not found");
        }

        const [updated] = await db(req).query(
          `
          SELECT r.*, st.name as service_type_name, st.vat_rate 
          FROM routes r 
          JOIN service_types st ON r.service_type_id = st.id 
          WHERE r.id = ?
        `,
          [id]
        );

        return send.ok(res, { route: updated[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/routes/:id/discount (admin only)
    updateRouteDiscount: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;
      const { 
        discount_enabled,
        discount_adult_price = 0,
        discount_student_price = 0,
        discount_child_price = 0,
        discount_infant_price = 0
      } = req.body;

      try {
        const [result] = await db(req).query(
          `UPDATE routes SET 
           discount_enabled = ?, 
           discount_adult_price = ?, 
           discount_student_price = ?, 
           discount_child_price = ?, 
           discount_infant_price = ? 
           WHERE id = ?`,
          [
            discount_enabled,
            discount_adult_price,
            discount_student_price,
            discount_child_price,
            discount_infant_price,
            id
          ]
        );

        if (result.affectedRows === 0) {
          return send.notFound(res, "Route not found");
        }

        const [updated] = await db(req).query(
          `
          SELECT r.*, st.name as service_type_name, st.vat_rate 
          FROM routes r 
          JOIN service_types st ON r.service_type_id = st.id 
          WHERE r.id = ?
        `,
          [id]
        );

        return send.ok(res, { route: updated[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/routes/:id/first-class (admin only)
    updateRouteFirstClass: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;
      const {
        first_class_enabled,
        first_class_adult_price = 0,
        first_class_student_price = 0,
        first_class_child_price = 0,
        first_class_infant_price = 0,
        first_class_discount_enabled = false,
        first_class_discount_adult_price = 0,
        first_class_discount_student_price = 0,
        first_class_discount_child_price = 0,
        first_class_discount_infant_price = 0,
      } = req.body;

      try {
        const [result] = await db(req).query(
          `UPDATE routes SET
            first_class_enabled = ?,
            first_class_adult_price = ?,
            first_class_student_price = ?,
            first_class_child_price = ?,
            first_class_infant_price = ?,
            first_class_discount_enabled = ?,
            first_class_discount_adult_price = ?,
            first_class_discount_student_price = ?,
            first_class_discount_child_price = ?,
            first_class_discount_infant_price = ?
           WHERE id = ?`,
          [
            first_class_enabled ? 1 : 0,
            first_class_adult_price,
            first_class_student_price,
            first_class_child_price,
            first_class_infant_price,
            first_class_discount_enabled ? 1 : 0,
            first_class_discount_adult_price,
            first_class_discount_student_price,
            first_class_discount_child_price,
            first_class_discount_infant_price,
            id,
          ]
        );

        if (result.affectedRows === 0) {
          return send.notFound(res, "Route not found");
        }

        const [updated] = await db(req).query(
          `SELECT r.*, st.name as service_type_name, st.vat_rate
           FROM routes r JOIN service_types st ON r.service_type_id = st.id
           WHERE r.id = ?`,
          [id]
        );

        return send.ok(res, { route: updated[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/routes/:id (admin only)
    deleteRoute: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;

      try {
        const [result] = await db(req).query("DELETE FROM routes WHERE id = ?", [id]);

        if (result.affectedRows === 0) {
          return send.notFound(res, "Route not found");
        }

        return send.ok(res, { message: "Route deleted successfully" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}