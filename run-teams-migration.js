/**
 * Run Teams Migration
 * Applies the teams system migration to Supabase database
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function runMigration() {
  console.log('\n🚀 Running Teams System Migration...\n');

  try {
    // Read migration file
    const migrationPath = path.join(__dirname, 'supabase', 'migrations', 'add-teams-system.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Migration file loaded:', migrationPath);
    console.log('📏 SQL size:', migrationSQL.length, 'characters\n');

    // Execute migration
    console.log('⚙️  Executing migration...\n');

    const { data, error } = await supabase.rpc('exec_sql', {
      sql: migrationSQL
    });

    if (error) {
      // If exec_sql doesn't exist, try direct query
      if (error.code === '42883') {
        console.log('⚠️  exec_sql function not found, using direct query...\n');

        // Split SQL by statement (rough split, may need refinement)
        const statements = migrationSQL
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0 && !s.startsWith('--'));

        for (let i = 0; i < statements.length; i++) {
          const stmt = statements[i] + ';';
          console.log(`Executing statement ${i + 1}/${statements.length}...`);

          const { error: stmtError } = await supabase.rpc('exec', {
            query: stmt
          });

          if (stmtError) {
            console.error(`❌ Error in statement ${i + 1}:`, stmtError);
            throw stmtError;
          }
        }
      } else {
        throw error;
      }
    }

    console.log('\n✅ Teams system migration completed successfully!\n');
    console.log('Created:');
    console.log('  ✓ teams table');
    console.log('  ✓ team_members table');
    console.log('  ✓ team_invitations table');
    console.log('  ✓ Helper functions (generate_team_slug, user_can_manage_team, etc.)');
    console.log('  ✓ Triggers (auto_add_team_owner, update_profile_team_on_accept)');
    console.log('  ✓ Row Level Security policies');
    console.log('  ✓ Analytics views\n');

    console.log('🎉 You can now create teams in your application!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    console.log('\n💡 Alternative: Copy the SQL from supabase/migrations/add-teams-system.sql');
    console.log('   and run it manually in Supabase Dashboard → SQL Editor\n');
    process.exit(1);
  }
}

runMigration();
