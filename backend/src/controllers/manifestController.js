import { validationResult } from "express-validator";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  forbidden: (res, msg = "Forbidden") => res.status(403).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

/** Factory — pool is the shared DB; instance-specific data uses req.instancePool */
export function makeManifestController(pool) {
  const db = (req) => req.instancePool || pool;

  // Common SELECT joining route + vessel + computed booked_count
  const departureSelect = `
    SELECT
      d.*,
      r.source, r.destination,
      v.name AS vessel_name, v.seat_capacity,
      st.name AS service_type_name,
      (SELECT COUNT(*) FROM bookings b WHERE b.departure_id = d.id AND b.status != 'cancelled') AS booked_count,
      (SELECT COUNT(*) FROM bookings b WHERE b.departure_id = d.id AND b.status = 'boarded') AS boarded_count,
      cu.first_name AS completed_by_first_name,
      cu.last_name  AS completed_by_last_name,
      cu.email      AS completed_by_email
    FROM departures d
    JOIN routes r        ON d.route_id = r.id
    JOIN vessels v       ON d.vessel_id = v.id
    JOIN service_types st ON r.service_type_id = st.id
    LEFT JOIN users cu   ON d.completed_by = cu.id
  `;

  return {
    // GET /api/departures?date_from=&date_to=&route_id=&vessel_id=&status=
    listDepartures: async (req, res) => {
      try {
        const { date_from, date_to, route_id, vessel_id, status } = req.query;
        const conditions = [];
        const params = [];
        if (date_from) { conditions.push("d.departure_date >= ?"); params.push(date_from); }
        if (date_to)   { conditions.push("d.departure_date <= ?"); params.push(date_to); }
        if (route_id)  { conditions.push("d.route_id = ?");        params.push(parseInt(route_id)); }
        if (vessel_id) { conditions.push("d.vessel_id = ?");       params.push(parseInt(vessel_id)); }
        if (status)    { conditions.push("d.status = ?");          params.push(status); }
        const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
        const [rows] = await db(req).query(
          `${departureSelect} ${where} ORDER BY d.departure_date ASC, d.departure_time ASC`,
          params
        );
        return send.ok(res, { departures: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/departures/:id
    getDeparture: async (req, res) => {
      try {
        const [rows] = await db(req).query(`${departureSelect} WHERE d.id = ?`, [req.params.id]);
        if (rows.length === 0) return send.notFound(res, "Departure not found");
        return send.ok(res, { departure: rows[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/departures
    createDeparture: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);
      const { route_id, vessel_id, departure_date, departure_time, notes } = req.body;
      try {
        const [result] = await db(req).query(
          "INSERT INTO departures (route_id, vessel_id, departure_date, departure_time, notes) VALUES (?, ?, ?, ?, ?)",
          [route_id, vessel_id, departure_date, departure_time, notes || null]
        );
        const [rows] = await db(req).query(`${departureSelect} WHERE d.id = ?`, [result.insertId]);
        return send.created(res, { departure: rows[0] });
      } catch (e) {
        if (e.code === "ER_DUP_ENTRY") return send.bad(res, "A departure already exists for that route, vessel, date and time");
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/departures/bulk
    // Body: { route_id, vessel_id, days_of_week:[0..6], departure_time, start_date, end_date, notes? }
    bulkCreateDepartures: async (req, res) => {
      const { route_id, vessel_id, days_of_week, departure_time, start_date, end_date, notes } = req.body;
      if (!route_id || !vessel_id || !departure_time || !start_date || !end_date)
        return send.bad(res, "route_id, vessel_id, departure_time, start_date, end_date required");
      if (!Array.isArray(days_of_week) || days_of_week.length === 0)
        return send.bad(res, "days_of_week must be a non-empty array (0=Sun..6=Sat)");

      try {
        const start = new Date(start_date + "T00:00:00Z");
        const end = new Date(end_date + "T00:00:00Z");
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start)
          return send.bad(res, "Invalid date range");

        const dowSet = new Set(days_of_week.map((d) => parseInt(d, 10)));
        const dates = [];
        const cursor = new Date(start);
        let safety = 0;
        while (cursor <= end && safety < 365 * 2) {
          if (dowSet.has(cursor.getUTCDay())) {
            dates.push(cursor.toISOString().slice(0, 10));
          }
          cursor.setUTCDate(cursor.getUTCDate() + 1);
          safety++;
        }

        let inserted = 0;
        let skipped = 0;
        for (const d of dates) {
          try {
            const [r] = await db(req).query(
              "INSERT IGNORE INTO departures (route_id, vessel_id, departure_date, departure_time, notes) VALUES (?, ?, ?, ?, ?)",
              [route_id, vessel_id, d, departure_time, notes || null]
            );
            if (r.affectedRows > 0) inserted++; else skipped++;
          } catch {
            skipped++;
          }
        }
        return send.created(res, { inserted, skipped, total: dates.length });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/departures/:id
    updateDeparture: async (req, res) => {
      const { id } = req.params;
      const allowed = ["route_id", "vessel_id", "departure_date", "departure_time", "status", "actual_departure_time", "notes"];
      const fields = [];
      const params = [];
      for (const key of allowed) {
        if (req.body[key] !== undefined) {
          fields.push(`${key} = ?`);
          params.push(req.body[key]);
        }
      }
      if (fields.length === 0) return send.bad(res, "No fields to update");
      params.push(id);
      try {
        const [result] = await db(req).query(`UPDATE departures SET ${fields.join(", ")} WHERE id = ?`, params);
        if (result.affectedRows === 0) return send.notFound(res, "Departure not found");
        const [rows] = await db(req).query(`${departureSelect} WHERE d.id = ?`, [id]);
        return send.ok(res, { departure: rows[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/departures/:id/complete
    completeDeparture: async (req, res) => {
      const { id } = req.params;
      const { actual_departure_time, notes } = req.body;
      try {
        const [exists] = await db(req).query("SELECT id, status FROM departures WHERE id = ?", [id]);
        if (exists.length === 0) return send.notFound(res, "Departure not found");
        if (exists[0].status === "completed") return send.bad(res, "Departure is already completed");

        await db(req).query(
          `UPDATE departures
             SET status = 'completed',
                 completed_at = CURRENT_TIMESTAMP,
                 completed_by = ?,
                 actual_departure_time = ?,
                 notes = COALESCE(?, notes)
           WHERE id = ?`,
          [req.user.id, actual_departure_time || null, notes || null, id]
        );
        const [rows] = await db(req).query(`${departureSelect} WHERE d.id = ?`, [id]);
        return send.ok(res, { departure: rows[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/departures/:id (only if no bookings)
    deleteDeparture: async (req, res) => {
      const { id } = req.params;
      try {
        const [bookCount] = await db(req).query(
          "SELECT COUNT(*) AS c FROM bookings WHERE departure_id = ?",
          [id]
        );
        if (bookCount[0].c > 0)
          return send.bad(res, "Departure has bookings — cancel it instead, or reassign bookings first.");
        const [result] = await db(req).query("DELETE FROM departures WHERE id = ?", [id]);
        if (result.affectedRows === 0) return send.notFound(res, "Departure not found");
        return send.ok(res, { message: "Departure deleted" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/departures/:id/manifest — literal manifest
    // Includes:
    //   1) bookings explicitly tied to this departure (departure_id = id)
    //   2) "orphan" bookings on the same route + same travel_date that have NO departure_id
    //      (so the manifest still picks them up when no slot was selected during booking)
    getLiteralManifest: async (req, res) => {
      const { id } = req.params;
      try {
        const [depRows] = await db(req).query(`${departureSelect} WHERE d.id = ?`, [id]);
        if (depRows.length === 0) return send.notFound(res, "Departure not found");
        const dep = depRows[0];
        const [bookings] = await db(req).query(
          `SELECT
             b.id, b.ticket_id, b.passenger_type, b.tier, b.status, b.total_price,
             b.travel_date, b.boarded_at, b.passenger_gender, b.departure_id,
             c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
           FROM bookings b
           JOIN customers c ON b.customer_id = c.id
           WHERE b.status != 'cancelled'
             AND (
               b.departure_id = ?
               OR (b.departure_id IS NULL AND b.route_id = ? AND b.travel_date = ?)
             )
           ORDER BY b.status DESC, b.created_at ASC`,
          [id, dep.route_id, dep.departure_date]
        );
        return send.ok(res, { departure: dep, bookings });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/departures/:id/projected — projected manifest
    getProjectedManifest: async (req, res) => {
      const { id } = req.params;
      try {
        const [depRows] = await db(req).query(`${departureSelect} WHERE d.id = ?`, [id]);
        if (depRows.length === 0) return send.notFound(res, "Departure not found");
        const departure = depRows[0];

        // Bookings on the same route whose validity window covers departure_date,
        // who haven't already boarded and aren't cancelled.
        // Includes bookings with departure_id matching (literal) OR null (no slot picked).
        const [bookings] = await db(req).query(
          `SELECT
             b.id, b.ticket_id, b.passenger_type, b.tier, b.status, b.total_price,
             b.travel_date, b.boarded_at, b.passenger_gender, b.departure_id,
             b.custom_validity_days,
             c.name AS customer_name, c.email AS customer_email, c.phone AS customer_phone
           FROM bookings b
           JOIN customers c ON b.customer_id = c.id
           WHERE b.route_id = ?
             AND b.status IN ('confirmed','completed')
             AND b.travel_date <= ?
             AND DATE_ADD(
               b.travel_date,
               INTERVAL COALESCE(
                 b.custom_validity_days,
                 CAST((SELECT setting_value FROM system_settings WHERE setting_key='ticket_validity_days') AS UNSIGNED)
               ) DAY
             ) >= ?
           ORDER BY b.travel_date ASC, b.created_at ASC`,
          [departure.route_id, departure.departure_date, departure.departure_date]
        );
        return send.ok(res, { departure, bookings });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/departures/:id/report — pre/post-trip summary
    getTripReport: async (req, res) => {
      const { id } = req.params;
      try {
        const [depRows] = await db(req).query(`${departureSelect} WHERE d.id = ?`, [id]);
        if (depRows.length === 0) return send.notFound(res, "Departure not found");
        const departure = depRows[0];

        // Literal: all non-cancelled bookings tied to this departure
        const [literalRows] = await db(req).query(
          `SELECT b.id, b.ticket_id, b.passenger_type, b.tier, b.status, b.total_price,
                  b.boarded_at, c.name AS customer_name
           FROM bookings b
           JOIN customers c ON b.customer_id = c.id
           WHERE b.departure_id = ? AND b.status != 'cancelled'
           ORDER BY b.status DESC, b.created_at ASC`,
          [id]
        );
        const totalExpected = literalRows.length;
        const boarded = literalRows.filter((b) => b.status === "boarded");
        const noShows = literalRows.filter((b) => b.status !== "boarded");
        const revenue = boarded.reduce((sum, b) => sum + parseFloat(b.total_price || 0), 0);
        const tierBreakdown = boarded.reduce(
          (acc, b) => {
            acc[b.tier === "first_class" ? "first_class" : "economy"]++;
            return acc;
          },
          { economy: 0, first_class: 0 }
        );

        return send.ok(res, {
          departure,
          summary: {
            expected: totalExpected,
            boarded: boarded.length,
            no_shows: noShows.length,
            revenue: parseFloat(revenue.toFixed(2)),
            tier_breakdown: tierBreakdown,
            capacity: departure.seat_capacity,
            occupancy_pct: departure.seat_capacity > 0
              ? Math.round((boarded.length / departure.seat_capacity) * 100)
              : 0,
          },
          boarded,
          no_shows: noShows,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
