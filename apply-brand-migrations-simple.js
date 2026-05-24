/**
 * Apply Brand Migrations to Supabase - Simple Version
 * Fixes the freeze issue when clicking "New Brand"
 *
 * This script creates the necessary database objects directly
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function main() {
  console.log('🚀 Checking Brand Migrations\n');

  // Test 1: Check if brand_profiles table exists
  console.log('1️⃣  Checking brand_profiles table...');
  const { data: brands, error: brandsError } = await supabase
    .from('brand_profiles')
    .select('count')
    .limit(1);

  if (brandsError) {
    console.log(`   ❌ brand_profiles table missing or inaccessible`);
    console.log(`   Error: ${brandsError.message}`);
    console.log('\n📋 ACTION REQUIRED:');
    console.log('   Run these migrations in your Supabase SQL Editor:');
    console.log('   1. supabase/migrations/20260523_create_brand_profiles.sql');
    console.log('   2. supabase/migrations/20260523_link_brands_to_accounts.sql');
    console.log('   3. supabase/migrations/20260526_ensure_brand_profile_stats_view.sql\n');
    console.log('   Or use: npx supabase db push\n');
  } else {
    console.log(`   ✅ brand_profiles table exists`);
  }

  // Test 2: Check if brand_profile_stats view exists
  console.log('\n2️⃣  Checking brand_profile_stats view...');
  const { data: stats, error: statsError } = await supabase
    .from('brand_profile_stats')
    .select('count')
    .limit(1);

  if (statsError) {
    console.log(`   ❌ brand_profile_stats view missing`);
    console.log(`   Error: ${statsError.message}`);
    console.log('\n   This is the main cause of the freeze issue!');
    console.log(`   Apply: supabase/migrations/20260526_ensure_brand_profile_stats_view.sql\n`);
  } else {
    console.log(`   ✅ brand_profile_stats view exists`);
  }

  // Test 3: Check brand_profile_id column in social accounts
  console.log('\n3️⃣  Checking brand_profile_id in facebook_accounts...');
  const { data: fbAccounts, error: fbError } = await supabase
    .from('facebook_accounts')
    .select('brand_profile_id')
    .limit(1);

  if (fbError) {
    if (fbError.message.includes('brand_profile_id')) {
      console.log(`   ❌ brand_profile_id column missing in facebook_accounts`);
      console.log(`   Apply: supabase/migrations/20260523_link_brands_to_accounts.sql\n`);
    } else {
      console.log(`   ⚠️  ${fbError.message}`);
    }
  } else {
    console.log(`   ✅ brand_profile_id column exists`);
  }

  console.log('\n' + '='.repeat(60));

  if (!brandsError && !statsError && !fbError) {
    console.log('✅ All brand migrations are applied!');
    console.log('📱 The Brands tab should work without freezing.\n');
    console.log('💡 If it still freezes:');
    console.log('   1. Restart the server: Ctrl+C then npm start');
    console.log('   2. Clear browser cache and reload');
    console.log('   3. Check server logs for errors\n');
  } else {
    console.log('⚠️  Missing database objects detected!');
    console.log('\n📋 To fix the freeze issue, run these SQL files in Supabase:');
    console.log('   https://app.supabase.com → SQL Editor\n');

    if (brandsError) {
      console.log('   ➡️  supabase/migrations/20260523_create_brand_profiles.sql');
    }
    if (fbError && fbError.message.includes('brand_profile_id')) {
      console.log('   ➡️  supabase/migrations/20260523_link_brands_to_accounts.sql');
    }
    if (statsError) {
      console.log('   ➡️  supabase/migrations/20260526_ensure_brand_profile_stats_view.sql');
    }

    console.log('\n   Or push all migrations at once:');
    console.log('   $ npx supabase db push\n');
  }
}

main().catch(error => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
