/**
 * Database Service - Unified interface for SQLite and PostgreSQL
 * Automatically switches based on environment (local vs production)
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Determine if we're using Supabase (PostgreSQL) or SQLite
const useSupabase = process.env.DATABASE_URL || (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY);

let db = null;
let supabase = null;

/**
 * Initialize database connection
 */
function initDatabase() {
  if (useSupabase) {
    console.log('🔷 Using Supabase PostgreSQL database');

    // Use service role key for backend operations (bypasses RLS)
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required for production');
    }

    supabase = createClient(supabaseUrl, supabaseKey);
    console.log('✅ Connected to Supabase PostgreSQL');
  } else {
    console.log('🗄️  Using SQLite database (local development)');
    const sqlite3 = require('sqlite3').verbose();
    const path = require('path');
    const dbPath = path.join(__dirname, '../../data/posts.db');
    db = new sqlite3.Database(dbPath);
    console.log('✅ Connected to SQLite:', dbPath);
  }
}

/**
 * Query helper - works with both SQLite and PostgreSQL
 */
async function query(sql, params = []) {
  if (useSupabase) {
    // This is for raw SQL queries - not commonly used with Supabase
    // Most operations should use the table-specific functions below
    throw new Error('Raw SQL queries not supported with Supabase. Use table-specific functions.');
  } else {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

/**
 * Run helper - works with both SQLite and PostgreSQL
 */
async function run(sql, params = []) {
  if (useSupabase) {
    throw new Error('Raw SQL queries not supported with Supabase. Use table-specific functions.');
  } else {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
}

/**
 * Get a single row
 */
async function get(sql, params = []) {
  if (useSupabase) {
    throw new Error('Raw SQL queries not supported with Supabase. Use table-specific functions.');
  } else {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

// ===== USER OPERATIONS =====

async function createUser(userData) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const result = await run(
      `INSERT INTO users (email, password_hash, name, company, api_key)
       VALUES (?, ?, ?, ?, ?)`,
      [userData.email, userData.password_hash, userData.name, userData.company, userData.api_key]
    );
    return { id: result.id, ...userData };
  }
}

async function getUserByEmail(email) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    return data;
  } else {
    return await get('SELECT * FROM users WHERE email = ?', [email]);
  }
}

async function getUserById(id) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  } else {
    return await get('SELECT * FROM users WHERE id = ?', [id]);
  }
}

async function updateUser(id, updates) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    await run(`UPDATE users SET ${fields} WHERE id = ?`, values);
    return await getUserById(id);
  }
}

// ===== POST OPERATIONS =====

async function createPost(postData) {
  if (useSupabase) {
    // Convert platforms array to JSON string for PostgreSQL
    const data = {
      ...postData,
      platforms: JSON.stringify(postData.platforms)
    };

    const { data: result, error } = await supabase
      .from('posts')
      .insert([data])
      .select()
      .single();

    if (error) throw error;
    return result;
  } else {
    const result = await run(
      `INSERT INTO posts (user_id, filename, filepath, filetype, caption, platforms, scheduled_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        postData.user_id,
        postData.filename,
        postData.filepath,
        postData.filetype,
        postData.caption,
        JSON.stringify(postData.platforms),
        postData.scheduled_time,
        postData.status || 'pending'
      ]
    );
    return { id: result.id, ...postData };
  }
}

async function getPostsByUserId(userId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } else {
    return await query('SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC', [userId]);
  }
}

async function getPendingPosts() {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .eq('status', 'pending')
      .lte('scheduled_time', new Date().toISOString())
      .order('scheduled_time', { ascending: true });

    if (error) throw error;
    return data || [];
  } else {
    return await query(
      `SELECT * FROM posts
       WHERE status = 'pending'
       AND scheduled_time <= datetime('now')
       ORDER BY scheduled_time ASC`
    );
  }
}

async function updatePost(id, updates) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('posts')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = [...Object.values(updates), id];
    await run(`UPDATE posts SET ${fields} WHERE id = ?`, values);
    return await get('SELECT * FROM posts WHERE id = ?', [id]);
  }
}

async function deletePost(id) {
  if (useSupabase) {
    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', id);

    if (error) throw error;
    return { success: true };
  } else {
    await run('DELETE FROM posts WHERE id = ?', [id]);
    return { success: true };
  }
}

// ===== COMMENT REPLY OPERATIONS =====

async function createCommentReply(replyData) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('comment_replies')
      .insert([replyData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const result = await run(
      `INSERT INTO comment_replies (user_id, platform, comment_id, comment_text, reply_text, reply_id, was_auto_reply)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        replyData.user_id,
        replyData.platform,
        replyData.comment_id,
        replyData.comment_text,
        replyData.reply_text,
        replyData.reply_id,
        replyData.was_auto_reply ? 1 : 0
      ]
    );
    return { id: result.id, ...replyData };
  }
}

async function getCommentRepliesByUserId(userId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('comment_replies')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } else {
    return await query(
      'SELECT * FROM comment_replies WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
  }
}

// ===== WEBHOOK LOG OPERATIONS =====

async function createWebhookLog(logData) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('webhook_logs')
      .insert([logData])
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    const result = await run(
      `INSERT INTO webhook_logs (post_id, webhook_url, payload, status_code, response)
       VALUES (?, ?, ?, ?, ?)`,
      [logData.post_id, logData.webhook_url, logData.payload, logData.status_code, logData.response]
    );
    return { id: result.id, ...logData };
  }
}

// Export functions
module.exports = {
  initDatabase,
  isSupabase: () => !!useSupabase,

  // User operations
  createUser,
  getUserByEmail,
  getUserById,
  updateUser,

  // Post operations
  createPost,
  getPostsByUserId,
  getPendingPosts,
  updatePost,
  deletePost,

  // Comment reply operations
  createCommentReply,
  getCommentRepliesByUserId,

  // Webhook log operations
  createWebhookLog,

  // Raw access (for backwards compatibility)
  db: () => db,
  supabase: () => supabase
};
