/** Scan Controller - QR ticket verification and boarding */
import { logAudit } from "../utils/audit.js";

const send = {
  ok: (res, data = {}) => res.json(data),
  bad: (res, msg = "Bad request") => res.status(400).json({ error: msg }),
  notFound: (res, msg = "Not found") => res.status(404).json({ error: msg }),
  serverErr: (res, msg = "Internal server error") => res.status(500).json({ error: msg }),
};

export function makeScanController(pool) {
  const db = (req) => req.instancePool || pool;

  return {
    // GET /api/tickets/:ticketId/verify
    verifyTicket: async (req, res) => {
      const { ticketId } = req.params;

      try {
        const [rows] = await db(req).query(
          `SELECT
            b.*,
            b.passenger_gender,
            b.qr_code_data,
            b.boarded_at,
            b.custom_validity_days,
            DATE_ADD(b.travel_date, INTERVAL COALESCE(b.custom_validity_days,
              (SELECT setting_value FROM system_settings WHERE setting_key = 'ticket_validity_days')
            ) DAY) AS valid_until,
            c.name AS customer_name,
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
            bu.email AS boarded_by_email
          FROM bookings b
          JOIN customers c ON b.customer_id = c.id
          JOIN routes r ON b.route_id = r.id
          JOIN service_types st ON r.service_type_id = st.id
          LEFT JOIN vessels v ON b.vessel_id = v.id
          JOIN users u ON b.booked_by = u.id
          LEFT JOIN users bu ON b.boarded_by = bu.id
          WHERE b.ticket_id = ?`,
          [ticketId]
        );

        if (rows.length === 0) {
          return send.notFound(res, "Ticket not found");
        }

        const booking = rows[0];

        let scanStatus = "valid";
        if (booking.status === "boarded") scanStatus = "already_boarded";
        else if (booking.status === "cancelled") scanStatus = "cancelled";
        else if (booking.valid_until && new Date() > new Date(booking.valid_until)) scanStatus = "expired";

        return send.ok(res, {
          ticket: booking,
          scanStatus,
          canBoard: (booking.status === "confirmed" || booking.status === "completed") && scanStatus !== "expired",
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/tickets/:ticketId/board
    boardPassenger: async (req, res) => {
      const { ticketId } = req.params;

      try {
        // Get current booking
        const [rows] = await db(req).query(
          `SELECT b.*, c.name AS customer_name
           FROM bookings b
           JOIN customers c ON b.customer_id = c.id
           WHERE b.ticket_id = ?`,
          [ticketId]
        );

        if (rows.length === 0) {
          // Log scan attempt for not found
          return send.notFound(res, "Ticket not found");
        }

        const booking = rows[0];

        // Determine scan result
        let scanResult;
        if (booking.status === "boarded") {
          scanResult = "already_boarded";
        } else if (booking.status === "cancelled") {
          scanResult = "cancelled";
        } else {
          scanResult = "valid";
        }

        // Log the scan
        await db(req).query(
          `INSERT INTO ticket_scans (booking_id, scanned_by, scan_result) VALUES (?, ?, ?)`,
          [booking.id, req.user.id, scanResult]
        );
        await logAudit(db(req), req, {
          action: `ticket.scan.${scanResult}`,
          targetType: "booking",
          targetId: ticketId,
          details: { booking_id: booking.id, scan_result: scanResult, status: booking.status },
        });

        // If already boarded or cancelled, return info but don't change status
        if (scanResult !== "valid") {
          const [updated] = await db(req).query(
            `SELECT b.*, b.boarded_at, c.name AS customer_name,
                    bu.email AS boarded_by_email
             FROM bookings b
             JOIN customers c ON b.customer_id = c.id
             LEFT JOIN users bu ON b.boarded_by = bu.id
             WHERE b.ticket_id = ?`,
            [ticketId]
          );

          return send.ok(res, {
            scanResult,
            message:
              scanResult === "already_boarded"
                ? `Already boarded at ${booking.boarded_at}`
                : "Ticket is cancelled",
            ticket: updated[0],
          });
        }

        // Board the passenger
        await db(req).query(
          `UPDATE bookings SET status = 'boarded', boarded_at = NOW(), boarded_by = ? WHERE ticket_id = ?`,
          [req.user.id, ticketId]
        );

        // Return updated ticket
        const [updated] = await db(req).query(
          `SELECT
            b.*,
            b.passenger_gender,
            b.qr_code_data,
            b.boarded_at,
            c.name AS customer_name,
            c.email AS customer_email,
            c.phone AS customer_phone,
            r.source,
            r.destination,
            st.name AS service_type_name,
            v.name AS vessel_name,
            v.seat_capacity AS vessel_capacity,
            u.email AS booked_by_email,
            u.first_name AS booked_by_first_name,
            u.last_name AS booked_by_last_name,
            u.terminal_id AS booked_by_terminal,
            bu.email AS boarded_by_email
          FROM bookings b
          JOIN customers c ON b.customer_id = c.id
          JOIN routes r ON b.route_id = r.id
          JOIN service_types st ON r.service_type_id = st.id
          LEFT JOIN vessels v ON b.vessel_id = v.id
          JOIN users u ON b.booked_by = u.id
          LEFT JOIN users bu ON b.boarded_by = bu.id
          WHERE b.ticket_id = ?`,
          [ticketId]
        );

        return send.ok(res, {
          scanResult: "valid",
          message: "Passenger boarded successfully",
          ticket: updated[0],
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/scans/history
    getScanHistory: async (req, res) => {
      try {
        const [rows] = await db(req).query(
          `SELECT
            ts.*,
            b.ticket_id,
            c.name AS passenger_name,
            r.source,
            r.destination,
            u.email AS scanned_by_email
          FROM ticket_scans ts
          JOIN bookings b ON ts.booking_id = b.id
          JOIN customers c ON b.customer_id = c.id
          JOIN routes r ON b.route_id = r.id
          JOIN users u ON ts.scanned_by = u.id
          ORDER BY ts.scanned_at DESC
          LIMIT 500`
        );

        return send.ok(res, { scans: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/scans/stats
    getScanStats: async (_req, res) => {
      try {
        const [totalScans] = await db(req).query(
          `SELECT COUNT(*) AS total FROM ticket_scans WHERE DATE(scanned_at) = CURDATE()`
        );

        const [boardedToday] = await db(req).query(
          `SELECT COUNT(*) AS total FROM bookings WHERE status = 'boarded' AND DATE(boarded_at) = CURDATE()`
        );

        const [resultBreakdown] = await db(req).query(
          `SELECT scan_result, COUNT(*) AS count
           FROM ticket_scans
           WHERE DATE(scanned_at) = CURDATE()
           GROUP BY scan_result`
        );

        return send.ok(res, {
          todayScans: totalScans[0].total,
          todayBoarded: boardedToday[0].total,
          resultBreakdown,
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
