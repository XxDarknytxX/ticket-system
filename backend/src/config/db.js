// src/config/db.js
import mysql from "mysql2/promise";

const unquote = v => (v || "").replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");

const base = {
  host: process.env.DATABASE_HOST || "localhost",
  port: Number(process.env.DATABASE_PORT || 3306),
  user: unquote(process.env.DATABASE_USER),
  password: unquote(process.env.DATABASE_PASSWORD),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

/**
 * Instance-specific tables — every instance DB gets ALL of these.
 * Users, teams, role_permissions, and audit_logs are per-instance now.
 */
const INSTANCE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    team_code VARCHAR(4) NOT NULL DEFAULT '00',
    description VARCHAR(255) NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#0d9488',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(100) NULL,
    last_name VARCHAR(100) NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('super_admin','admin','manager','agent','dock') NOT NULL DEFAULT 'agent',
    terminal_id VARCHAR(4) NOT NULL DEFAULT '01',
    team_id INT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    deactivated_at TIMESTAMP NULL,
    created_by INT NULL,
    totp_secret VARCHAR(64) NULL,
    totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    totp_backup_codes JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_email (email),
    INDEX idx_users_role (role),
    INDEX idx_users_is_active (is_active),
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS role_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL,
    permission VARCHAR(100) NOT NULL,
    granted BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_role_perm (role_name, permission),
    INDEX idx_role_permissions_role (role_name)
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    user_email VARCHAR(255) NULL,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50) NULL,
    target_id VARCHAR(100) NULL,
    details JSON NULL,
    ip_address VARCHAR(45) NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_action (action),
    INDEX idx_audit_date (created_at)
  );

  CREATE TABLE IF NOT EXISTS system_settings (
    setting_key VARCHAR(100) PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS service_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    vat_rate DECIMAL(5,2) NOT NULL DEFAULT 12.50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS vessels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    seat_capacity INT NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS routes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_type_id INT NOT NULL,
    source VARCHAR(255) NOT NULL,
    destination VARCHAR(255) NOT NULL,
    adult_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    student_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    child_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    infant_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    discount_adult_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_student_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_child_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    discount_infant_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE CASCADE,
    UNIQUE KEY unique_route (service_type_id, source, destination)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(50) NULL,
    gender ENUM('male','female') NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS ticket_counters (
    terminal_id VARCHAR(4) NOT NULL,
    counter_date DATE NOT NULL,
    last_seq INT NOT NULL DEFAULT 0,
    PRIMARY KEY (terminal_id, counter_date)
  );

  CREATE TABLE IF NOT EXISTS payment_methods (
    id INT AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id VARCHAR(50) NOT NULL UNIQUE,
    customer_id INT NOT NULL,
    route_id INT NOT NULL,
    vessel_id INT NULL,
    booking_type ENUM('one_way','return','multi') NOT NULL DEFAULT 'one_way',
    passenger_type ENUM('adult','student','child','infant') NOT NULL,
    passenger_gender ENUM('male','female') NULL,
    base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    travel_date DATE NOT NULL,
    return_date DATE NULL,
    custom_validity_days INT NULL,
    status ENUM('confirmed','cancelled','completed','boarded','invalidated') NOT NULL DEFAULT 'confirmed',
    qr_code_data VARCHAR(500) NULL,
    boarded_at TIMESTAMP NULL,
    boarded_by INT NULL,
    notes TEXT NULL,
    payment_method VARCHAR(50) NULL,
    booked_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
    FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
    FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE SET NULL,
    FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (boarded_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_bookings_ticket_id (ticket_id),
    INDEX idx_bookings_status (status),
    INDEX idx_bookings_travel_date (travel_date),
    INDEX idx_bookings_booked_by (booked_by),
    INDEX idx_bookings_payment_method (payment_method)
  );

  CREATE TABLE IF NOT EXISTS ticket_scans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    booking_id INT NOT NULL,
    scanned_by INT NOT NULL,
    scan_result ENUM('valid','already_boarded','cancelled','not_found') NOT NULL,
    scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    notes TEXT NULL,
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
    FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_scans_booking (booking_id),
    INDEX idx_scans_date (scanned_at)
  );

  INSERT IGNORE INTO payment_methods (code, name, sort_order) VALUES
    ('cash', 'Cash', 1),
    ('m-paisa', 'M-PAiSA', 2),
    ('my-cash', 'MyCash', 3),
    ('card', 'Card', 4);

  INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('ticket_validity_days', '7');
`;

/**
 * PoolManager — manages a shared pool (database_instances, super_admins)
 * and per-instance pools (everything else including users).
 */
class PoolManager {
  constructor() {
    this.sharedPool = null;
    this.instancePools = new Map();
    this.sharedDbName = process.env.DATABASE_NAME || "booking_app";
  }

  async getSharedPool() {
    if (this.sharedPool) return this.sharedPool;
    const conn = await mysql.createConnection(base);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${this.sharedDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.end();
    this.sharedPool = mysql.createPool({ ...base, database: this.sharedDbName });

    // Ensure shared-only tables exist
    await this.sharedPool.query(`
      CREATE TABLE IF NOT EXISTS database_instances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        db_name VARCHAR(100) NOT NULL UNIQUE,
        color VARCHAR(7) NOT NULL DEFAULT '#10b981',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await this.sharedPool.query(`
      CREATE TABLE IF NOT EXISTS super_admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NULL,
        last_name VARCHAR(100) NULL,
        totp_secret VARCHAR(64) NULL,
        totp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
        totp_backup_codes JSON NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Auto-register production instance if none exist
    const [rows] = await this.sharedPool.query("SELECT COUNT(*) AS c FROM database_instances");
    if (rows[0].c === 0) {
      await this.sharedPool.query(
        `INSERT INTO database_instances (name, label, db_name, color) VALUES ('production', 'Production', ?, '#10b981')`,
        [this.sharedDbName]
      );
      console.log("Auto-registered 'production' instance");
    }

    return this.sharedPool;
  }

  async getInstanceInfo(name) {
    const pool = await this.getSharedPool();
    const [rows] = await pool.query("SELECT * FROM database_instances WHERE name = ?", [name]);
    return rows[0] || null;
  }

  async getInstancePool(instanceName) {
    if (this.instancePools.has(instanceName)) return this.instancePools.get(instanceName);

    const info = await this.getInstanceInfo(instanceName);
    if (!info) throw new Error(`Instance '${instanceName}' not found`);

    const pool = mysql.createPool({ ...base, database: info.db_name });
    this.instancePools.set(instanceName, pool);
    return pool;
  }

  async createInstanceDb(dbName) {
    const conn = await mysql.createConnection(base);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.end();

    const pool = mysql.createPool({ ...base, database: dbName });
    const statements = INSTANCE_SCHEMA.split(";").map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }
    return pool;
  }

  async dropInstanceDb(dbName) {
    for (const [name, pool] of this.instancePools) {
      const info = await this.getInstanceInfo(name);
      if (info && info.db_name === dbName) {
        await pool.end();
        this.instancePools.delete(name);
        break;
      }
    }
    const conn = await mysql.createConnection(base);
    await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
    await conn.end();
  }
}

const poolManager = new PoolManager();
export default poolManager;

export async function getPool() {
  return poolManager.getSharedPool();
}
