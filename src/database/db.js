const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Initialize SQLite database
const dbPath = path.join(__dirname, '../../data/posts.db');
const db = new sqlite3.Database(dbPath);

// Create tables
db.serialize(() => {
  // Posts queue table
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

  // Configuration table
  db.run(`
    CREATE TABLE IF NOT EXISTS config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Analytics table
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

  // API Keys table
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

  // Users table (multi-tenant support with authentication)
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Social Media Accounts table (supports multiple FB/IG accounts)
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

  // Webhook logs table
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

  // Create default account if none exists
  db.get('SELECT COUNT(*) as count FROM accounts', (err, row) => {
    if (!err && row.count === 0) {
      db.run(`
        INSERT INTO accounts (name, type, is_default)
        VALUES ('Default Account', 'default', 1)
      `);
    }
  });
});

module.exports = db;
