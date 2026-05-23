#!/usr/bin/env node
/**
 * Create Admin Account Script
 *
 * Usage: node scripts/create-admin.js
 *
 * This script creates a Supabase admin account with full admin access.
 * The email you use here should match the ADMIN_EMAIL in your .env file.
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function createAdminAccount() {
  console.log('\n🔐 CREATE ADMIN ACCOUNT');
  console.log('='.repeat(50));
  console.log('This script creates an admin account for your SaaS.');
  console.log('The email you provide will have admin dashboard access.');
  console.log('='.repeat(50));
  console.log('');

  // Get email
  const email = await question('Admin Email: ');
  if (!email || !email.includes('@')) {
    console.error('❌ Invalid email address');
    rl.close();
    process.exit(1);
  }

  // Get password
  const password = await question('Admin Password (min 6 chars): ');
  if (!password || password.length < 6) {
    console.error('❌ Password must be at least 6 characters');
    rl.close();
    process.exit(1);
  }

  // Get name (optional)
  const name = await question('Admin Name (optional, press Enter to skip): ') || 'Admin';

  console.log('');
  console.log('Creating admin account...');

  try {
    // Create user in Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          name: name,
          is_admin: true
        },
        // Skip email confirmation for admin accounts
        emailRedirectTo: undefined
      }
    });

    if (authError) {
      throw authError;
    }

    if (!authData.user) {
      throw new Error('User creation failed - no user data returned');
    }

    const userId = authData.user.id;

    console.log('✅ Admin user created in Supabase Auth');
    console.log('   User ID:', userId);
    console.log('   Email:', email);

    // Update the profile to mark as admin
    // Note: The trigger should have already created the profile
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for trigger

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (profileError && profileError.code !== 'PGRST116') {
      console.warn('⚠️  Warning: Could not verify profile creation:', profileError.message);
    } else if (profile) {
      console.log('✅ Profile created successfully');
    }

    // Update .env reminder
    console.log('');
    console.log('🎉 ADMIN ACCOUNT CREATED SUCCESSFULLY!');
    console.log('='.repeat(50));
    console.log('');
    console.log('📝 IMPORTANT: Update your .env file:');
    console.log('');
    console.log(`   ADMIN_EMAIL=${email}`);
    console.log('');
    console.log('Without this, the admin dashboard will not work!');
    console.log('');
    console.log('📍 Access admin dashboard at:');
    console.log(`   http://localhost:3000/admin`);
    console.log('');
    console.log('🔑 Login credentials:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log('');
    console.log('='.repeat(50));

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Error creating admin account:', error.message);
    console.error('');

    if (error.message.includes('already registered')) {
      console.log('💡 This email is already registered.');
      console.log('   If you want to make an existing user admin, update your .env:');
      console.log(`   ADMIN_EMAIL=${email}`);
    }

    rl.close();
    process.exit(1);
  }
}

// Run the script
createAdminAccount();
