import nodemailer from "nodemailer";
import crypto from "crypto";

/**
 * Send an email using SMTP settings from the database.
 */
export async function sendEmail(pool, { to, subject, html }) {
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key IN ('smtp_host','smtp_port','smtp_user','smtp_pass','smtp_from_email','smtp_from_name','smtp_encryption')"
  );
  const settings = {};
  rows.forEach(r => { settings[r.setting_key] = r.setting_value; });

  if (!settings.smtp_host || !settings.smtp_user) {
    throw new Error("SMTP is not configured. Go to Configuration > Settings to set up email.");
  }

  const port = parseInt(settings.smtp_port) || 587;
  const secure = settings.smtp_encryption === "ssl" || port === 465;

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port,
    secure,
    auth: { user: settings.smtp_user, pass: settings.smtp_pass },
    tls: settings.smtp_encryption === "none" ? { rejectUnauthorized: false } : undefined,
  });

  const fromName = settings.smtp_from_name || "Goundar Shipping";
  const fromEmail = settings.smtp_from_email || settings.smtp_user;

  await transporter.sendMail({ from: `"${fromName}" <${fromEmail}>`, to, subject, html });
}

/**
 * Get the theme accent color from the database, fallback to violet.
 */
export async function getAccentColor(pool) {
  try {
    const [rows] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'primary_color'"
    );
    return rows.length > 0 ? rows[0].setting_value : "#7c3aed";
  } catch {
    return "#7c3aed";
  }
}

export function generateResetToken() {
  return crypto.randomUUID() + "-" + crypto.randomBytes(16).toString("hex");
}

export async function storeResetToken(pool, userId, token) {
  const expiry = Date.now() + 3600000;
  const key = `reset_token_${userId}`;
  const value = `${token}|${expiry}`;
  await pool.query(
    "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
    [key, value, value]
  );
}

export async function validateResetToken(pool, token) {
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM system_settings WHERE setting_key LIKE 'reset_token_%'"
  );
  for (const row of rows) {
    const [storedToken, expiryStr] = row.setting_value.split("|");
    if (storedToken === token) {
      if (Date.now() > parseInt(expiryStr)) {
        await pool.query("DELETE FROM system_settings WHERE setting_key = ?", [row.setting_key]);
        throw new Error("Reset link has expired. Please request a new one.");
      }
      const userId = row.setting_key.replace("reset_token_", "");
      await pool.query("DELETE FROM system_settings WHERE setting_key = ?", [row.setting_key]);
      return parseInt(userId);
    }
  }
  throw new Error("Invalid or expired reset link.");
}

/* ═══════════════════════ EMAIL TEMPLATES ═══════════════════════ */

