/**
 * Database Module - Auto-switches between SQLite and Supabase
 * - Local development: Uses SQLite
 * - Production (when SUPABASE_SERVICE_KEY is set): Uses Supabase PostgreSQL
 */

const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config();

// Check if Supabase is configured for production
const useSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

let db = null;
let supabase = null;

if (useSupabase) {
  // Production: Use Supabase PostgreSQL
  console.log('🔷 Using Supabase PostgreSQL database');
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
  );
} else {
  // Local development: Use SQLite
  console.log('🗄️  Using SQLite database (local development)');
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.join(__dirname, '../../data/posts.db');
  db = new sqlite3.Database(dbPath);

  // Create SQLite tables
  db.serialize(() => {
    // Posts table
    db.run(`
      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        filepath TEXT NOT NULL,
        filetype TEXT NOT NULL,
        caption TEXT,
        platforms TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        scheduled_time DATETIME,
        posted_time DATETIME,
        facebook_post_id TEXT,
        instagram_post_id TEXT,
        tiktok_post_id TEXT,
        error_message TEXT,
        account_id INTEGER,
        user_id INTEGER,
        api_key TEXT,
        webhook_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        external_user_id TEXT UNIQUE,
        email TEXT UNIQUE,
        password_hash TEXT,
        name TEXT,
        company TEXT,
        app_name TEXT,
        facebook_page_token TEXT,
        facebook_page_id TEXT,
        facebook_page_name TEXT,
        instagram_token TEXT,
        instagram_account_id TEXT,
        instagram_username TEXT,
        tiktok_token TEXT,
        tiktok_account_id TEXT,
        tiktok_username TEXT,
        facebook_connected INTEGER DEFAULT 0,
        instagram_connected INTEGER DEFAULT 0,
        tiktok_connected INTEGER DEFAULT 0,
        api_key TEXT UNIQUE,
        webhook_url TEXT,
        auto_reply_enabled INTEGER DEFAULT 0,
        openai_api_key TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Other tables...
    db.run(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        facebook_page_token TEXT,
        facebook_page_id TEXT,
        instagram_token TEXT,
        instagram_account_id TEXT,
        is_default INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        platform TEXT,
        likes INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        reach INTEGER DEFAULT 0,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        api_key TEXT UNIQUE NOT NULL,
        account_id INTEGER,
        webhook_url TEXT,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used_at DATETIME,
        FOREIGN KEY (account_id) REFERENCES accounts(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS webhook_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        webhook_url TEXT,
        payload TEXT,
        status_code INTEGER,
        response TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS comment_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        platform TEXT NOT NULL,
        comment_id TEXT NOT NULL,
        comment_text TEXT,
        reply_text TEXT NOT NULL,
        reply_id TEXT,
        was_auto_reply INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
      )
    `);

    // Create default account
    db.get('SELECT COUNT(*) as count FROM accounts', (err, row) => {
      if (!err && row && row.count === 0) {
        db.run(`
          INSERT INTO accounts (name, type, is_default)
          VALUES ('Default Account', 'default', 1)
        `);
      }
    });
  });
}

// Export the database (SQLite or Supabase client)
module.exports = useSupabase ? supabase : db;
module.exports.isSupabase = useSupabase;
module.exports.supabase = supabase;
module.exports.db = db;
