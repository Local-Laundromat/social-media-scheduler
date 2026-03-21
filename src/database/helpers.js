/**
 * Database Helper Functions
 * Works with both SQLite and Supabase PostgreSQL
 */

const dbModule = require('./db');
const db = dbModule.isSupabase ? dbModule.supabase : dbModule.db;
const isSupabase = dbModule.isSupabase;

/**
 * Execute a raw query
 */
async function query(sql, params = []) {
  if (isSupabase) {
    throw new Error('Use Supabase query methods for PostgreSQL');
  }

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

/**
 * Get a single row from a table
 */
async function get(table, where = {}) {
  if (isSupabase) {
    let query = db.from(table).select('*');

    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { data, error } = await query.single();
    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows
    return data;
  } else {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
    const sql = `SELECT * FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;

    return new Promise((resolve, reject) => {
      db.get(sql, values, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

/**
 * Get all rows from a table
 */
async function getAll(table, where = {}, options = {}) {
  const { orderBy, limit, offset } = options;

  if (isSupabase) {
    let query = db.from(table).select('*');

    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    if (orderBy) {
      const [col, dir = 'asc'] = orderBy.split(' ');
      query = query.order(col, { ascending: dir.toLowerCase() === 'asc' });
    }

    if (limit) query = query.limit(limit);
    if (offset) query = query.offset(offset);

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  } else {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.map(k => `${k} = ?`).join(' AND ');

    let sql = `SELECT * FROM ${table}`;
    if (whereClause) sql += ` WHERE ${whereClause}`;
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
    if (limit) {
      sql += ` LIMIT ${limit}`;
      if (offset) sql += ` OFFSET ${offset}`;
    }

    return new Promise((resolve, reject) => {
      db.all(sql, values, (err, rows) => {
        if (err) reject(err);
        else resolve(rows || []);
      });
    });
  }
}

/**
 * Insert a row
 */
async function insert(table, data) {
  if (isSupabase) {
    const { data: result, error } = await db.from(table).insert(data).select().single();
    if (error) throw error;
    return result;
  } else {
    const keys = Object.keys(data);
    const values = Object.values(data);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;

    return new Promise((resolve, reject) => {
      db.run(sql, values, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      });
    });
  }
}

/**
 * Update rows
 */
async function update(table, where, data) {
  if (isSupabase) {
    let query = db.from(table).update(data);

    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { error } = await query;
    if (error) throw error;
  } else {
    const dataKeys = Object.keys(data);
    const dataValues = Object.values(data);
    const whereKeys = Object.keys(where);
    const whereValues = Object.values(where);

    const setClause = dataKeys.map(k => `${k} = ?`).join(', ');
    const whereClause = whereKeys.map(k => `${k} = ?`).join(' AND ');
    const sql = `UPDATE ${table} SET ${setClause}${whereClause ? ` WHERE ${whereClause}` : ''}`;

    return new Promise((resolve, reject) => {
      db.run(sql, [...dataValues, ...whereValues], function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }
}

/**
 * Delete rows
 */
async function deleteRows(table, where) {
  if (isSupabase) {
    let query = db.from(table).delete();

    Object.entries(where).forEach(([key, value]) => {
      query = query.eq(key, value);
    });

    const { error } = await query;
    if (error) throw error;
  } else {
    const keys = Object.keys(where);
    const values = Object.values(where);
    const whereClause = keys.map(k => `${k} = ?`).join(' AND ');
    const sql = `DELETE FROM ${table}${whereClause ? ` WHERE ${whereClause}` : ''}`;

    return new Promise((resolve, reject) => {
      db.run(sql, values, function (err) {
        if (err) reject(err);
        else resolve({ changes: this.changes });
      });
    });
  }
}

/**
 * Execute a custom query with proper error handling
 */
async function customQuery(sqliteQuery, sqliteParams, supabaseQuery) {
  if (isSupabase) {
    return await supabaseQuery();
  } else {
    return new Promise((resolve, reject) => {
      db.all(sqliteQuery, sqliteParams, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
}

/**
 * Get a single value from a custom query
 */
async function customGet(sqliteQuery, sqliteParams, supabaseQuery) {
  if (isSupabase) {
    return await supabaseQuery();
  } else {
    return new Promise((resolve, reject) => {
      db.get(sqliteQuery, sqliteParams, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }
}

/**
 * Run a command (for SQLite, or use Supabase function)
 */
async function run(sqliteQuery, sqliteParams, supabaseQuery) {
  if (isSupabase) {
    return await supabaseQuery();
  } else {
    return new Promise((resolve, reject) => {
      db.run(sqliteQuery, sqliteParams, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }
}

module.exports = {
  db,
  isSupabase,
  query,
  get,
  getAll,
  insert,
  update,
  deleteRows,
  customQuery,
  customGet,
  run,
};
