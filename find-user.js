require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function findUser() {
  const userId = 'd9d4c74a-3581-4005-92e5-1c7263d8aba0';

  console.log('\n🔍 Looking up user account...\n');

  // Get user from Supabase Auth
  const { data: { user }, error: authError } = await supabase.auth.admin.getUserById(userId);

  if (authError) {
    console.error('Error querying auth.users:', authError.message);

    // Try getting profile instead
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('Error querying profiles:', profileError.message);
      console.log('\n❌ Could not find user account.');
      console.log('\nThis might mean:');
      console.log('1. The account was created directly in the database (not through Supabase Auth)');
      console.log('2. You need to use the service role key (SUPABASE_SERVICE_ROLE_KEY) in .env');
      return;
    }

    console.log('Found profile:', profile);
    console.log('\n⚠️  This user exists in profiles but not in Supabase Auth.');
    console.log('\nRecommendation: Create a new Supabase Auth account and link these Facebook pages to it.');
    return;
  }

  console.log('✅ Found account!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`📧 Email: ${user.email}`);
  console.log(`🆔 User ID: ${user.id}`);
  console.log(`📅 Created: ${new Date(user.created_at).toLocaleString()}`);
  console.log(`✉️  Email Confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Get Facebook pages
  const { data: fbAccounts, error: fbError } = await supabase
    .from('facebook_accounts')
    .select('*')
    .eq('user_id', userId);

  if (fbAccounts && fbAccounts.length > 0) {
    console.log('📘 Connected Facebook Pages:');
    fbAccounts.forEach((acc, i) => {
      console.log(`   ${i + 1}. ${acc.page_name} (Page ID: ${acc.page_id})`);
    });
    console.log('');
  }

  console.log('\n🔑 To reset your password:');
  console.log(`   1. Go to: http://localhost:3000/login`);
  console.log(`   2. Click "Forgot Password?"`);
  console.log(`   3. Enter email: ${user.email}`);
  console.log(`   4. Check your email for reset link\n`);
}

findUser().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
