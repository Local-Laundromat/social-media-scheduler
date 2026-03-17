/**
 * Unified Database Module
 * Automatically switches between SQLite (local) and PostgreSQL (Supabase)
 * based on environment configuration
 */

require('dotenv').config();

// Determine which database to use
const usePostgres = process.env.USE_POSTGRES === 'true' || process.env.SUPABASE_DATABASE_URL;

let db;

if (usePostgres) {
  console.log('🔷 Using Supabase PostgreSQL database');
  db = require('./supabase-db');
} else {
  console.log('💾 Using SQLite database (local development)');
  db = require('./db');
}

module.exports = db;
