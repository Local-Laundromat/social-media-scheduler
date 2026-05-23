/**
 * Test Database Connection
 */

require('dotenv').config();
const { Client } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

async function testConnection() {
  console.log('\n🔍 Testing Database Connection...\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Test query
    const result = await client.query('SELECT version()');
    console.log('Database version:', result.rows[0].version);

    // Check existing tables
    const tables = await client.query(`
      SELECT tablename
      FROM pg_catalog.pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log(`\n📋 Found ${tables.rows.length} tables in public schema:`);
    tables.rows.forEach(row => {
      console.log(`   - ${row.tablename}`);
    });

  } catch (error) {
    console.error('\n❌ Connection failed:', error.message);
  } finally {
    await client.end();
  }
}

testConnection();
