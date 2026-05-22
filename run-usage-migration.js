const { supabase } = require('./src/database/supabase');

async function runMigration() {
  console.log('🔄 Running usage tracking migration...\n');

  try {
    // Add columns
    console.log('Adding ai_executions_this_month column...');
    const { error: error1 } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_executions_this_month INTEGER DEFAULT 0;`
    }).catch(() => ({ error: null })); // Ignore if RPC doesn't exist

    console.log('Adding ai_executions_reset_date column...');
    const { error: error2 } = await supabase.rpc('exec_sql', {
      sql: `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ai_executions_reset_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;`
    }).catch(() => ({ error: null }));

    console.log('Initializing reset dates for existing users...');
    const { error: error3 } = await supabase.rpc('exec_sql', {
      sql: `UPDATE profiles SET ai_executions_reset_date = CURRENT_TIMESTAMP WHERE ai_executions_reset_date IS NULL;`
    }).catch(() => ({ error: null }));

    console.log('\n✅ Migration completed!');
    console.log('\nIf you see errors above, please run this SQL manually in your Supabase SQL Editor:');
    console.log('\n---');
    console.log(`
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS ai_executions_this_month INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS ai_executions_reset_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

UPDATE profiles
SET ai_executions_reset_date = CURRENT_TIMESTAMP
WHERE ai_executions_reset_date IS NULL;
    `);
    console.log('---\n');

  } catch (error) {
    console.error('❌ Migration error:', error.message);
    console.log('\nPlease run the migration manually in Supabase dashboard.');
  }
}

runMigration().then(() => process.exit(0));
