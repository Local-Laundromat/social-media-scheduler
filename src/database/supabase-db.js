/**
 * Supabase PostgreSQL Database Adapter
 * Replaces SQLite with PostgreSQL for production deployment
 */

const { Pool } = require('pg');
require('dotenv').config();

// Create PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.SUPABASE_DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ Supabase PostgreSQL connection error:', err.message);
    console.error('   Check your SUPABASE_DATABASE_URL in .env');
  } else {
    console.log('✅ Connected to Supabase PostgreSQL');
    console.log(`   Server time: ${res.rows[0].now}`);
  }
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

/**
 * Wrapper to make PostgreSQL work like SQLite for existing code
 * Provides compatibility layer for db.run(), db.get(), db.all()
 */
const db = {
  /**
   * Run a query (INSERT, UPDATE, DELETE)
   * @param {string} sql - SQL query
   * @param {array} params - Query parameters
   * @param {function} callback - Callback function(err, result)
   */
  run(sql, params = [], callback) {
    // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
    let pgSql = sql;
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

    // Convert SQLite syntax to PostgreSQL
    pgSql = pgSql.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/gi, 'SERIAL PRIMARY KEY');
    pgSql = pgSql.replace(/DATETIME/gi, 'TIMESTAMP');
    pgSql = pgSql.replace(/TEXT/gi, 'TEXT');

    pool.query(pgSql, params, (err, result) => {
      if (callback) {
        if (err) {
          callback(err);
        } else {
          // Make result compatible with SQLite
          callback(null, {
            lastID: result.rows[0]?.id || result.insertId,
            changes: result.rowCount
          });
        }
      }
    });
  },

  /**
   * Get a single row
   * @param {string} sql - SQL query
   * @param {array} params - Query parameters
   * @param {function} callback - Callback function(err, row)
   */
  get(sql, params = [], callback) {
    // Handle case where params is actually the callback
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
    let pgSql = sql;
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

    pool.query(pgSql, params, (err, result) => {
      if (callback) {
        if (err) {
          callback(err);
        } else {
          callback(null, result.rows[0] || null);
        }
      }
    });
  },

  /**
   * Get all rows
   * @param {string} sql - SQL query
   * @param {array} params - Query parameters
   * @param {function} callback - Callback function(err, rows)
   */
  all(sql, params = [], callback) {
    // Handle case where params is actually the callback
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }

    // Convert SQLite-style ? placeholders to PostgreSQL $1, $2, etc.
    let pgSql = sql;
    let paramIndex = 1;
    pgSql = pgSql.replace(/\?/g, () => `$${paramIndex++}`);

    pool.query(pgSql, params, (err, result) => {
      if (callback) {
        if (err) {
          callback(err);
        } else {
          callback(null, result.rows || []);
        }
      }
    });
  },

  /**
   * Serialize queries (for compatibility - not needed in PostgreSQL)
   * @param {function} callback - Function containing queries to run
   */
  serialize(callback) {
    // PostgreSQL doesn't need serialization like SQLite
    // Just execute the callback immediately
    if (callback) callback();
  },

  /**
   * Close the database connection pool
   * @param {function} callback - Callback when closed
   */
  close(callback) {
    pool.end((err) => {
      if (callback) callback(err);
    });
  },

  /**
   * Direct access to the connection pool for advanced queries
   */
  pool: pool
};

// Graceful shutdown
process.on('SIGINT', () => {
  pool.end(() => {
    console.log('PostgreSQL pool has ended');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  pool.end(() => {
    console.log('PostgreSQL pool has ended');
    process.exit(0);
  });
});

module.exports = db;
