-- ============================================================================
-- Goundar Shipping Ticket System v2 - Enterprise Schema
-- Updated with QR Ticketing, Dock Scanner, Boarding System
-- ============================================================================

-- ============================================================================
-- CORE USER MANAGEMENT
-- ============================================================================

-- Users table with dock role for QR scanning at the wharf
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
  role ENUM('super_admin','admin','agent','dock') NOT NULL DEFAULT 'agent',
  terminal_id VARCHAR(4) NOT NULL DEFAULT '01',
  team_id INT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  deactivated_at TIMESTAMP NULL,
  created_by INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_users_email (email),
  INDEX idx_users_role (role),
  INDEX idx_users_is_active (is_active),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

-- Audit Logs (comprehensive activity tracking)
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
  INDEX idx_audit_user (user_id),
  INDEX idx_audit_action (action),
  INDEX idx_audit_target (target_type, target_id),
  INDEX idx_audit_date (created_at)
);

-- Daily ticket counter per terminal (resets each day)
CREATE TABLE IF NOT EXISTS ticket_counters (
  terminal_id VARCHAR(4) NOT NULL,
  counter_date DATE NOT NULL,
  last_seq INT NOT NULL DEFAULT 0,
  PRIMARY KEY (terminal_id, counter_date)
);

-- ============================================================================
-- SERVICE CONFIGURATION
-- ============================================================================

-- Service Types (e.g., Franchise, Express, Premium)
CREATE TABLE IF NOT EXISTS service_types (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  vat_rate DECIMAL(5,2) NOT NULL DEFAULT 12.50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_service_types_name (name)
);

-- Vessels table for ship management
CREATE TABLE IF NOT EXISTS vessels (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL UNIQUE,
  seat_capacity INT NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_vessels_name (name)
);

-- Routes with regular and discount pricing support
CREATE TABLE IF NOT EXISTS routes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  service_type_id INT NOT NULL,
  source VARCHAR(255) NOT NULL,
  destination VARCHAR(255) NOT NULL,

  -- Regular Pricing (VAT-INCLUSIVE final prices)
  adult_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  student_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  child_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  infant_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  -- Discount Pricing System
  discount_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  discount_adult_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_student_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_child_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  discount_infant_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (service_type_id) REFERENCES service_types(id) ON DELETE CASCADE,

  INDEX idx_routes_service_type (service_type_id),
  INDEX idx_routes_source (source),
  INDEX idx_routes_destination (destination),
  INDEX idx_routes_source_dest (source, destination),
  INDEX idx_routes_discount_enabled (discount_enabled),

  UNIQUE KEY unique_route (service_type_id, source, destination)
);

-- ============================================================================
-- CUSTOMER MANAGEMENT
-- ============================================================================

-- Customer information with gender support
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  gender ENUM('male','female') NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_customers_email (email),
  INDEX idx_customers_phone (phone),
  INDEX idx_customers_name (name),
  INDEX idx_customers_name_phone (name, phone)
);

-- ============================================================================
-- BOOKING & TICKETING SYSTEM (with QR + Boarding)
-- ============================================================================

-- Main bookings/tickets table with QR code and boarding support
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id VARCHAR(50) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  route_id INT NOT NULL,
  vessel_id INT NULL,

  -- Booking Details
  booking_type ENUM('one_way', 'return', 'multi') NOT NULL DEFAULT 'one_way',
  passenger_type ENUM('adult', 'student', 'child', 'infant') NOT NULL,
  passenger_gender ENUM('male','female') NULL,

  -- Pricing Breakdown (VAT calculations)
  base_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  vat_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  total_price DECIMAL(10,2) NOT NULL DEFAULT 0.00,

  -- Travel Information
  booking_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  travel_date DATE NOT NULL,
  return_date DATE NULL,
  custom_validity_days INT NULL,

  -- Status Management (boarded = scanned at dock)
  status ENUM('confirmed', 'cancelled', 'completed', 'boarded', 'invalidated') NOT NULL DEFAULT 'confirmed',

  -- QR Code Data (URL encoded in QR)
  qr_code_data VARCHAR(500) NULL,

  -- Boarding tracking
  boarded_at TIMESTAMP NULL,
  boarded_by INT NULL,

  -- Notes (agent can add additional info at booking time)
  notes TEXT NULL,

  -- Payment method used for this booking (references payment_methods.code)
  payment_method VARCHAR(50) NULL,

  -- Audit Trail
  booked_by INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- Foreign Key Constraints
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  FOREIGN KEY (route_id) REFERENCES routes(id) ON DELETE CASCADE,
  FOREIGN KEY (vessel_id) REFERENCES vessels(id) ON DELETE SET NULL,
  FOREIGN KEY (booked_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (boarded_by) REFERENCES users(id) ON DELETE SET NULL,

  -- Indexes for Performance and Reporting
  INDEX idx_bookings_ticket_id (ticket_id),
  INDEX idx_bookings_customer (customer_id),
  INDEX idx_bookings_route (route_id),
  INDEX idx_bookings_vessel (vessel_id),
  INDEX idx_bookings_travel_date (travel_date),
  INDEX idx_bookings_booking_date (booking_date),
  INDEX idx_bookings_status (status),
  INDEX idx_bookings_passenger_type (passenger_type),
  INDEX idx_bookings_booked_by (booked_by),
  INDEX idx_bookings_boarded_by (boarded_by),
  INDEX idx_bookings_status_date (status, travel_date),
  INDEX idx_bookings_route_date (route_id, travel_date),
  INDEX idx_bookings_vessel_date (vessel_id, travel_date),
  INDEX idx_bookings_qr (qr_code_data(100)),
  INDEX idx_bookings_payment_method (payment_method)
);

