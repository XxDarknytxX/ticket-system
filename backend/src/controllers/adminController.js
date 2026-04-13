import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { validationResult } from "express-validator";
import { generateSecret as otpGenerateSecret, generateURI as otpGenerateURI, verify as otpVerify } from "otplib";
import { sendEmail, generateResetToken, storeResetToken, validateResetToken, onboardingEmail, resetPasswordEmail, getAccentColor } from "../utils/mailer.js";
import { logAudit, logAnonAudit } from "../utils/audit.js";

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

/** Thin data-access helpers */
async function findUserByEmail(pool, email) {
  const [rows] = await pool.query(
    "SELECT id, email, first_name, last_name, password_hash, role, terminal_id, team_id, is_active, totp_secret, totp_enabled, totp_backup_codes FROM users WHERE email = ?",
    [email]
  );
  return rows[0] || null;
}

async function findUserById(pool, id) {
  const [rows] = await pool.query(
    "SELECT id, email, first_name, last_name, role, terminal_id, team_id, is_active, created_at FROM users WHERE id = ?",
    [id]
  );
  return rows[0] || null;
}

async function createUser(pool, { email, firstName, lastName, passwordHash, role, terminalId, teamId, createdBy }) {
  const [res] = await pool.query(
    "INSERT INTO users (email, first_name, last_name, password_hash, role, terminal_id, team_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [email, firstName || null, lastName || null, passwordHash, role, terminalId || '01', teamId || null, createdBy || null]
  );
  return { id: res.insertId, email, role };
}

/** Check per-role license limit */
async function checkLicenseLimit(pool, role) {
  const key = `license_max_${role}`;
  const [limitRows] = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = ?", [key]);
  const defaults = { super_admin: 2, admin: 5, agent: 20, dock: 10 };
  const limit = limitRows.length > 0 ? parseInt(limitRows[0].setting_value) : (defaults[role] || 10);
  const [countRows] = await pool.query("SELECT COUNT(*) as total FROM users WHERE role = ? AND is_active = 1", [role]);
  return { limit, current: countRows[0].total, ok: countRows[0].total < limit };
}

/**
 * Sync a super_admin's credentials across the shared super_admins table
 * and all instance users tables. Call after any password/name change.
 */
async function syncSuperAdmin(sharedPool, email, updates) {
  try {
    // Update shared super_admins table
    const setClauses = [];
    const values = [];
    if (updates.password_hash) { setClauses.push("password_hash = ?"); values.push(updates.password_hash); }
    if (updates.first_name !== undefined) { setClauses.push("first_name = ?"); values.push(updates.first_name); }
    if (updates.last_name !== undefined) { setClauses.push("last_name = ?"); values.push(updates.last_name); }
    if (updates.totp_secret !== undefined) { setClauses.push("totp_secret = ?"); values.push(updates.totp_secret); }
    if (updates.totp_enabled !== undefined) { setClauses.push("totp_enabled = ?"); values.push(updates.totp_enabled ? 1 : 0); }
    if (updates.totp_backup_codes !== undefined) { setClauses.push("totp_backup_codes = ?"); values.push(JSON.stringify(updates.totp_backup_codes)); }
    if (setClauses.length === 0) return;

    values.push(email);
    await sharedPool.query(`UPDATE super_admins SET ${setClauses.join(", ")} WHERE email = ?`, values);

    const [instances] = await sharedPool.query("SELECT db_name FROM database_instances");
    const mysql = (await import("mysql2/promise")).default;
    const base = {
      host: process.env.DATABASE_HOST || "localhost",
      port: Number(process.env.DATABASE_PORT || 3306),
      user: process.env.DATABASE_USER,
      password: process.env.DATABASE_PASSWORD,
      waitForConnections: true, connectionLimit: 2, queueLimit: 0
    };

    for (const inst of instances) {
      try {
        const instPool = mysql.createPool({ ...base, database: inst.db_name });
        const setClausesInst = [];
        const valuesInst = [];
        if (updates.password_hash) { setClausesInst.push("password_hash = ?"); valuesInst.push(updates.password_hash); }
        if (updates.first_name !== undefined) { setClausesInst.push("first_name = ?"); valuesInst.push(updates.first_name); }
        if (updates.last_name !== undefined) { setClausesInst.push("last_name = ?"); valuesInst.push(updates.last_name); }
        if (updates.totp_secret !== undefined) { setClausesInst.push("totp_secret = ?"); valuesInst.push(updates.totp_secret); }
        if (updates.totp_enabled !== undefined) { setClausesInst.push("totp_enabled = ?"); valuesInst.push(updates.totp_enabled ? 1 : 0); }
        if (updates.totp_backup_codes !== undefined) { setClausesInst.push("totp_backup_codes = ?"); valuesInst.push(JSON.stringify(updates.totp_backup_codes)); }
        valuesInst.push(email);
        await instPool.query(`UPDATE users SET ${setClausesInst.join(", ")} WHERE email = ? AND role = 'super_admin'`, valuesInst);
        await instPool.end();
      } catch {} // skip if instance DB is unreachable
    }
  } catch (e) {
    console.error("syncSuperAdmin error:", e.message);
  }
}

