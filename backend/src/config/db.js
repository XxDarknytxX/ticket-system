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
 * Instance-specific tables that live in each instance database.
 * Everything else (users, teams, role_permissions, audit_logs, system_settings,
 * database_instances) stays in the shared database.
 */
const INSTANCE_SCHEMA = `
  CREATE TABLE IF NOT EXISTS service_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    vat_rate DECIMAL(5,2) NOT NULL DEFAULT 12.50,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_service_types_name (name)
  );

  CREATE TABLE IF NOT EXISTS vessels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    seat_capacity INT NOT NULL DEFAULT 0,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_vessels_name (name)
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
    INDEX idx_routes_service_type (service_type_id),
    UNIQUE KEY unique_route (service_type_id, source, destination)
  );

  CREATE TABLE IF NOT EXISTS customers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NULL,
    phone VARCHAR(50) NULL,
    gender ENUM('male','female') NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_customers_name (name)
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
    INDEX idx_scans_booking (booking_id),
    INDEX idx_scans_date (scanned_at)
  );

  INSERT IGNORE INTO payment_methods (code, name, sort_order) VALUES
    ('cash', 'Cash', 1),
    ('m-paisa', 'M-PAiSA', 2),
    ('my-cash', 'MyCash', 3),
    ('card', 'Card', 4);
`;

/**
 * PoolManager — manages a shared pool (users, settings) and per-instance pools
 * (bookings, routes, customers, etc.). All databases live on the same MySQL server.
 */
class PoolManager {
  constructor() {
    this.sharedPool = null;
    this.instancePools = new Map();       // name → pool
    this.sharedDbName = process.env.DATABASE_NAME || "booking_app";
  }

  /** Get or create the shared database pool */
  async getSharedPool() {
    if (this.sharedPool) return this.sharedPool;
    const conn = await mysql.createConnection(base);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${this.sharedDbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.end();
    this.sharedPool = mysql.createPool({ ...base, database: this.sharedDbName });

    // Ensure the database_instances table exists in the shared DB
    await this.sharedPool.query(`
      CREATE TABLE IF NOT EXISTS database_instances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,
        label VARCHAR(100) NOT NULL,
        db_name VARCHAR(100) NOT NULL UNIQUE,
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        color VARCHAR(7) NOT NULL DEFAULT '#10b981',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Auto-create a "production" instance pointing to the current shared DB
    // if no instances exist yet (first-run migration)
    const [rows] = await this.sharedPool.query("SELECT COUNT(*) AS c FROM database_instances");
    if (rows[0].c === 0) {
      await this.sharedPool.query(
        `INSERT INTO database_instances (name, label, db_name, is_active, color) VALUES ('production', 'Production', ?, TRUE, '#10b981')`,
        [this.sharedDbName]
      );
      await this.sharedPool.query(
        `INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('active_instance', 'production')`
      );
      console.log("Auto-created 'production' instance from existing database");
    }

    return this.sharedPool;
  }

  /** Get the name of the currently active instance */
  async getActiveInstanceName() {
    const pool = await this.getSharedPool();
    const [rows] = await pool.query(
      "SELECT setting_value FROM system_settings WHERE setting_key = 'active_instance'"
    );
    return rows.length > 0 ? rows[0].setting_value : "production";
  }

  /** Get instance metadata by name */
  async getInstanceInfo(name) {
    const pool = await this.getSharedPool();
    const [rows] = await pool.query("SELECT * FROM database_instances WHERE name = ?", [name]);
    return rows[0] || null;
  }

  /** Get a pool for a specific instance database */
  async getInstancePool(instanceName) {
    if (this.instancePools.has(instanceName)) return this.instancePools.get(instanceName);

    const info = await this.getInstanceInfo(instanceName);
    if (!info) throw new Error(`Instance '${instanceName}' not found`);

    const pool = mysql.createPool({ ...base, database: info.db_name });
    this.instancePools.set(instanceName, pool);
    return pool;
  }

  /** Get the pool for the currently active instance */
  async getActiveInstancePool() {
    const name = await this.getActiveInstanceName();
    return this.getInstancePool(name);
  }

  /** Create a new instance database and initialize its schema */
  async createInstanceDb(dbName) {
    const conn = await mysql.createConnection(base);
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
    await conn.end();

    const pool = mysql.createPool({ ...base, database: dbName });

    // Run each statement separately (mysql2 doesn't support multi-statement by default)
    const statements = INSTANCE_SCHEMA.split(";").map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await pool.query(stmt);
    }

    return pool;
  }

  /** Drop an instance database */
  async dropInstanceDb(dbName) {
    // Close the pool if cached
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

// Singleton
const poolManager = new PoolManager();
export default poolManager;

// Legacy compat — existing code that imports getPool still works
export async function getPool() {
  return poolManager.getSharedPool();
}
