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

async function updateEmail() {
  const userId = 'd9d4c74a-3581-4005-92e5-1c7263d8aba0';

  console.log('\n🔧 Update Email for Existing Account\n');
  console.log('Current email: aminata@gmail.com (fake)');
  console.log('User ID:', userId);
  console.log('Connected Pages: Binta Studios, PK Property Inc\n');

  rl.question('Enter your REAL email address: ', async (newEmail) => {
    if (!newEmail || !newEmail.includes('@')) {
      console.log('❌ Invalid email address');
      rl.close();
      return;
    }

    try {
      // Update user email in Supabase Auth
      const { data, error } = await supabase.auth.admin.updateUserById(
        userId,
        { email: newEmail }
      );

      if (error) {
        console.error('❌ Error:', error.message);
        rl.close();
        return;
      }

      console.log('\n✅ Email updated successfully!\n');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`📧 New Email: ${newEmail}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      console.log('🔑 To set a password:');
      console.log('   1. Go to: http://localhost:3000/login');
      console.log('   2. Click "Forgot Password?"');
      console.log(`   3. Enter: ${newEmail}`);
      console.log('   4. Check your email for reset link\n');

      rl.close();
    } catch (err) {
      console.error('❌ Error:', err.message);
      rl.close();
    }
  });
}

updateEmail();
