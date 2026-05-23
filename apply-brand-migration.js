/**
 * Apply Brand Profiles Migration
 * Runs the brand profiles SQL migration on Supabase
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Parse DATABASE_URL
const DATABASE_URL = process.env.DATABASE_URL;

async function applyMigration() {
  console.log('\n🚀 Applying Brand Profiles Migration...\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Connect to database
    await client.connect();
    console.log('✅ Connected to database\n');

    // Read the migration file
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', 'create-brand-profiles.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded');
    console.log(`   Size: ${(migrationSQL.length / 1024).toFixed(2)} KB\n`);

    // Execute the migration
    console.log('⏳ Executing migration...\n');
    await client.query(migrationSQL);

    console.log('✅ Migration applied successfully!\n');
    console.log('📋 Brand profiles system is now ready:');
    console.log('   ✓ brand_profiles table created');
    console.log('   ✓ brand_profile_id added to social_accounts');
    console.log('   ✓ brand_profile_id added to posts');
    console.log('   ✓ Helper functions created');
    console.log('   ✓ RLS policies enabled');
    console.log('   ✓ Views created\n');

    // Verify the tables exist
    console.log('🔍 Verifying tables...\n');

    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN ('brand_profiles')
      ORDER BY table_name
    `);

    console.log('✅ Tables found:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.table_name}`);
    });

    // Check columns added to existing tables
    const columns = await client.query(`
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('social_accounts', 'posts')
        AND column_name = 'brand_profile_id'
      ORDER BY table_name, column_name
    `);

    if (columns.rows.length > 0) {
      console.log('\n✅ Columns added to existing tables:');
      columns.rows.forEach(row => {
        console.log(`   ✓ ${row.table_name}.${row.column_name}`);
      });
    }

    console.log('\n🎉 Brand profiles migration complete!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('\n⚠️  Note: Some objects may already exist - this is normal if re-running migration');
    }
    console.error('\nFull error:', error);
  } finally {
    await client.end();
  }
}

applyMigration();
