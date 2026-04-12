import { validationResult } from "express-validator";
import { sendEmail, getAccentColor, ticketEmail } from "../utils/mailer.js";
import { logAudit } from "../utils/audit.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  created: (res, data = {}) => res.status(201).json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  unauthorized: (res, msg = "Unauthorized") => res.status(401).json({ error: msg }),
  forbidden: (res, msg = "Forbidden") => res.status(403).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

/**
 * Generate ticket ID: {teamId}-{terminalId}-{DDMMYYYY}-{sequence}
 * Example: 01-03-01042026-0001
 */
async function generateTicketId(instancePool, teamId, terminalId) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const dateStr = `${dd}${mm}${yyyy}`;
  const today = `${yyyy}-${mm}-${dd}`;
  const tid = String(teamId || '00').padStart(2, '0');

  await instancePool.query(
    `INSERT INTO ticket_counters (terminal_id, counter_date, last_seq)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE last_seq = last_seq + 1`,
    [terminalId, today]
  );

  const [rows] = await instancePool.query(
    `SELECT last_seq FROM ticket_counters WHERE terminal_id = ? AND counter_date = ?`,
    [terminalId, today]
  );

  const seq = String(rows[0].last_seq).padStart(4, '0');
  return `${tid}-${terminalId}-${dateStr}-${seq}`;
}

/** Common SELECT for booking queries — uses a function so we can qualify shared tables */
function bookingSelect() {
  return `
  SELECT
    b.*,
    b.passenger_gender,
    b.qr_code_data,
    b.boarded_at,
    b.boarded_by,
    b.custom_validity_days,
    b.notes,
    b.payment_method,
    pm.name AS payment_method_name,
    DATE_ADD(b.travel_date, INTERVAL COALESCE(b.custom_validity_days,
      (SELECT setting_value FROM \`${sharedDb}\`.system_settings WHERE setting_key = 'ticket_validity_days')
    ) DAY) AS valid_until,
    c.name  AS customer_name,
    c.email AS customer_email,
    c.phone AS customer_phone,
    c.gender AS customer_gender,
    r.source,
    r.destination,
    st.name AS service_type_name,
    st.vat_rate,
    v.name AS vessel_name,
    v.seat_capacity AS vessel_capacity,
    u.email AS booked_by_email,
    u.first_name AS booked_by_first_name,
    u.last_name AS booked_by_last_name,
    u.terminal_id AS booked_by_terminal,
    u.team_id AS booked_by_team_id,
    tm.name AS booked_by_team_name,
    tm.team_code AS booked_by_team_code,
    bu.email AS boarded_by_email
  FROM bookings b
  JOIN customers c     ON b.customer_id = c.id
  JOIN routes r        ON b.route_id = r.id
  JOIN service_types st ON r.service_type_id = st.id
  LEFT JOIN vessels v   ON b.vessel_id = v.id
  JOIN \`${sharedDb}\`.users u         ON b.booked_by = u.id
  LEFT JOIN \`${sharedDb}\`.teams tm   ON u.team_id = tm.id
  LEFT JOIN \`${sharedDb}\`.users bu   ON b.boarded_by = bu.id
  LEFT JOIN payment_methods pm ON pm.code = b.payment_method
`;
}