-- ============================================================================
-- PAYMENT METHODS (configurable payment types for bookings)
-- ============================================================================

CREATE TABLE IF NOT EXISTS payment_methods (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_payment_methods_active (is_active),
  INDEX idx_payment_methods_sort (sort_order)
);

-- Seed default payment methods
INSERT IGNORE INTO payment_methods (code, name, sort_order) VALUES
  ('cash', 'Cash', 1),
  ('m-paisa', 'M-PAiSA', 2),
  ('my-cash', 'MyCash', 3),
  ('card', 'Card', 4);

-- ============================================================================
-- TICKET SCAN AUDIT LOG
-- ============================================================================

-- Every QR scan is logged for audit purposes
CREATE TABLE IF NOT EXISTS ticket_scans (
  id INT AUTO_INCREMENT PRIMARY KEY,
  booking_id INT NOT NULL,
  scanned_by INT NOT NULL,
  scan_result ENUM('valid', 'already_boarded', 'cancelled', 'not_found') NOT NULL,
  scanned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT NULL,

  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (scanned_by) REFERENCES users(id) ON DELETE CASCADE,

  INDEX idx_scans_booking (booking_id),
  INDEX idx_scans_scanned_by (scanned_by),
  INDEX idx_scans_result (scan_result),
  INDEX idx_scans_date (scanned_at)
);

-- ============================================================================
-- ROLE-BASED PERMISSIONS (dynamic per-role permission grants)
-- ============================================================================

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

-- ============================================================================
-- SYSTEM SETTINGS (key-value configuration store)
-- ============================================================================

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Default ticket validity period (days from travel date)
INSERT IGNORE INTO system_settings (setting_key, setting_value) VALUES ('ticket_validity_days', '7');

-- ============================================================================
-- MIGRATION HELPERS (run these on existing databases)
-- ============================================================================
-- ALTER TABLE users MODIFY COLUMN role ENUM('admin','agent','dock') NOT NULL DEFAULT 'agent';
-- ALTER TABLE bookings MODIFY COLUMN status ENUM('confirmed','cancelled','completed','boarded') NOT NULL DEFAULT 'confirmed';
-- ALTER TABLE bookings ADD COLUMN qr_code_data VARCHAR(500) NULL AFTER status;
-- ALTER TABLE bookings ADD COLUMN boarded_at TIMESTAMP NULL AFTER qr_code_data;
-- ALTER TABLE bookings ADD COLUMN boarded_by INT NULL AFTER boarded_at;
-- ALTER TABLE bookings ADD FOREIGN KEY (boarded_by) REFERENCES users(id) ON DELETE SET NULL;
-- ALTER TABLE bookings ADD INDEX idx_bookings_boarded_by (boarded_by);
-- ALTER TABLE bookings ADD INDEX idx_bookings_qr (qr_code_data(100));
-- ALTER TABLE bookings ADD COLUMN custom_validity_days INT NULL AFTER return_date;
-- ALTER TABLE bookings ADD COLUMN notes TEXT NULL AFTER custom_validity_days;
-- ALTER TABLE bookings ADD COLUMN payment_method VARCHAR(50) NULL AFTER notes;
-- ALTER TABLE bookings ADD INDEX idx_bookings_payment_method (payment_method);
