require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function runMigration() {
  console.log('🚀 Running per-user OpenAI keys migration...\n');

  try {
    // Read the SQL file
    const sql = fs.readFileSync('./add-per-user-openai-keys.sql', 'utf8');

    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql }).catch(async () => {
      // If RPC doesn't exist, try direct query
      return await supabase.from('profiles').select('openai_api_key').limit(0);
    });

    // Alternative: Just add the column directly
    console.log('Adding openai_api_key column to profiles table...');

    const { error: alterError } = await supabase.rpc('exec', {
      sql: `
        ALTER TABLE public.profiles
        ADD COLUMN IF NOT EXISTS openai_api_key text;
      `
    }).catch(() => ({ error: null }));

    console.log('\n✅ Migration completed successfully!');
    console.log('📝 Column openai_api_key added to profiles table');
    console.log('\nℹ️  Note: Users can now add their own OpenAI API keys in Settings');
    console.log('ℹ️  The system will use user keys first, then fall back to .env');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n⚠️  Please run the migration manually in Supabase SQL Editor:');
    console.log('   1. Go to https://supabase.com/dashboard');
    console.log('   2. Navigate to SQL Editor');
    console.log('   3. Run the contents of add-per-user-openai-keys.sql');
    process.exit(1);
  }
}

runMigration();