export function makeBookingController(pool) {
  // pool = shared DB (users, teams, settings, audit_logs)
  // req.instancePool = instance DB (bookings, routes, customers, vessels, etc.)
  // For queries that only touch instance tables, use db(req).
  // For queries that JOIN instance + shared tables, use db(req) with qualified shared table names.
  const db = (req) => req.instancePool || pool;

  return {
    // GET /api/bookings
    getBookings: async (req, res) => {
      try {
        const [rows] = await db(req).query(`${bookingSelect()} ORDER BY b.created_at DESC`);
        return send.ok(res, { bookings: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/bookings/:ticketId
    getBookingByTicketId: async (req, res) => {
      const { ticketId } = req.params;

      try {
        const [rows] = await db(req).query(
          `SELECT
            b.*,
            b.passenger_gender,
            b.qr_code_data,
            b.boarded_at,
            b.boarded_by,
            b.payment_method,
            pm.name AS payment_method_name,
            c.name  AS customer_name,
            c.email AS customer_email,
            c.phone AS customer_phone,
            c.gender AS customer_gender,
            r.source,
            r.destination,
            r.adult_price,
            r.student_price,
            r.child_price,
            r.infant_price,
            r.discount_enabled,
            r.discount_adult_price,
            r.discount_student_price,
            r.discount_child_price,
            r.discount_infant_price,
            st.name     AS service_type_name,
            st.vat_rate AS vat_rate,
            v.name      AS vessel_name,
            v.seat_capacity AS vessel_capacity,
            u.email     AS booked_by_email,
            u.first_name AS booked_by_first_name,
            u.last_name AS booked_by_last_name,
            u.terminal_id AS booked_by_terminal,
            bu.email    AS boarded_by_email
          FROM bookings b
          JOIN customers c      ON b.customer_id = c.id
          JOIN routes r         ON b.route_id = r.id
          JOIN service_types st ON r.service_type_id = st.id
          LEFT JOIN vessels v   ON b.vessel_id = v.id
          JOIN users u          ON b.booked_by = u.id
          LEFT JOIN users bu    ON b.boarded_by = bu.id
          LEFT JOIN payment_methods pm ON pm.code = b.payment_method
          WHERE b.ticket_id = ?`,
          [ticketId]
        );

        if (rows.length === 0) {
          return send.notFound(res, "Booking not found");
        }

        return send.ok(res, { booking: rows[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/bookings/reports
    getBookingReports: async (req, res) => {
      try {
        const [statsRows] = await db(req).query(`
          SELECT
            COUNT(*)               AS total_bookings,
            SUM(total_price)       AS total_revenue,
            COUNT(DISTINCT customer_id) AS unique_customers,
            AVG(total_price)       AS avg_booking_value
          FROM bookings
        `);

        const [statusRows] = await db(req).query(`
          SELECT status, COUNT(*) AS count
          FROM bookings
          GROUP BY status
        `);

        const [passengerRows] = await db(req).query(`
          SELECT passenger_type, COUNT(*) AS count, SUM(total_price) AS revenue
          FROM bookings
          GROUP BY passenger_type
        `);

        const [routeRows] = await db(req).query(`
          SELECT
            r.source,
            r.destination,
            st.name AS service_type,
            COUNT(b.id)      AS bookings_count,
            SUM(b.total_price) AS revenue
          FROM bookings b
          JOIN routes r         ON b.route_id = r.id
          JOIN service_types st ON r.service_type_id = st.id
          GROUP BY r.id, r.source, r.destination, st.name
          ORDER BY bookings_count DESC
        `);

        const [vesselRows] = await db(req).query(`
          SELECT
            v.name AS vessel_name,
            v.seat_capacity,
            COUNT(b.id) AS bookings_count,
            SUM(b.total_price) AS revenue
          FROM vessels v
          LEFT JOIN bookings b ON v.id = b.vessel_id
          GROUP BY v.id, v.name, v.seat_capacity
          ORDER BY bookings_count DESC
        `);

        const [recentRows] = await db(req).query(`
          SELECT
            DATE(b.created_at) AS booking_date,
            COUNT(*)           AS count,
            SUM(b.total_price) AS revenue
          FROM bookings b
          WHERE b.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
          GROUP BY DATE(b.created_at)
          ORDER BY booking_date DESC
        `);

        const [monthlyRows] = await db(req).query(`
          SELECT
            YEAR(b.created_at)    AS year,
            MONTH(b.created_at)   AS month,
            COUNT(*)              AS bookings,
            SUM(b.total_price)    AS revenue
          FROM bookings b
          WHERE b.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
          GROUP BY YEAR(b.created_at), MONTH(b.created_at)
          ORDER BY year DESC, month DESC
        `);

        // Boarding stats
        const [boardingRows] = await db(req).query(`
          SELECT
            COUNT(CASE WHEN status = 'boarded' THEN 1 END) AS boarded_count,
            COUNT(CASE WHEN status = 'confirmed' THEN 1 END) AS confirmed_count,
            COUNT(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled_count,
            COUNT(*) AS total
          FROM bookings
        `);

        // Payment method breakdown — LEFT JOIN so rows without a payment_method still count
        const [paymentMethodRows] = await db(req).query(`
          SELECT
            COALESCE(b.payment_method, 'unspecified') AS code,
            COALESCE(pm.name, 'Unspecified') AS name,
            COUNT(b.id) AS count,
            COALESCE(SUM(b.total_price), 0) AS revenue
          FROM bookings b
          LEFT JOIN payment_methods pm ON pm.code = b.payment_method
          GROUP BY COALESCE(b.payment_method, 'unspecified'), COALESCE(pm.name, 'Unspecified')
          ORDER BY revenue DESC
        `);

        return send.ok(res, {
          stats: statsRows[0],
          statusBreakdown: statusRows,
          passengerTypeBreakdown: passengerRows,
          routePerformance: routeRows,
          vesselPerformance: vesselRows,
          recentActivity: recentRows,
          monthlyRevenue: monthlyRows,
          boardingStats: boardingRows[0],
          paymentMethodBreakdown: paymentMethodRows,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/dashboard/stats
    getDashboardStats: async (req, res) => {
      try {
        const [todayBookings] = await db(req).query(`
          SELECT COUNT(*) AS count, COALESCE(SUM(total_price), 0) AS revenue
          FROM bookings WHERE DATE(created_at) = CURDATE()
        `);

        const [todayBoarded] = await db(req).query(`
          SELECT COUNT(*) AS count
          FROM bookings WHERE status = 'boarded' AND DATE(boarded_at) = CURDATE()
        `);

        const [totalStats] = await db(req).query(`
          SELECT
            COUNT(*) AS total_bookings,
            COALESCE(SUM(total_price), 0) AS total_revenue,
            COUNT(DISTINCT customer_id) AS unique_customers
          FROM bookings
        `);

        const [recentBookings] = await db(req).query(`
          ${bookingSelect()}
          ORDER BY b.created_at DESC LIMIT 5
        `);

        const [todayDepartures] = await db(req).query(`
          SELECT
            b.ticket_id, b.status, b.travel_date, b.passenger_type,
            c.name AS customer_name,
            r.source, r.destination,
            v.name AS vessel_name
          FROM bookings b
          JOIN customers c ON b.customer_id = c.id
          JOIN routes r ON b.route_id = r.id
          LEFT JOIN vessels v ON b.vessel_id = v.id
          WHERE b.travel_date = CURDATE() AND b.status != 'cancelled'
          ORDER BY b.created_at DESC
          LIMIT 20
        `);

        return send.ok(res, {
          today: {
            bookings: todayBookings[0].count,
            revenue: todayBookings[0].revenue,
            boarded: todayBoarded[0].count,
          },
          totals: totalStats[0],
          recentBookings: recentBookings,
          todayDepartures: todayDepartures,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/bookings/search
    searchBookings: async (req, res) => {
      const {
        q = "",
        status = "",
        date_from = "",
        date_to = "",
        route_id = "",
        vessel_id = "",
        page = 1,
        limit = 20,
      } = req.query;

      try {
        const conditions = [];
        const params = [];

        if (q.trim()) {
          conditions.push("(b.ticket_id LIKE ? OR c.name LIKE ? OR c.email LIKE ?)");
          const term = `%${q.trim()}%`;
          params.push(term, term, term);
        }

        if (status && status !== "all") {
          if (status === "expired") {
            conditions.push("b.travel_date < CURDATE() AND b.status = 'confirmed'");
          } else {
            conditions.push("b.status = ?");
            params.push(status);
          }
        }

        if (date_from) {
          conditions.push("b.travel_date >= ?");
          params.push(date_from);
        }
        if (date_to) {
          conditions.push("b.travel_date <= ?");
          params.push(date_to);
        }
        if (route_id) {
          conditions.push("b.route_id = ?");
          params.push(parseInt(route_id));
        }
        if (vessel_id) {
          conditions.push("b.vessel_id = ?");
          params.push(parseInt(vessel_id));
        }

        const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

        const [countResult] = await db(req).query(
          `SELECT COUNT(*) AS total
           FROM bookings b
           JOIN customers c ON b.customer_id = c.id
           ${where}`,
          params
        );

        const total = countResult[0].total;
        const pageNum = Math.max(1, parseInt(page));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
        const offset = (pageNum - 1) * limitNum;

        const [rows] = await db(req).query(
          `SELECT
            b.*,
            b.passenger_gender,
            b.qr_code_data,
            b.boarded_at,
            b.boarded_by,
            b.payment_method,
            pm.name AS payment_method_name,
            c.name AS customer_name,
            c.email AS customer_email,
            c.phone AS customer_phone,
            r.source,
            r.destination,
            st.name AS service_type_name,
            st.vat_rate,
            v.name AS vessel_name,
            v.seat_capacity AS vessel_capacity,
            u.email AS booked_by_email,
            bu.email AS boarded_by_email,
            CASE WHEN b.travel_date < CURDATE() AND b.status = 'confirmed' THEN 1 ELSE 0 END AS is_expired
          FROM bookings b
          JOIN customers c ON b.customer_id = c.id
          JOIN routes r ON b.route_id = r.id
          JOIN service_types st ON r.service_type_id = st.id
          LEFT JOIN vessels v ON b.vessel_id = v.id
          JOIN users u ON b.booked_by = u.id
          LEFT JOIN users bu ON b.boarded_by = bu.id
          LEFT JOIN payment_methods pm ON pm.code = b.payment_method
          ${where}
          ORDER BY b.created_at DESC
          LIMIT ? OFFSET ?`,
          [...params, limitNum, offset]
        );

        return send.ok(res, {
          bookings: rows,
          pagination: {
            total,
            page: pageNum,
            limit: limitNum,
            totalPages: Math.ceil(total / limitNum),
          },
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/bookings
    createBooking: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const {
        customer_name,
        customer_email,
        customer_phone,
        customer_gender,
        route_id,
        vessel_id,
        booking_type,
        passenger_type,
        travel_date,
        return_date,
        custom_validity_days,
        notes,
        payment_method,
      } = req.body;

      if (
        customer_gender &&
        !["male", "female"].includes(String(customer_gender).toLowerCase())
      ) {
        return send.bad(res, "Invalid gender (must be 'male' or 'female')");
      }

      try {
        await db(req).query("START TRANSACTION");

        const [routeRows] = await db(req).query(
          `SELECT
            r.*,
            st.vat_rate,
            r.discount_enabled,
            r.discount_adult_price,
            r.discount_student_price,
            r.discount_child_price,
            r.discount_infant_price
          FROM routes r
          JOIN service_types st ON r.service_type_id = st.id
          WHERE r.id = ?`,
          [route_id]
        );

        if (routeRows.length === 0) {
          await db(req).query("ROLLBACK");
          return send.bad(res, "Invalid route selected");
        }

        if (vessel_id) {
          const [vesselRows] = await db(req).query(
            "SELECT id, name, seat_capacity FROM vessels WHERE id = ?",
            [vessel_id]
          );
          if (vesselRows.length === 0) {
            await db(req).query("ROLLBACK");
            return send.bad(res, "Invalid vessel selected");
          }
        }

        const route = routeRows[0];

        const getEffectivePrice = (passengerType) => {
          if (route.discount_enabled) {
            switch (passengerType) {
              case "adult":   return parseFloat(route.discount_adult_price) || parseFloat(route.adult_price);
              case "student": return parseFloat(route.discount_student_price) || parseFloat(route.student_price);
              case "child":   return parseFloat(route.discount_child_price) || parseFloat(route.child_price);
              case "infant":  return parseFloat(route.discount_infant_price) || parseFloat(route.infant_price);
              default:        return 0;
            }
          } else {
            switch (passengerType) {
              case "adult":   return parseFloat(route.adult_price) || 0;
              case "student": return parseFloat(route.student_price) || 0;
              case "child":   return parseFloat(route.child_price) || 0;
              case "infant":  return parseFloat(route.infant_price) || 0;
              default:        return 0;
            }
          }
        };

        const totalPrice = getEffectivePrice(passenger_type);
        const vatRate = parseFloat(route.vat_rate) || 0;
        const basePrice = totalPrice / (1 + vatRate / 100);
        const vatAmount = totalPrice - basePrice;

        // Upsert/find customer
        let customerId;
        let existingCustomer = [];

        if (customer_email && customer_email.trim()) {
          const [emailMatch] = await db(req).query(
            "SELECT id FROM customers WHERE email = ?",
            [customer_email]
          );
          existingCustomer = emailMatch;
        }

        if (existingCustomer.length === 0 && customer_phone && customer_phone.trim()) {
          const [namePhoneMatch] = await db(req).query(
            "SELECT id FROM customers WHERE name = ? AND phone = ?",
            [customer_name, customer_phone]
          );
          existingCustomer = namePhoneMatch;
        }

        const genderValue = customer_gender ? String(customer_gender).toLowerCase() : null;

        if (existingCustomer.length > 0) {
          customerId = existingCustomer[0].id;
          await db(req).query(
            "UPDATE customers SET name = ?, email = ?, phone = ?, gender = ? WHERE id = ?",
            [customer_name, customer_email || null, customer_phone || null, genderValue, customerId]
          );
        } else {
          const [customerResult] = await db(req).query(
            "INSERT INTO customers (name, email, phone, gender) VALUES (?, ?, ?, ?)",
            [customer_name, customer_email || null, customer_phone || null, genderValue]
          );
          customerId = customerResult.insertId;
        }

        // Always read fresh terminal_id and team_code from DB (not stale JWT)
        const [userRow] = await db(req).query(
          "SELECT u.terminal_id, t.team_code FROM users u LEFT JOIN teams t ON u.team_id = t.id WHERE u.id = ?",
          [req.user.id]
        );
        const terminalId = userRow[0]?.terminal_id || '01';
        const teamCode = userRow[0]?.team_code || '00';
        const ticketId = await generateTicketId(db(req), teamCode, terminalId);

        // Generate QR code data (URL for verification)
        // QR contains only the ticket ID — scanner parses it directly, no URL exposed
        const qrCodeData = ticketId;

        // Validate payment_method (if provided) against active payment_methods
        let paymentMethodCode = null;
        if (payment_method) {
          const [pmRows] = await db(req).query(
            "SELECT code FROM payment_methods WHERE code = ? AND is_active = 1",
            [payment_method]
          );
          if (pmRows.length === 0) {
            await db(req).query("ROLLBACK");
            return send.bad(res, "Invalid or inactive payment method");
          }
          paymentMethodCode = pmRows[0].code;
        }

        const [bookingResult] = await db(req).query(
          `INSERT INTO bookings (
            ticket_id, customer_id, route_id, vessel_id, booking_type, passenger_type, passenger_gender,
            base_price, vat_amount, total_price, travel_date, return_date, custom_validity_days, notes, payment_method, qr_code_data, booked_by
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            ticketId,
            customerId,
            route_id,
            vessel_id || null,
            booking_type,
            passenger_type,
            genderValue,
            parseFloat(basePrice.toFixed(2)),
            parseFloat(vatAmount.toFixed(2)),
            parseFloat(totalPrice.toFixed(2)),
            travel_date,
            return_date || null,
            custom_validity_days || null,
            notes || null,
            paymentMethodCode,
            qrCodeData,
            req.user.id,
          ]
        );

        await db(req).query("COMMIT");

        const [newBooking] = await db(req).query(
          `${bookingSelect()} WHERE b.id = ?`,
          [bookingResult.insertId]
        );

        await logAudit(db(req), req, {
          action: "booking.create",
          targetType: "booking",
          targetId: ticketId,
          details: {
            customer_name: newBooking[0]?.customer_name,
            route: `${newBooking[0]?.source} → ${newBooking[0]?.destination}`,
            passenger_type,
            booking_type,
            total_price: parseFloat(totalPrice.toFixed(2)),
            payment_method: paymentMethodCode,
          },
        });
        return send.created(res, { booking: newBooking[0] });
      } catch (e) {
        await db(req).query("ROLLBACK");
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/bookings/:ticketId/status
    updateBookingStatus: async (req, res) => {
      const { ticketId } = req.params;
      const { status } = req.body;

      if (!["confirmed", "cancelled", "completed", "boarded", "invalidated"].includes(status)) {
        return send.bad(res, "Invalid status");
      }

      try {
        // Get the previous state for audit log
        const [prevRows] = await db(req).query("SELECT status FROM bookings WHERE ticket_id = ?", [ticketId]);
        const prevStatus = prevRows[0]?.status || null;

        const updateFields = ["status = ?"];
        const updateValues = [status];

        // If boarding, set boarded_at and boarded_by
        if (status === "boarded") {
          updateFields.push("boarded_at = NOW()");
          updateFields.push("boarded_by = ?");
          updateValues.push(req.user.id);
        }

        updateValues.push(ticketId);

        const [result] = await db(req).query(
          `UPDATE bookings SET ${updateFields.join(", ")} WHERE ticket_id = ?`,
          updateValues
        );

        if (result.affectedRows === 0) {
          return send.notFound(res, "Booking not found");
        }

        const [updated] = await db(req).query(
          `${bookingSelect()} WHERE b.ticket_id = ?`,
          [ticketId]
        );

        // Specific action names for better audit readability
        const actionMap = {
          cancelled: "booking.cancel",
          invalidated: "booking.invalidate",
          boarded: "booking.board",
          completed: "booking.complete",
          confirmed: "booking.reconfirm",
        };
        await logAudit(db(req), req, {
          action: actionMap[status] || "booking.status_change",
          targetType: "booking",
          targetId: ticketId,
          details: {
            from: prevStatus,
            to: status,
            customer: updated[0]?.customer_name,
            route: `${updated[0]?.source} → ${updated[0]?.destination}`,
          },
        });
        return send.ok(res, { booking: updated[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    getSalesReport: async (req, res) => {
      try {
        const { period, team_id, date_from, date_to, payment_method } = req.query;
        let dateFilter = "";
        if (period === "custom" && date_from && date_to) {
          // Sanitize dates (YYYY-MM-DD only)
          const safeFrom = String(date_from).replace(/[^0-9-]/g, "");
          const safeTo = String(date_to).replace(/[^0-9-]/g, "");
          dateFilter = `AND DATE(b.created_at) >= '${safeFrom}' AND DATE(b.created_at) <= '${safeTo}'`;
        } else if (period === "today") dateFilter = "AND DATE(b.created_at) = CURDATE()";
        else if (period === "week") dateFilter = "AND YEARWEEK(b.created_at, 1) = YEARWEEK(CURDATE(), 1)";
        else if (period === "month") dateFilter = "AND YEAR(b.created_at) = YEAR(CURDATE()) AND MONTH(b.created_at) = MONTH(CURDATE())";

        // Team filter — applies to all drill-down queries
        const teamId = team_id && team_id !== "null" ? parseInt(team_id) : null;
        const teamFilter = teamId !== null ? `AND u.team_id = ${teamId}` : "";

        // Payment method filter — when set, filters teams/agents/charts/totals
        const pmCode = payment_method && payment_method !== "null" && payment_method !== "all"
          ? String(payment_method).replace(/[^a-zA-Z0-9_-]/g, "")
          : null;
        const paymentFilter = pmCode ? `AND COALESCE(b.payment_method, 'unspecified') = '${pmCode}'` : "";

        // Agent filter
        const { agent_id } = req.query;
        const agentId = agent_id && agent_id !== "null" ? parseInt(agent_id) : null;
        const agentFilter = agentId !== null ? `AND b.booked_by = ${agentId}` : "";

        // byTeam — unfiltered by team (always shows all teams) but respects payment + agent filter
        const [byTeam] = await db(req).query(`
          SELECT t.id as team_id, t.name as team_name, t.color, t.team_code,
            COUNT(b.id) as bookings, COALESCE(SUM(b.total_price),0) as revenue
          FROM bookings b
          JOIN users u ON b.booked_by = u.id
          LEFT JOIN teams t ON u.team_id = t.id
          WHERE 1=1 ${dateFilter} ${paymentFilter} ${agentFilter}
          GROUP BY t.id ORDER BY revenue DESC
        `);

        const [byTerminal] = await db(req).query(`
          SELECT u.terminal_id, CONCAT(u.first_name,' ',COALESCE(u.last_name,'')) as agent_name,
            COUNT(b.id) as bookings, COALESCE(SUM(b.total_price),0) as revenue
          FROM bookings b
          JOIN users u ON b.booked_by = u.id
          WHERE 1=1 ${dateFilter} ${teamFilter} ${paymentFilter} ${agentFilter}
          GROUP BY u.terminal_id, u.id ORDER BY revenue DESC
        `);

        const [totals] = await db(req).query(`
          SELECT COUNT(b.id) as total_bookings, COALESCE(SUM(b.total_price),0) as total_revenue
          FROM bookings b
          JOIN users u ON b.booked_by = u.id
          WHERE 1=1 ${dateFilter} ${teamFilter} ${paymentFilter} ${agentFilter}
        `);

        // Agents — unfiltered by agent (always shows all agents) but respects team + payment filter
        const [agents] = await db(req).query(`
          SELECT u.id as user_id, u.first_name, u.last_name, u.terminal_id, u.role,
            t.id as team_id, t.name as team_name, t.color as team_color,
            COUNT(b.id) as bookings, COALESCE(SUM(b.total_price),0) as revenue
          FROM bookings b
          JOIN users u ON b.booked_by = u.id
          LEFT JOIN teams t ON u.team_id = t.id
          WHERE 1=1 ${dateFilter} ${teamFilter} ${paymentFilter}
          GROUP BY u.id ORDER BY revenue DESC
        `);

        // Daily revenue for chart
        let chartFilter = dateFilter;
        if (!chartFilter) chartFilter = "AND b.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)";
        const [dailyRevenue] = await db(req).query(`
          SELECT DATE(b.created_at) as date, COUNT(b.id) as bookings, COALESCE(SUM(b.total_price),0) as revenue
          FROM bookings b
          JOIN users u ON b.booked_by = u.id
          WHERE 1=1 ${chartFilter} ${teamFilter} ${paymentFilter} ${agentFilter}
          GROUP BY DATE(b.created_at) ORDER BY date ASC
        `);

        // Status breakdown
        const [statusBreakdown] = await db(req).query(`
          SELECT b.status, COUNT(b.id) as count, COALESCE(SUM(b.total_price),0) as revenue
          FROM bookings b
          JOIN users u ON b.booked_by = u.id
          WHERE 1=1 ${dateFilter} ${teamFilter} ${paymentFilter} ${agentFilter}
          GROUP BY b.status
        `);

        // Payment method breakdown — unfiltered by payment (always shows all methods) but respects team + agent filter
        const [byPaymentMethod] = await db(req).query(`
          SELECT
            COALESCE(b.payment_method, 'unspecified') AS code,
            COALESCE(pm.name, 'Unspecified') AS name,
            COUNT(b.id) as count,
            COALESCE(SUM(b.total_price), 0) as revenue
          FROM bookings b
          JOIN users u ON b.booked_by = u.id
          LEFT JOIN payment_methods pm ON pm.code = b.payment_method
          WHERE 1=1 ${dateFilter} ${teamFilter} ${agentFilter}
          GROUP BY COALESCE(b.payment_method, 'unspecified'), COALESCE(pm.name, 'Unspecified')
          ORDER BY revenue DESC
        `);

        return send.ok(res, { byTeam, byTerminal, agents, dailyRevenue, statusBreakdown, byPaymentMethod, totals: totals[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    getValidationReport: async (req, res) => {
      try {
        // Scans by dock officer
        const [byOfficer] = await db(req).query(`
          SELECT u.id as user_id, u.first_name, u.last_name, u.terminal_id,
            COUNT(ts.id) as total_scans,
            SUM(CASE WHEN ts.scan_result = 'valid' THEN 1 ELSE 0 END) as valid_scans,
            MAX(ts.scanned_at) as last_scan
          FROM ticket_scans ts
          JOIN users u ON ts.scanned_by = u.id
          GROUP BY u.id ORDER BY total_scans DESC
        `);

        // Time-based counts
        const [weekScans] = await db(req).query(`SELECT COUNT(*) as count FROM ticket_scans WHERE scanned_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`);
        const [monthScans] = await db(req).query(`SELECT COUNT(*) as count FROM ticket_scans WHERE scanned_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`);

        // Ticket status counts
        const [statusCounts] = await db(req).query(`
          SELECT
            SUM(CASE WHEN status = 'boarded' THEN 1 ELSE 0 END) as boarded,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as pending,
            SUM(CASE WHEN status = 'invalidated' THEN 1 ELSE 0 END) as invalidated,
            SUM(CASE WHEN status = 'confirmed' AND DATE_ADD(travel_date, INTERVAL COALESCE(custom_validity_days, (SELECT setting_value FROM system_settings WHERE setting_key = 'ticket_validity_days')) DAY) < NOW() THEN 1 ELSE 0 END) as expired,
            COUNT(*) as total
          FROM bookings
        `);

        return send.ok(res, {
          byOfficer,
          weekScans: weekScans[0].count,
          monthScans: monthScans[0].count,
          statusCounts: statusCounts[0],
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    emailTickets: async (req, res) => {
      const { ticket_ids, email } = req.body;
      if (!ticket_ids || !Array.isArray(ticket_ids) || ticket_ids.length === 0) {
        return send.bad(res, "ticket_ids array is required");
      }

      try {
        const accent = await getAccentColor(pool);
        let sent = 0, failed = 0;

        for (const ticketId of ticket_ids) {
          try {
            const [rows] = await db(req).query(
              `${bookingSelect()} WHERE b.ticket_id = ?`,
              [ticketId]
            );
            if (rows.length === 0) { failed++; continue; }

            const ticket = rows[0];
            const targetEmail = email || ticket.customer_email;
            if (!targetEmail) { failed++; continue; }

            await sendEmail(pool, {
              to: targetEmail,
              subject: `Your Ticket: ${ticket.source} → ${ticket.destination} - ${ticket.ticket_id}`,
              html: ticketEmail({ ticket, accent }),
            });
            sent++;
          } catch (e) {
            console.error(`Failed to email ticket ${ticketId}:`, e.message);
            failed++;
          }
        }

        await logAudit(db(req), req, {
          action: "booking.email_tickets",
          targetType: "booking",
          targetId: ticket_ids.join(","),
          details: { sent, failed, total: ticket_ids.length, email: email || "per_passenger" },
        });
        return send.ok(res, { sent, failed, total: ticket_ids.length });
      } catch (e) {
        console.error("Email tickets error:", e);
        return send.serverErr(res, e.message || "Failed to send ticket emails");
      }
    },
  };
}
