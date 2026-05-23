/**
 * Verify Brand Profiles Migration
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function verifyBrandProfiles() {
  console.log('\n🔍 Verifying Brand Profiles Migration...\n');

  try {
    // Check brand_profiles table
    const { data: brands, error: brandsError } = await supabase
      .from('brand_profiles')
      .select('*')
      .limit(1);

    if (brandsError) {
      console.log('❌ brand_profiles table check failed:', brandsError.message);
    } else {
      console.log('✅ brand_profiles table exists');
    }

    // Check if brand_profile_id column exists in social_accounts
    const { data: accounts, error: accountsError } = await supabase
      .from('social_accounts')
      .select('id, brand_profile_id')
      .limit(1);

    if (accountsError) {
      console.log('❌ social_accounts.brand_profile_id check failed:', accountsError.message);
    } else {
      console.log('✅ social_accounts.brand_profile_id column exists');
    }

    // Check if brand_profile_id column exists in posts
    const { data: posts, error: postsError } = await supabase
      .from('posts')
      .select('id, brand_profile_id')
      .limit(1);

    if (postsError) {
      console.log('❌ posts.brand_profile_id check failed:', postsError.message);
    } else {
      console.log('✅ posts.brand_profile_id column exists');
    }

    // Check brand_profile_stats view
    const { data: stats, error: statsError } = await supabase
      .from('brand_profile_stats')
      .select('*')
      .limit(1);

    if (statsError) {
      console.log('❌ brand_profile_stats view check failed:', statsError.message);
    } else {
      console.log('✅ brand_profile_stats view exists');
    }

    console.log('\n🎉 Brand Profiles migration verification complete!\n');

  } catch (error) {
    console.error('\n❌ Verification failed:', error.message);
  }
}

verifyBrandProfiles();