function emailWrapper(accent, content) {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:480px;margin:0 auto;padding:40px 16px;">

  <div style="background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e2e8f0;">

    <!-- Accent Header -->
    <div style="background:${accent};padding:28px 32px;text-align:center;">
      <h1 style="margin:0;font-size:18px;font-weight:700;color:#fff;letter-spacing:0.5px;">Goundar Shipping</h1>
      <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:2px;text-transform:uppercase;">Ticket System</p>
    </div>

    <!-- Body -->
    <div style="padding:24px 20px;">
      ${content}
    </div>
  </div>

  <p style="text-align:center;margin:20px 0 0;font-size:11px;color:#94a3b8;">
    Goundar Shipping Ltd &bull; Fiji<br>
    <span style="color:#cbd5e1;">This is an automated message.</span>
  </p>

</div>
</body></html>`;
}

export function onboardingEmail({ firstName, email, resetLink, accent = "#7c3aed" }) {
  return emailWrapper(accent, `
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0f172a;">Welcome aboard!</h2>
    <p style="margin:0 0 20px;font-size:14px;color:#64748b;line-height:1.6;">
      Hi ${firstName || "there"}, your account has been created. Click below to set your password and get started.
    </p>

    <div style="background:#f8fafc;border-radius:12px;padding:14px 18px;margin:0 0 24px;">
      <p style="margin:0;font-size:13px;color:#64748b;">Your login email</p>
      <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#0f172a;">${email}</p>
    </div>

    <div style="text-align:center;">
      <a href="${resetLink}" style="display:inline-block;background:${accent};color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 36px;border-radius:999px;">
        Set Up Password
      </a>
      <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;">Link expires in 1 hour</p>
    </div>
  `);
}

export function resetPasswordEmail({ firstName, resetLink, accent = "#7c3aed" }) {
  return emailWrapper(accent, `
    <h2 style="margin:0 0 6px;font-size:20px;font-weight:700;color:#0f172a;">Reset your password</h2>
    <p style="margin:0 0 24px;font-size:14px;color:#64748b;line-height:1.6;">
      Hi ${firstName || "there"}, a password reset was requested for your account. Click the button below to choose a new password.
    </p>

    <div style="text-align:center;">
      <a href="${resetLink}" style="display:inline-block;background:${accent};color:#fff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 36px;border-radius:999px;">
        Reset Password
      </a>
      <p style="margin:14px 0 0;font-size:11px;color:#94a3b8;">Link expires in 1 hour</p>
    </div>

    <div style="border-top:1px solid #f1f5f9;margin-top:24px;padding-top:16px;">
      <p style="margin:0;font-size:12px;color:#94a3b8;">Didn't request this? You can safely ignore this email.</p>
    </div>
  `);
}

export function ticketEmail({ ticket, accent = "#7c3aed" }) {
  // QR contains only the ticket ID — same as printed tickets, scanner parses it directly
  const qrData = ticket.ticket_id;
  const travelDate = new Date(ticket.travel_date).toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  const validUntil = ticket.valid_until ? new Date(ticket.valid_until).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : null;
  const totalPrice = `FJ$${(Number(ticket.total_price) || 0).toFixed(2)}`;

  return emailWrapper(accent, `
    <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#0f172a;">Your Ticket</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#64748b;">Hi ${ticket.customer_name || "there"}, here's your booking confirmation.</p>

    <!-- Route -->
    <div style="background:${accent};border-radius:12px;padding:16px 20px;margin:0 0 16px;text-align:center;">
      <p style="margin:0;font-size:18px;font-weight:700;color:#fff;">${ticket.source} &rarr; ${ticket.destination}</p>
      <p style="margin:4px 0 0;font-size:12px;color:rgba(255,255,255,0.8);">${ticket.service_type_name || "Standard"} &bull; ${(ticket.booking_type || "one_way").replace("_", " ")}</p>
    </div>

    <!-- Details Grid -->
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;">
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;width:50%;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Passenger</p>
          <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${ticket.customer_name}</p>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;width:50%;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Travel Date</p>
          <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${travelDate}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Vessel</p>
          <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${ticket.vessel_name || "TBA"}</p>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Type</p>
          <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;text-transform:capitalize;">${ticket.passenger_type || "Adult"}</p>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Ticket ID</p>
          <p style="margin:3px 0 0;font-size:13px;font-weight:600;color:#0f172a;font-family:monospace;">${ticket.ticket_id}</p>
        </td>
        <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Status</p>
          <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#059669;text-transform:capitalize;">${ticket.status || "Confirmed"}</p>
        </td>
      </tr>
      <tr>
        <td colspan="2" style="padding:10px 0;${validUntil ? 'border-bottom:1px solid #f1f5f9;' : ''}">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Class</p>
          <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${ticket.tier === "first_class" ? "First Class" : "Economy"}</p>
        </td>
      </tr>
      ${validUntil ? `
      <tr>
        <td colspan="2" style="padding:10px 0;">
          <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Valid Until</p>
          <p style="margin:3px 0 0;font-size:14px;font-weight:600;color:#0f172a;">${validUntil}</p>
        </td>
      </tr>` : ''}
    </table>

    <!-- Price -->
    <div style="background:#f8fafc;border-radius:12px;padding:20px;margin:0 0 16px;text-align:center;">
      <p style="margin:0;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Total Amount</p>
      <p style="margin:6px 0 0;font-size:28px;font-weight:800;color:${accent};">${totalPrice}</p>
    </div>

    <!-- QR Code (centered, full width block for Android compatibility) -->
    <div style="text-align:center;margin:0 0 8px;padding:16px 0;">
      <p style="margin:0 0 12px;font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Scan QR when boarding</p>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=300x300&format=png&data=${encodeURIComponent(qrData)}" alt="QR Code" width="180" height="180" style="display:block;margin:0 auto;max-width:180px;height:auto;" />
      <p style="text-align:center;margin:12px 0 0;font-size:10px;color:#cbd5e1;font-family:monospace;">${ticket.ticket_id}</p>
    </div>
    </div>
  `);
}