/** Factory */
export function makeAdminController(pool) {
  if (!process.env.JWT_SECRET) {
    console.warn("⚠️ JWT_SECRET is not set. Tokens cannot be verified across restarts.");
  }

  // Instance pool — all user/team/booking queries go here.
  // pool = shared DB (super_admins, database_instances); req.instancePool = instance DB.
  const db = (req) => req.instancePool || pool;

  return {
    // POST /api/register
    register: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { email, password, role = "agent" } = req.body;
      try {
        const existing = await findUserByEmail(db(req), email);
        if (existing) return send.bad(res, "Email already registered");

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await createUser(db(req), { email, passwordHash, role });
        return send.created(res, { id: user.id, email: user.email, role: user.role });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/login
    // Checks super_admins table (shared DB) first, then instance users table.
    // Returns tempToken if 2FA is enabled, or requires2FASetup if not set up yet.
    login: async (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { email, password } = req.body;
      const instancePool = db(req);
      const auditPool = instancePool;

      try {
        // 1. Check super_admins table in shared DB
        const sharedDb = req.sharedPool || pool;
        const [saRows] = await sharedDb.query(
          "SELECT id, email, password_hash, first_name, last_name, totp_secret, totp_enabled FROM super_admins WHERE email = ?",
          [email]
        );

        if (saRows.length > 0) {
          const sa = saRows[0];
          const pwOk = await bcrypt.compare(password, sa.password_hash);
          if (pwOk) {
            const jwtPayload = { id: sa.id, email: sa.email, role: "super_admin", terminal_id: "01", team_id: null, isSuperAdmin: true };

            // 2FA check
            if (sa.totp_enabled) {
              const tempToken = jwt.sign({ ...jwtPayload, pending2FA: true }, process.env.JWT_SECRET, { expiresIn: "5m" });
              return send.ok(res, { requires2FA: true, tempToken, role: "super_admin" });
            }
            // 2FA not set up — issue full token but flag for setup
            const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: "8h" });
            try { await logAudit(auditPool, { user: { id: sa.id, email: sa.email }, headers: req.headers, ip: req.ip, connection: req.connection }, { action: "login", targetType: "super_admin", targetId: sa.id }); } catch {}
            return send.ok(res, { token, role: "super_admin", requires2FASetup: true });
          }
        }

        // 2. Check instance users table
        const user = await findUserByEmail(instancePool, email);
        if (!user) {
          try { await logAnonAudit(auditPool, req, { action: "login.failed", userEmail: email, details: { reason: "user_not_found" } }); } catch {}
          return send.bad(res, "Invalid credentials");
        }

        const ok = await bcrypt.compare(password, user.password_hash);
        if (!ok) {
          try { await logAnonAudit(auditPool, req, { action: "login.failed", userEmail: email, details: { reason: "bad_password" } }); } catch {}
          return send.bad(res, "Invalid credentials");
        }

        if (user.is_active === 0 || user.is_active === false) {
          try { await logAnonAudit(auditPool, req, { action: "login.blocked", userEmail: email, details: { reason: "account_deactivated" } }); } catch {}
          return send.forbidden(res, "Account is deactivated. Contact your administrator.");
        }

        const jwtPayload = { id: user.id, email: user.email, role: user.role, terminal_id: user.terminal_id || '01', team_id: user.team_id || null };

        // 2FA check
        if (user.totp_enabled) {
          const tempToken = jwt.sign({ ...jwtPayload, pending2FA: true }, process.env.JWT_SECRET, { expiresIn: "5m" });
          return send.ok(res, { requires2FA: true, tempToken, role: user.role });
        }

        // 2FA not set up — issue full token but flag for setup
        const token = jwt.sign(jwtPayload, process.env.JWT_SECRET, { expiresIn: "2h" });
        try { await logAudit(auditPool, { user: { id: user.id, email: user.email }, headers: req.headers, ip: req.ip, connection: req.connection }, { action: "login", targetType: "user", targetId: user.id }); } catch {}
        return send.ok(res, { token, role: user.role, requires2FASetup: !user.totp_enabled });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/me
    me: async (req, res) => {
      try {
        // Super_admin: try instance users first (may have a mirror), then shared super_admins, then JWT fallback
        if (req.user.isSuperAdmin || req.user.role === "super_admin") {
          // Try to get fresh data from shared super_admins
          const sharedDb = req.sharedPool || pool;
          const [saRows] = await sharedDb.query(
            "SELECT id, email, first_name, last_name FROM super_admins WHERE email = ?",
            [req.user.email]
          );
          if (saRows.length > 0) {
            const sa = saRows[0];
            return send.ok(res, { user: { id: sa.id, email: sa.email, first_name: sa.first_name, last_name: sa.last_name, role: "super_admin", terminal_id: "01" } });
          }
        }
        // Regular users: read from instance DB
        const user = await findUserById(db(req), req.user.id);
        if (user) return send.ok(res, { user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role, terminal_id: user.terminal_id } });
        return send.ok(res, { user: { id: req.user.id, email: req.user.email, role: req.user.role } });
      } catch {
        return send.ok(res, { user: { id: req.user.id, email: req.user.email, role: req.user.role } });
      }
    },

    // GET /api/dashboard (placeholder)
    dashboard: async (_req, res) => send.ok(res, { widgets: [] }),

    // ===== USER MANAGEMENT FUNCTIONS (Admin Only) =====

    // GET /api/users (admin only)
    getUsers: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      try {
        const [rows] = await db(req).query(
          `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.terminal_id, u.team_id,
                  t.name AS team_name, u.is_active, u.deactivated_at, u.created_at, u.created_by,
                  cb.first_name AS created_by_first_name, cb.last_name AS created_by_last_name, cb.email AS created_by_email
           FROM users u
           LEFT JOIN teams t ON u.team_id = t.id
           LEFT JOIN users cb ON u.created_by = cb.id
           ORDER BY u.created_at DESC`
        );
        return send.ok(res, { users: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/users (admin/super_admin only)
    createUserByAdmin: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const errors = validationResult(req);
      if (!errors.isEmpty()) return send.bad(res, errors.array()[0].msg);

      const { email, first_name, last_name, password, role = "agent", terminal_id = "01", team_id } = req.body;

      // Only super_admin can create super_admin users
      if (role === "super_admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Only super_admin can create super_admin users");
      }

      try {
        // Check per-role license limit
        const license = await checkLicenseLimit(db(req), role);
        if (!license.ok) {
          return send.bad(res, `License limit reached for role '${role}' (${license.current}/${license.limit}). Deactivate an existing ${role} or increase the limit.`);
        }

        const existing = await findUserByEmail(db(req), email);
        if (existing) return send.bad(res, "Email already registered");

        const passwordHash = await bcrypt.hash(password, 10);
        const user = await createUser(db(req), { email, firstName: first_name, lastName: last_name, passwordHash, role, terminalId: terminal_id, teamId: team_id, createdBy: req.user.id });

        const [newUser] = await db(req).query(
          "SELECT id, email, first_name, last_name, role, terminal_id, team_id, created_at FROM users WHERE id = ?",
          [user.id]
        );

        // If creating a super_admin, sync to shared table + all other instances
        if (role === "super_admin") {
          try {
            const sharedDb = req.sharedPool || pool;
            // Add to shared super_admins table
            await sharedDb.query(
              "INSERT IGNORE INTO super_admins (email, password_hash, first_name, last_name) VALUES (?, ?, ?, ?)",
              [email, passwordHash, first_name || null, last_name || null]
            );
            // Copy to all other instance DBs
            const [instances] = await sharedDb.query("SELECT db_name FROM database_instances");
            const mysql = (await import("mysql2/promise")).default;
            const baseConfig = {
              host: process.env.DATABASE_HOST || "localhost",
              port: Number(process.env.DATABASE_PORT || 3306),
              user: process.env.DATABASE_USER,
              password: process.env.DATABASE_PASSWORD,
              waitForConnections: true, connectionLimit: 2, queueLimit: 0
            };
            for (const inst of instances) {
              try {
                const instPool = mysql.createPool({ ...baseConfig, database: inst.db_name });
                await instPool.query(
                  "INSERT IGNORE INTO users (email, first_name, last_name, password_hash, role, terminal_id) VALUES (?, ?, ?, ?, 'super_admin', ?)",
                  [email, first_name || null, last_name || null, passwordHash, terminal_id || '01']
                );
                await instPool.end();
              } catch {}
            }
          } catch (e) {
            console.error("Super admin sync error:", e.message);
          }
        }

        await logAudit(db(req), req, { action: "user.create", targetType: "user", targetId: user.id, details: { email, role, terminal_id } });
        return send.created(res, { user: newUser[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/users/:id (admin only)
    updateUser: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;
      const { email, first_name, last_name, role, password, terminal_id, team_id } = req.body;

      if (parseInt(id) === req.user.id && role && role !== req.user.role) {
        return send.bad(res, "Cannot change your own role");
      }

      try {
        const updateFields = [];
        const updateValues = [];

        if (email) {
          const existingUser = await findUserByEmail(db(req), email);
          if (existingUser && existingUser.id !== parseInt(id)) {
            return send.bad(res, "Email already taken by another user");
          }
          updateFields.push("email = ?");
          updateValues.push(email);
        }

        if (role) {
          updateFields.push("role = ?");
          updateValues.push(role);
        }

        if (first_name !== undefined) {
          updateFields.push("first_name = ?");
          updateValues.push(first_name);
        }

        if (last_name !== undefined) {
          updateFields.push("last_name = ?");
          updateValues.push(last_name);
        }

        if (terminal_id !== undefined) {
          updateFields.push("terminal_id = ?");
          updateValues.push(terminal_id);
        }

        if (team_id !== undefined) {
          updateFields.push("team_id = ?");
          updateValues.push(team_id || null);
        }

        if (password && password.trim()) {
          const passwordHash = await bcrypt.hash(password, 10);
          updateFields.push("password_hash = ?");
          updateValues.push(passwordHash);
        }

        if (updateFields.length === 0) {
          return send.bad(res, "No fields to update");
        }

        updateValues.push(id);

        const [result] = await db(req).query(
          `UPDATE users SET ${updateFields.join(", ")} WHERE id = ?`,
          updateValues
        );

        if (result.affectedRows === 0) {
          return send.notFound(res, "User not found");
        }

        const updatedUser = await findUserById(db(req), id);

        // If updating a super_admin, sync password/name across all instances
        if (updatedUser && updatedUser.role === "super_admin") {
          const syncUpdates = {};
          if (password && password.trim()) syncUpdates.password_hash = await bcrypt.hash(password, 10);
          if (first_name !== undefined) syncUpdates.first_name = first_name;
          if (last_name !== undefined) syncUpdates.last_name = last_name;
          if (Object.keys(syncUpdates).length > 0) {
            const sharedDb = req.sharedPool || pool;
            await syncSuperAdmin(sharedDb, updatedUser.email, syncUpdates);
          }
        }

        await logAudit(db(req), req, { action: "user.update", targetType: "user", targetId: id, details: { fields: updateFields.map(f => f.split(" = ")[0]) } });
        return send.ok(res, { user: updatedUser });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/users/:id/activate
    activateUser: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") return send.forbidden(res);
      const { id } = req.params;
      try {
        const [result] = await db(req).query("UPDATE users SET is_active = 1, deactivated_at = NULL WHERE id = ?", [id]);
        if (result.affectedRows === 0) return send.notFound(res, "User not found");
        await logAudit(db(req), req, { action: "user.activate", targetType: "user", targetId: id });
        return send.ok(res, { message: "User activated" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // PUT /api/users/:id/deactivate
    deactivateUser: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") return send.forbidden(res);
      const { id } = req.params;
      if (parseInt(id) === req.user.id) return send.bad(res, "Cannot deactivate your own account");
      try {
        const [result] = await db(req).query("UPDATE users SET is_active = 0, deactivated_at = NOW() WHERE id = ?", [id]);
        if (result.affectedRows === 0) return send.notFound(res, "User not found");
        await logAudit(db(req), req, { action: "user.deactivate", targetType: "user", targetId: id });
        return send.ok(res, { message: "User deactivated" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // DELETE /api/users/:id (admin only)
    deleteUser: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;

      if (parseInt(id) === req.user.id) {
        return send.bad(res, "Cannot delete your own account");
      }

      try {
        const user = await findUserById(db(req), id);
        if (!user) {
          return send.notFound(res, "User not found");
        }

        const [bookings] = await db(req).query(
          "SELECT COUNT(*) as count FROM bookings WHERE booked_by = ?",
          [id]
        );
        if (bookings[0].count > 0) {
          return send.bad(
            res,
            "Cannot delete user with existing bookings. Please reassign bookings first."
          );
        }

        const [result] = await db(req).query("DELETE FROM users WHERE id = ?", [id]);
        if (result.affectedRows === 0) {
          return send.notFound(res, "User not found");
        }

        // If deleting a super_admin, remove from shared table + all instances
        if (user.role === "super_admin") {
          try {
            const sharedDb = req.sharedPool || pool;
            await sharedDb.query("DELETE FROM super_admins WHERE email = ?", [user.email]);
            const [instances] = await sharedDb.query("SELECT db_name FROM database_instances");
            const mysql = (await import("mysql2/promise")).default;
            const baseConfig = {
              host: process.env.DATABASE_HOST || "localhost",
              port: Number(process.env.DATABASE_PORT || 3306),
              user: process.env.DATABASE_USER,
              password: process.env.DATABASE_PASSWORD,
              waitForConnections: true, connectionLimit: 2, queueLimit: 0
            };
            for (const inst of instances) {
              try {
                const instPool = mysql.createPool({ ...baseConfig, database: inst.db_name });
                await instPool.query("DELETE FROM users WHERE email = ? AND role = 'super_admin'", [user.email]);
                await instPool.end();
              } catch {}
            }
          } catch (e) {
            console.error("Super admin delete sync error:", e.message);
          }
        }

        await logAudit(db(req), req, { action: "user.delete", targetType: "user", targetId: id, details: { email: user.email, role: user.role } });
        return send.ok(res, { message: "User deleted successfully" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/users/:id (admin only)
    getUserById: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") {
        return send.forbidden(res, "Admin access required");
      }

      const { id } = req.params;

      try {
        const user = await findUserById(db(req), id);
        if (!user) {
          return send.notFound(res, "User not found");
        }

        return send.ok(res, { user });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ===== TEAMS MANAGEMENT =====

    getTeams: async (req, res) => {
      try {
        const [teams] = await db(req).query(
          `SELECT t.*, COUNT(u.id) AS member_count
           FROM teams t LEFT JOIN users u ON u.team_id = t.id
           GROUP BY t.id ORDER BY t.name`
        );
        // Also get members for each team
        const [members] = await db(req).query(
          `SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.terminal_id, u.team_id
           FROM users u WHERE u.team_id IS NOT NULL ORDER BY u.first_name`
        );
        return send.ok(res, { teams, members });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    createTeam: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") return send.forbidden(res);
      const { name, team_code, description, color } = req.body;
      if (!name) return send.bad(res, "Team name is required");
      try {
        const [result] = await db(req).query(
          "INSERT INTO teams (name, team_code, description, color) VALUES (?, ?, ?, ?)",
          [name, team_code || '00', description || null, color || '#0d9488']
        );
        const [team] = await db(req).query("SELECT * FROM teams WHERE id = ?", [result.insertId]);
        await logAudit(db(req), req, { action: "team.create", targetType: "team", targetId: result.insertId, details: { name, team_code } });
        return send.created(res, { team: team[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    updateTeam: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") return send.forbidden(res);
      const { id } = req.params;
      const { name, team_code, description, color } = req.body;
      try {
        const fields = [];
        const vals = [];
        if (name) { fields.push("name = ?"); vals.push(name); }
        if (team_code !== undefined) { fields.push("team_code = ?"); vals.push(team_code); }
        if (description !== undefined) { fields.push("description = ?"); vals.push(description); }
        if (color) { fields.push("color = ?"); vals.push(color); }
        if (fields.length === 0) return send.bad(res, "Nothing to update");
        vals.push(id);
        await db(req).query(`UPDATE teams SET ${fields.join(", ")} WHERE id = ?`, vals);
        const [team] = await db(req).query("SELECT * FROM teams WHERE id = ?", [id]);
        await logAudit(db(req), req, { action: "team.update", targetType: "team", targetId: id, details: { fields: fields.map(f => f.split(" = ")[0]) } });
        return send.ok(res, { team: team[0] });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    deleteTeam: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") return send.forbidden(res);
      const { id } = req.params;
      try {
        const [teamRows] = await db(req).query("SELECT name FROM teams WHERE id = ?", [id]);
        // Unassign users first
        await db(req).query("UPDATE users SET team_id = NULL WHERE team_id = ?", [id]);
        await db(req).query("DELETE FROM teams WHERE id = ?", [id]);
        await logAudit(db(req), req, { action: "team.delete", targetType: "team", targetId: id, details: { name: teamRows[0]?.name } });
        return send.ok(res, { message: "Team deleted" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // Assign/unassign user to team + set terminal_id
    assignUserToTeam: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") return send.forbidden(res);
      const { user_id, team_id, terminal_id } = req.body;
      if (!user_id) return send.bad(res, "user_id is required");
      try {
        const fields = ["team_id = ?"];
        const vals = [team_id || null];
        if (terminal_id) { fields.push("terminal_id = ?"); vals.push(terminal_id); }
        vals.push(user_id);
        await db(req).query(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`, vals);
        await logAudit(db(req), req, { action: "team.assign_user", targetType: "user", targetId: user_id, details: { team_id, terminal_id } });
        return send.ok(res, { message: "User updated" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ===== PERMISSIONS MANAGEMENT =====

    getPermissions: async (req, res) => {
      try {
        const allPerms = ["dashboard", "booking", "ticket_search", "reports", "scanner", "scan_history", "configuration", "users", "teams", "license_overview"];
        const defaultPerms = {
          admin: ["dashboard", "booking", "ticket_search", "reports", "scanner", "scan_history", "configuration", "users", "teams", "license_overview"],
          agent: ["dashboard", "booking", "ticket_search"],
          dock: ["scanner"],
        };
        const builtIn = ["super_admin", "admin", "agent", "dock"];

        // Seed defaults for any built-in role that has no rows yet
        for (const role of builtIn) {
          if (role === "super_admin") continue; // super_admin bypasses permissions
          const [countRows] = await db(req).query(
            "SELECT COUNT(*) AS c FROM role_permissions WHERE role_name = ?", [role]
          );
          if (countRows[0].c === 0) {
            const granted = defaultPerms[role] || [];
            for (const perm of allPerms) {
              try {
                await db(req).query(
                  "INSERT IGNORE INTO role_permissions (role_name, permission, granted) VALUES (?, ?, ?)",
                  [role, perm, granted.includes(perm) ? 1 : 0]
                );
              } catch {}
            }
          }
        }

        const [rows] = await db(req).query("SELECT * FROM role_permissions ORDER BY role_name, permission");
        const byRole = {};
        rows.forEach(r => {
          if (!byRole[r.role_name]) byRole[r.role_name] = {};
          byRole[r.role_name][r.permission] = !!r.granted;
        });
        builtIn.forEach(r => { if (!byRole[r]) byRole[r] = {}; });
        return send.ok(res, { permissions: byRole, raw: rows });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    createRole: async (req, res) => {
      if (req.user.role !== "super_admin") return send.forbidden(res);
      const { role_name, permissions } = req.body;
      if (!role_name || !role_name.trim()) return send.bad(res, "Role name is required");
      const name = role_name.trim().toLowerCase().replace(/\s+/g, '_');
      if (["super_admin", "admin", "agent", "dock"].includes(name)) return send.bad(res, "Cannot create a role with a built-in name");
      try {
        // Create permission entries for this role
        const allPerms = ["dashboard", "booking", "ticket_search", "reports", "scanner", "scan_history", "configuration", "users", "teams"];
        const values = allPerms.map(p => [name, p, permissions?.[p] ? true : false]);
        await db(req).query("DELETE FROM role_permissions WHERE role_name = ?", [name]);
        for (const v of values) {
          await db(req).query("INSERT INTO role_permissions (role_name, permission, granted) VALUES (?, ?, ?)", v);
        }
        return send.created(res, { role_name: name, message: "Role created" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    deleteRole: async (req, res) => {
      if (req.user.role !== "super_admin") return send.forbidden(res);
      const { role_name } = req.params;
      if (["super_admin", "admin", "agent", "dock"].includes(role_name)) return send.bad(res, "Cannot delete built-in roles");
      try {
        // Check if any users have this role
        const [users] = await db(req).query("SELECT COUNT(*) as count FROM users WHERE role = ?", [role_name]);
        if (users[0].count > 0) return send.bad(res, `Cannot delete role "${role_name}" - ${users[0].count} user(s) still assigned to it`);
        await db(req).query("DELETE FROM role_permissions WHERE role_name = ?", [role_name]);
        return send.ok(res, { message: "Role deleted" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    updatePermission: async (req, res) => {
      if (req.user.role !== "super_admin") return send.forbidden(res);
      const { role_name, permission, granted } = req.body;
      if (!role_name || !permission) return send.bad(res, "role_name and permission required");
      // Prevent modifying super_admin permissions
      if (role_name === "super_admin") return send.bad(res, "Cannot modify super_admin permissions");
      // Only super_admin can modify admin permissions
      if (role_name === "admin" && req.user.role !== "super_admin") return send.bad(res, "Only super_admin can modify admin permissions");
      try {
        await db(req).query(
          `INSERT INTO role_permissions (role_name, permission, granted) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE granted = ?`,
          [role_name, permission, !!granted, !!granted]
        );
        return send.ok(res, { message: "Permission updated" });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // Get permissions for the current user's role
    getMyPermissions: async (req, res) => {
      try {
        const [rows] = await db(req).query(
          "SELECT permission, granted FROM role_permissions WHERE role_name = ?",
          [req.user.role]
        );
        const perms = {};
        rows.forEach(r => { perms[r.permission] = !!r.granted; });
        return send.ok(res, { role: req.user.role, permissions: perms });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // ===== LICENSE MANAGEMENT (super_admin only) =====

    getLicenseInfo: async (req, res) => {
      if (req.user.role !== "super_admin" && req.user.role !== "admin") return send.forbidden(res);
      try {
        const builtInRoles = ["super_admin", "admin", "agent", "dock"];
        const defaults = { super_admin: 2, admin: 5, agent: 20, dock: 10 };

        // Discover custom roles from role_permissions table
        const placeholders = builtInRoles.map(() => "?").join(",");
        const [customRoleRows] = await db(req).query(
          `SELECT DISTINCT role_name FROM role_permissions WHERE role_name NOT IN (${placeholders})`,
          builtInRoles
        );
        const customRoleNames = customRoleRows.map(r => r.role_name);
        const allRoles = [...builtInRoles, ...customRoleNames];

        const limits = {};
        const active = {};
        const inactive = {};
        for (const role of allRoles) {
          const [limRows] = await db(req).query("SELECT setting_value FROM system_settings WHERE setting_key = ?", [`license_max_${role}`]);
          limits[role] = limRows.length > 0 ? parseInt(limRows[0].setting_value) : (defaults[role] || 5);
          const [actRows] = await db(req).query("SELECT COUNT(*) as c FROM users WHERE role = ? AND is_active = 1", [role]);
          active[role] = actRows[0].c;
          const [inactRows] = await db(req).query("SELECT COUNT(*) as c FROM users WHERE role = ? AND is_active = 0", [role]);
          inactive[role] = inactRows[0].c;
        }
        const [users] = await db(req).query(
          "SELECT id, email, first_name, last_name, role, is_active, deactivated_at, terminal_id FROM users ORDER BY role, first_name"
        );

        // Fetch permissions for custom roles
        const customRoles = {};
        for (const roleName of customRoleNames) {
          const [permRows] = await db(req).query("SELECT permission, granted FROM role_permissions WHERE role_name = ?", [roleName]);
          const perms = {};
          permRows.forEach(r => { perms[r.permission] = !!r.granted; });
          customRoles[roleName] = perms;
        }

        return send.ok(res, { limits, active, inactive, users, customRoles, builtInRoles });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    updateLicenseLimits: async (req, res) => {
      if (req.user.role !== "super_admin") return send.forbidden(res);
      const { limits } = req.body;
      if (!limits || typeof limits !== "object") return send.bad(res, "limits object required");
      try {
        for (const [role, value] of Object.entries(limits)) {
          const val = parseInt(String(value));
          if (isNaN(val) || val < 0) continue;
          await db(req).query(
            "INSERT INTO system_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?",
            [`license_max_${role}`, String(val), String(val)]
          );
        }
        await logAudit(db(req), req, { action: "license.update", targetType: "license", details: { limits } });
        return send.ok(res, { limits });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // GET /api/audit-logs (super_admin only)
    getAuditLogs: async (req, res) => {
      if (req.user.role !== "super_admin") return send.forbidden(res);
      const { page = 1, limit = 50, action, user_id, date_from, date_to, q } = req.query;
      const pageNum = Math.max(1, parseInt(page));
      const limitNum = Math.min(200, Math.max(1, parseInt(limit)));
      const offset = (pageNum - 1) * limitNum;
      const where = [];
      const params = [];
      if (action) { where.push("action = ?"); params.push(action); }
      if (user_id) { where.push("user_id = ?"); params.push(parseInt(user_id)); }
      if (date_from) { where.push("created_at >= ?"); params.push(date_from); }
      if (date_to) { where.push("created_at <= ?"); params.push(date_to + " 23:59:59"); }
      if (q) {
        where.push("(action LIKE ? OR user_email LIKE ? OR target_id LIKE ?)");
        const like = `%${q}%`;
        params.push(like, like, like);
      }
      const whereClause = where.length > 0 ? "WHERE " + where.join(" AND ") : "";
      try {
        const [countRows] = await db(req).query(`SELECT COUNT(*) as total FROM audit_logs ${whereClause}`, params);
        const total = countRows[0].total;
        const [logs] = await db(req).query(
          `SELECT id, user_id, user_email, action, target_type, target_id, details, ip_address, user_agent, created_at
           FROM audit_logs ${whereClause}
           ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, limitNum, offset]
        );
        // Get distinct action types for the filter dropdown
        const [actions] = await db(req).query("SELECT DISTINCT action FROM audit_logs ORDER BY action");
        return send.ok(res, {
          logs: logs.map(l => ({ ...l, details: l.details ? (typeof l.details === "string" ? JSON.parse(l.details) : l.details) : null })),
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          actionTypes: actions.map(a => a.action),
        });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    sendOnboarding: async (req, res) => {
      if (!["admin", "super_admin"].includes(req.user.role)) return send.forbidden(res);
      const { id } = req.params;
      try {
        const [rows] = await db(req).query("SELECT * FROM users WHERE id = ?", [id]);
        if (rows.length === 0) return send.notFound(res, "User not found");
        const user = rows[0];

        const token = generateResetToken();
        await storeResetToken(pool, id, token);

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const resetLink = `${frontendUrl}/reset-password?token=${token}`;

        await sendEmail(pool, {
          to: user.email,
          subject: "Welcome to Goundar Shipping - Set Up Your Account",
          html: onboardingEmail({ firstName: user.first_name, email: user.email, resetLink, accent: await getAccentColor(pool) }),
        });

        await logAudit(db(req), req, { action: "user.onboarding_sent", targetType: "user", targetId: id, details: { email: user.email } });
        return send.ok(res, { message: "Onboarding email sent" });
      } catch (e) {
        console.error("Send onboarding error:", e);
        return send.serverErr(res, e.message || "Failed to send onboarding email");
      }
    },

    resetPassword: async (req, res) => {
      if (!["admin", "super_admin"].includes(req.user.role)) return send.forbidden(res);
      const { id } = req.params;
      try {
        const [rows] = await db(req).query("SELECT * FROM users WHERE id = ?", [id]);
        if (rows.length === 0) return send.notFound(res, "User not found");
        const user = rows[0];

        const token = generateResetToken();
        await storeResetToken(pool, id, token);

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
        const resetLink = `${frontendUrl}/reset-password?token=${token}`;

        await sendEmail(pool, {
          to: user.email,
          subject: "Password Reset - Goundar Shipping",
          html: resetPasswordEmail({ firstName: user.first_name, resetLink, accent: await getAccentColor(pool) }),
        });

        await logAudit(db(req), req, { action: "user.password_reset", targetType: "user", targetId: id, details: { email: user.email } });
        return send.ok(res, { message: "Password reset email sent" });
      } catch (e) {
        console.error("Reset password error:", e);
        return send.serverErr(res, e.message || "Failed to reset password");
      }
    },

    // Public: consume reset token and set new password
    consumeResetToken: async (req, res) => {
      const { token, password } = req.body;
      if (!token || !password) return send.bad(res, "Token and password are required");
      if (password.length < 6) return send.bad(res, "Password must be at least 6 characters");
      try {
        const userId = await validateResetToken(pool, token);
        const hash = await bcrypt.hash(password, 10);
        await db(req).query("UPDATE users SET password_hash = ? WHERE id = ?", [hash, userId]);

        // If the user is a super_admin, sync password across all instances
        const user = await findUserById(db(req), userId);
        if (user && user.role === "super_admin") {
          const sharedDb = req.sharedPool || pool;
          await syncSuperAdmin(sharedDb, user.email, { password_hash: hash });
        }

        return send.ok(res, { message: "Password updated successfully" });
      } catch (e) {
        return send.bad(res, e.message);
      }
    },

    // ===== TWO-FACTOR AUTHENTICATION =====

    // POST /api/2fa/setup — generate TOTP secret + QR code URI
    setup2FA: async (req, res) => {
      try {
        // authenticator imported at top of file
        const secret = otpGenerateSecret();
        const appName = "Goundar Shipping";
        const otpauthUri = otpGenerateURI({ secret, issuer: appName, label: req.user.email });

        // Store secret temporarily (not enabled until verified)
        if (req.user.isSuperAdmin || req.user.role === "super_admin") {
          const sharedDb = req.sharedPool || pool;
          await sharedDb.query("UPDATE super_admins SET totp_secret = ? WHERE email = ?", [secret, req.user.email]);
        }
        await db(req).query("UPDATE users SET totp_secret = ? WHERE id = ?", [secret, req.user.id]);

        return send.ok(res, { secret, otpauthUri });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/2fa/verify — confirm setup with a code, enables 2FA + generates backup codes
    verify2FA: async (req, res) => {
      const { code } = req.body;
      if (!code) return send.bad(res, "Verification code is required");
      try {
        // authenticator imported at top of file

        // Get the user's stored secret
        let secret;
        if (req.user.isSuperAdmin || req.user.role === "super_admin") {
          const sharedDb = req.sharedPool || pool;
          const [rows] = await sharedDb.query("SELECT totp_secret FROM super_admins WHERE email = ?", [req.user.email]);
          secret = rows[0]?.totp_secret;
        } else {
          const [rows] = await db(req).query("SELECT totp_secret FROM users WHERE id = ?", [req.user.id]);
          secret = rows[0]?.totp_secret;
        }

        if (!secret) return send.bad(res, "2FA setup not initiated. Call /2fa/setup first.");

        const isValid = otpVerify({ token: String(code), secret });
        if (!isValid) return send.bad(res, "Invalid verification code. Please try again.");

        // Generate backup codes (10 random 8-char alphanumeric codes)
        // crypto imported at top of file
        const backupCodes = [];
        const backupHashes = [];
        for (let i = 0; i < 10; i++) {
          const raw = crypto.randomBytes(4).toString("hex"); // 8 chars
          backupCodes.push(raw);
          backupHashes.push(await bcrypt.hash(raw, 6)); // lighter hash for backup codes
        }

        // Enable 2FA
        const backupJson = JSON.stringify(backupHashes);
        await db(req).query(
          "UPDATE users SET totp_enabled = TRUE, totp_backup_codes = ? WHERE id = ?",
          [backupJson, req.user.id]
        );

        // Sync super_admin across instances
        if (req.user.isSuperAdmin || req.user.role === "super_admin") {
          const sharedDb = req.sharedPool || pool;
          await syncSuperAdmin(sharedDb, req.user.email, {
            totp_secret: secret,
            totp_enabled: true,
            totp_backup_codes: backupHashes,
          });
        }

        await logAudit(db(req), req, { action: "2fa.enabled", targetType: "user", targetId: req.user.id });
        return send.ok(res, { enabled: true, backupCodes });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/2fa/verify-login — verify TOTP code during login (uses tempToken)
    verifyLogin2FA: async (req, res) => {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) return send.bad(res, "Token and code are required");

      try {
        const decoded = jwt.verify(tempToken, process.env.JWT_SECRET);
        if (!decoded.pending2FA) return send.bad(res, "Invalid token");

        // authenticator imported at top of file

        // Get TOTP secret
        let secret;
        let backupCodes;
        if (decoded.isSuperAdmin) {
          const sharedDb = req.sharedPool || pool;
          const [rows] = await sharedDb.query("SELECT totp_secret, totp_backup_codes FROM super_admins WHERE email = ?", [decoded.email]);
          secret = rows[0]?.totp_secret;
          backupCodes = rows[0]?.totp_backup_codes;
        } else {
          const [rows] = await db(req).query("SELECT totp_secret, totp_backup_codes FROM users WHERE id = ?", [decoded.id]);
          secret = rows[0]?.totp_secret;
          backupCodes = rows[0]?.totp_backup_codes;
        }

        if (!secret) return send.bad(res, "2FA not configured for this account");

        // Try TOTP code first
        let valid = otpVerify({ token: String(code), secret });

        // If TOTP fails, try backup codes
        if (!valid && backupCodes) {
          const codes = typeof backupCodes === "string" ? JSON.parse(backupCodes) : backupCodes;
          for (let i = 0; i < codes.length; i++) {
            if (await bcrypt.compare(String(code), codes[i])) {
              valid = true;
              // Consume the backup code
              codes.splice(i, 1);
              const updatedJson = JSON.stringify(codes);
              if (decoded.isSuperAdmin) {
                const sharedDb = req.sharedPool || pool;
                await sharedDb.query("UPDATE super_admins SET totp_backup_codes = ? WHERE email = ?", [updatedJson, decoded.email]);
                await syncSuperAdmin(sharedDb, decoded.email, { totp_backup_codes: codes });
              } else {
                await db(req).query("UPDATE users SET totp_backup_codes = ? WHERE id = ?", [updatedJson, decoded.id]);
              }
              break;
            }
          }
        }

        if (!valid) return send.bad(res, "Invalid verification code");

        // Issue full JWT (remove pending2FA flag)
        const { pending2FA, iat, exp, ...payload } = decoded;
        const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: decoded.isSuperAdmin ? "8h" : "2h" });

        const auditPool = db(req);
        try { await logAudit(auditPool, { user: { id: decoded.id, email: decoded.email }, headers: req.headers, ip: req.ip, connection: req.connection }, { action: "login.2fa_verified", targetType: "user", targetId: decoded.id }); } catch {}

        return send.ok(res, { token, role: decoded.role });
      } catch (e) {
        if (e.name === "TokenExpiredError") return send.bad(res, "2FA session expired. Please login again.");
        if (e.name === "JsonWebTokenError") return send.bad(res, "Invalid session token");
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/2fa/disable — disable own 2FA (requires current TOTP code)
    disable2FA: async (req, res) => {
      const { code } = req.body;
      if (!code) return send.bad(res, "Current 2FA code is required to disable");
      try {
        // authenticator imported at top of file

        let secret;
        if (req.user.isSuperAdmin || req.user.role === "super_admin") {
          const sharedDb = req.sharedPool || pool;
          const [rows] = await sharedDb.query("SELECT totp_secret FROM super_admins WHERE email = ?", [req.user.email]);
          secret = rows[0]?.totp_secret;
        } else {
          const [rows] = await db(req).query("SELECT totp_secret FROM users WHERE id = ?", [req.user.id]);
          secret = rows[0]?.totp_secret;
        }

        if (!secret) return send.bad(res, "2FA is not enabled");
        if (!otpVerify({ token: String(code), secret })) return send.bad(res, "Invalid code");

        await db(req).query("UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_backup_codes = NULL WHERE id = ?", [req.user.id]);

        if (req.user.isSuperAdmin || req.user.role === "super_admin") {
          const sharedDb = req.sharedPool || pool;
          await syncSuperAdmin(sharedDb, req.user.email, { totp_secret: null, totp_enabled: false, totp_backup_codes: null });
        }

        await logAudit(db(req), req, { action: "2fa.disabled", targetType: "user", targetId: req.user.id });
        return send.ok(res, { disabled: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    // POST /api/users/:id/reset-2fa — admin/super_admin resets a user's 2FA
    reset2FA: async (req, res) => {
      if (req.user.role !== "admin" && req.user.role !== "super_admin") return send.forbidden(res);
      const { id } = req.params;
      try {
        const user = await findUserById(db(req), id);
        if (!user) return send.notFound(res, "User not found");

        await db(req).query("UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, totp_backup_codes = NULL WHERE id = ?", [id]);

        if (user.role === "super_admin") {
          const sharedDb = req.sharedPool || pool;
          await syncSuperAdmin(sharedDb, user.email, { totp_secret: null, totp_enabled: false, totp_backup_codes: null });
        }

        await logAudit(db(req), req, { action: "2fa.reset", targetType: "user", targetId: id, details: { email: user.email, resetBy: req.user.email } });
        return send.ok(res, { reset: true });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },

    updateMaxUsers: async (req, res) => {
      if (req.user.role !== "super_admin") return send.forbidden(res);
      const { max_users } = req.body;
      if (!max_users || max_users < 1) return send.bad(res, "Invalid max_users value");
      try {
        await db(req).query(
          "INSERT INTO system_settings (setting_key, setting_value) VALUES ('max_users', ?) ON DUPLICATE KEY UPDATE setting_value = ?",
          [String(max_users), String(max_users)]
        );
        return send.ok(res, { max_users });
      } catch (e) {
        console.error(e);
        return send.serverErr(res);
      }
    },
  };
}
