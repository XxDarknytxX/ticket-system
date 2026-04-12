/**
 * Audit log helper — writes entries to the audit_logs table.
 * Non-blocking: failures are logged but never thrown so the main action succeeds even if audit fails.
 */
export async function logAudit(pool, req, { action, targetType = null, targetId = null, details = null }) {
  try {
    const userId = req?.user?.id || null;
    const userEmail = req?.user?.email || null;
    const ip = (req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()) || req?.ip || req?.connection?.remoteAddress || null;
    const ua = req?.headers?.['user-agent'] || null;
    await pool.query(
      "INSERT INTO audit_logs (user_id, user_email, action, target_type, target_id, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        userId,
        userEmail,
        action,
        targetType,
        targetId != null ? String(targetId) : null,
        details ? JSON.stringify(details) : null,
        ip,
        ua,
      ]
    );
  } catch (e) {
    console.error("Audit log failed:", e.message);
  }
}

/**
 * Log an action when there's no authenticated user yet (e.g., login attempts).
 */
export async function logAnonAudit(pool, req, { action, userEmail = null, targetType = null, targetId = null, details = null }) {
  try {
    const ip = (req?.headers?.['x-forwarded-for']?.split(',')[0]?.trim()) || req?.ip || req?.connection?.remoteAddress || null;
    const ua = req?.headers?.['user-agent'] || null;
    await pool.query(
      "INSERT INTO audit_logs (user_id, user_email, action, target_type, target_id, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [
        null,
        userEmail,
        action,
        targetType,
        targetId != null ? String(targetId) : null,
        details ? JSON.stringify(details) : null,
        ip,
        ua,
      ]
    );
  } catch (e) {
    console.error("Audit log (anon) failed:", e.message);
  }
}
