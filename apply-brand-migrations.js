/**
 * Apply Brand Migrations to Supabase
 * Fixes the freeze issue when clicking "New Brand"
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function runMigration(filePath, description) {
  console.log(`\n📝 Running: ${description}`);
  console.log(`   File: ${path.basename(filePath)}`);

  try {
    const sql = fs.readFileSync(filePath, 'utf8');

    // Split into individual statements (simple split on semicolon)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--') && s !== '');

    console.log(`   Found ${statements.length} SQL statement(s)`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`   Executing statement ${i + 1}/${statements.length}...`);

      const { data, error } = await supabase.rpc('exec_sql', { sql_string: statement });

      if (error) {
        // Some errors can be ignored (e.g., "already exists")
        if (error.message.includes('already exists') ||
            error.message.includes('duplicate key')) {
          console.log(`   ⚠️  Skipped (already exists): ${error.message.substring(0, 80)}`);
        } else {
          throw error;
        }
      }
    }

    console.log(`   ✅ ${description} completed successfully`);
    return true;
  } catch (error) {
    console.error(`   ❌ Error: ${error.message || error}`);
    console.error(`   Details: ${error.details || error.hint || 'No additional details'}`);
    return false;
  }
}

async function main() {
  console.log('🚀 Applying Brand Migrations to Supabase\n');
  console.log('This will fix the freeze issue when clicking "New Brand"\n');

  const migrations = [
    {
      file: 'supabase/migrations/20260523_create_brand_profiles.sql',
      description: 'Create brand_profiles table and user_can_manage_brand function'
    },
    {
      file: 'supabase/migrations/20260523_link_brands_to_accounts.sql',
      description: 'Link brands to social accounts'
    },
    {
      file: 'supabase/migrations/20260526_ensure_brand_profile_stats_view.sql',
      description: 'Create brand_profile_stats view'
    }
  ];

  let successCount = 0;

  for (const migration of migrations) {
    const filePath = path.join(__dirname, migration.file);

    if (!fs.existsSync(filePath)) {
      console.log(`⚠️  Skipping (file not found): ${migration.file}`);
      continue;
    }

    const success = await runMigration(filePath, migration.description);
    if (success) successCount++;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ Migration complete: ${successCount}/${migrations.length} successful`);
  console.log(`${'='.repeat(60)}\n`);

  if (successCount === migrations.length) {
    console.log('🎉 All migrations applied successfully!');
    console.log('📱 The Brands tab should now work without freezing.');
    console.log('\n💡 Next steps:');
    console.log('   1. Reload your browser');
    console.log('   2. Click on the Brands tab');
    console.log('   3. Try creating a new brand\n');
  } else {
    console.log('⚠️  Some migrations failed. Please check the errors above.');
    console.log('   The app may still freeze when clicking "New Brand".\n');
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
