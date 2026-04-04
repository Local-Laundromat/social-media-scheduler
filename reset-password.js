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

async function resetPassword() {
  console.log('\n🔐 Reset Password Tool\n');

  const email = await question('Enter your email address: ');

  if (!email || !email.includes('@')) {
    console.log('❌ Invalid email address');
    rl.close();
    return;
  }

  // Find user by email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

  if (listError) {
    console.error('❌ Error finding user:', listError.message);
    rl.close();
    return;
  }

  const user = users.find(u => u.email === email);

  if (!user) {
    console.log('❌ No account found with that email');
    rl.close();
    return;
  }

  console.log(`\n✅ Found account: ${user.email}`);
  console.log(`User ID: ${user.id}\n`);

  const newPassword = await question('Enter new password (min 6 characters): ');

  if (newPassword.length < 6) {
    console.log('❌ Password must be at least 6 characters');
    rl.close();
    return;
  }

  try {
    // Update password using admin API
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (error) throw error;

    console.log('\n✅ Password updated successfully!\n');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('You can now login with:');
    console.log(`📧 Email: ${email}`);
    console.log(`🔑 Password: ${newPassword}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('🌐 Login at: http://localhost:3000/login\n');

    rl.close();
  } catch (err) {
    console.error('❌ Error:', err.message);
    rl.close();
  }
}

resetPassword();
