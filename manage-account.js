require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function updateEmail() {
  const userId = 'd9d4c74a-3581-4005-92e5-1c7263d8aba0';

  console.log('\n📧 Update Email for Existing Account\n');
  console.log('Current email: aminata@gmail.com');
  console.log('User ID:', userId);
  console.log('Connected Pages: Binta Studios, PK Property Inc\n');

  const newEmail = await question('Enter your REAL email address: ');

  if (!newEmail || !newEmail.includes('@')) {
    console.log('❌ Invalid email address');
    return false;
  }

  try {
    const { data, error } = await supabase.auth.admin.updateUserById(
      userId,
      { email: newEmail }
    );

    if (error) throw error;

    console.log('\n✅ Email updated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`📧 New Email: ${newEmail}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🔑 To set a password:');
    console.log('   1. Go to: http://localhost:3000/login');
    console.log('   2. Click "Forgot Password?"');
    console.log(`   3. Enter: ${newEmail}`);
    console.log('   4. Check your email for reset link\n');

    return true;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

async function transferPages() {
  const oldUserId = 'd9d4c74a-3581-4005-92e5-1c7263d8aba0';

  console.log('\n📦 Transfer Facebook Pages to New Account\n');
  console.log('This will:');
  console.log('  1. Unlink pages from old account (aminata@gmail.com)');
  console.log('  2. Transfer them to a new user ID\n');

  const newUserId = await question('Enter the NEW User ID (UUID) to transfer pages to: ');

  if (!newUserId || newUserId.length !== 36) {
    console.log('❌ Invalid User ID. Must be a valid UUID.');
    console.log('   Tip: Create a new account first, then copy the User ID from the dashboard URL');
    return false;
  }

  try {
    // Check if new user exists
    const { data: newUser, error: userError } = await supabase.auth.admin.getUserById(newUserId);

    if (userError || !newUser) {
      console.log('❌ New user not found. Please create an account first at http://localhost:3000/login');
      return false;
    }

    console.log(`\n✅ Found new account: ${newUser.email}`);

    const confirm = await question(`\nTransfer ALL Facebook pages to ${newUser.email}? (yes/no): `);

    if (confirm.toLowerCase() !== 'yes') {
      console.log('❌ Transfer cancelled');
      return false;
    }

    // Get all Facebook pages from old account
    const { data: fbAccounts, error: fbError } = await supabase
      .from('facebook_accounts')
      .select('*')
      .eq('user_id', oldUserId);

    if (fbError || !fbAccounts || fbAccounts.length === 0) {
      console.log('❌ No Facebook pages found to transfer');
      return false;
    }

    console.log(`\n📘 Found ${fbAccounts.length} Facebook page(s) to transfer:`);
    fbAccounts.forEach((acc, i) => {
      console.log(`   ${i + 1}. ${acc.page_name}`);
    });

    // Update each Facebook account to new user_id
    for (const account of fbAccounts) {
      const { error: updateError } = await supabase
        .from('facebook_accounts')
        .update({ user_id: newUserId })
        .eq('id', account.id);

      if (updateError) {
        console.error(`❌ Failed to transfer ${account.page_name}:`, updateError.message);
      } else {
        console.log(`   ✅ Transferred: ${account.page_name}`);
      }
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ Transfer complete!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log(`📧 Login with: ${newUser.email}`);
    console.log('🌐 Dashboard: http://localhost:3000/dashboard.html\n');

    return true;
  } catch (err) {
    console.error('❌ Error:', err.message);
    return false;
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║   🔧 Account Management Tool           ║');
  console.log('╚════════════════════════════════════════╝\n');
  console.log('What would you like to do?\n');
  console.log('1. Update email (keep same account, just change email)');
  console.log('2. Transfer pages to a different account');
  console.log('3. Exit\n');

  const choice = await question('Enter choice (1/2/3): ');

  switch (choice) {
    case '1':
      await updateEmail();
      break;
    case '2':
      await transferPages();
      break;
    case '3':
      console.log('👋 Goodbye!');
      break;
    default:
      console.log('❌ Invalid choice');
  }

  rl.close();
}

main();
