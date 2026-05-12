-- MySQL 8+ recommended. Run via: npm run migrate

CREATE TABLE IF NOT EXISTS admins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('superadmin', 'admin') NOT NULL DEFAULT 'admin',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS schools (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_ref VARCHAR(32) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  address TEXT NULL,
  contact_email VARCHAR(255) NULL,
  contact_phone VARCHAR(64) NULL,
  api_key VARCHAR(128) NOT NULL UNIQUE,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS app_settings (
  `key` VARCHAR(100) PRIMARY KEY,
  `value` TEXT NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(64) NOT NULL COMMENT 'School ref / ID from NAMES sheet',
  school_ref VARCHAR(32) NULL,
  name VARCHAR(255) NOT NULL,
  class_name VARCHAR(64) NULL,
  term VARCHAR(32) NULL,
  year VARCHAR(16) NULL,
  school_name VARCHAR(255) NULL,
  school_address TEXT NULL,
  exam_title VARCHAR(255) NULL,
  month_reporting VARCHAR(64) NULL,
  vacation_start DATE NULL,
  vacation_end DATE NULL,
  no_on_roll INT NULL,
  attendance VARCHAR(64) NULL,
  total_marks DECIMAL(12, 4) NULL,
  average_mark DECIMAL(12, 4) NULL,
  overall_position VARCHAR(32) NULL,
  promotion_status VARCHAR(64) NULL,
  interest TEXT NULL,
  attitude TEXT NULL,
  class_teacher_remarks TEXT NULL,
  class_teacher_name VARCHAR(255) NULL,
  headteacher_name VARCHAR(255) NULL,
  headteacher_contact VARCHAR(64) NULL,
  classteacher_contact VARCHAR(64) NULL,
  pta_levy DECIMAL(12, 2) NULL,
  pta_arrears DECIMAL(12, 2) NULL,
  pta_total DECIMAL(12, 2) NULL,
  pdf_url VARCHAR(512) NULL,
  pdf_path VARCHAR(512) NULL,
  raw_meta JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_term_year (student_id, term, year),
  INDEX idx_students_school_ref (school_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS results (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_db_id INT NOT NULL,
  subject_name VARCHAR(255) NOT NULL,
  class_score DECIMAL(12, 4) NULL,
  exam_score DECIMAL(12, 4) NULL,
  total_score DECIMAL(12, 4) NULL,
  position_in_subject VARCHAR(32) NULL,
  remark VARCHAR(255) NULL,
  sort_order INT NOT NULL DEFAULT 0,
  FOREIGN KEY (student_db_id) REFERENCES students(id) ON DELETE CASCADE,
  INDEX idx_results_student (student_db_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NULL,
  amount DECIMAL(14, 2) NOT NULL,
  currency VARCHAR(8) NOT NULL DEFAULT 'GHS',
  reference VARCHAR(128) NOT NULL UNIQUE,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  student_id_requested VARCHAR(64) NULL,
  paystack_data JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pins (
  id INT AUTO_INCREMENT PRIMARY KEY,
  pin_code VARCHAR(32) NOT NULL UNIQUE,
  is_used TINYINT(1) NOT NULL DEFAULT 0,
  used_by_student_id VARCHAR(64) NULL,
  used_at TIMESTAMP NULL,
  student_id_bound VARCHAR(64) NULL COMMENT 'If set (e.g. Paystack), PIN only works for this student',
  payment_id INT NULL,
  batch_note VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL,
  INDEX idx_pins_used (is_used),
  INDEX idx_pins_bound (student_id_bound)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
