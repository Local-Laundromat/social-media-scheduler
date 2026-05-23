-- ============================================
-- CREATE ADMIN ACCOUNT
-- ============================================
-- This script creates an admin account in Supabase Auth
--
-- INSTRUCTIONS:
-- 1. Replace 'your-email@example.com' with your actual admin email
-- 2. Replace 'your-secure-password' with your actual password (min 6 chars)
-- 3. Run this in Supabase SQL Editor
-- 4. Update your .env file: ADMIN_EMAIL=your-email@example.com
-- 5. Login at /login with your email and password
-- 6. Access admin dashboard at /admin
-- ============================================

-- Step 1: Create the admin user in Supabase Auth
-- Replace the email and password below with your actual credentials
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  invited_at,
  confirmation_token,
  confirmation_sent_at,
  recovery_token,
  recovery_sent_at,
  email_change_token_new,
  email_change,
  email_change_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  phone_change,
  phone_change_token,
  phone_change_sent_at,
  email_change_token_current,
  email_change_confirm_status,
  banned_until,
  reauthentication_token,
  reauthentication_sent_at,
  is_sso_user,
  deleted_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'your-email@example.com', -- CHANGE THIS to your admin email
  crypt('your-secure-password', gen_salt('bf')), -- CHANGE THIS to your password
  NOW(),
  NULL,
  '',
  NULL,
  '',
  NULL,
  '',
  '',
  NULL,
  NULL,
  '{"provider":"email","providers":["email"]}',
  '{"name":"Admin"}', -- Optional: change the name
  NULL,
  NOW(),
  NOW(),
  NULL,
  NULL,
  '',
  '',
  NULL,
  '',
  0,
  NULL,
  '',
  NULL,
  false,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM auth.users WHERE email = 'your-email@example.com' -- CHANGE THIS to match above
);

-- Step 2: Create the profile for the admin user
-- This will be automatically created by the trigger, but we can verify
DO $$
DECLARE
  admin_user_id uuid;
BEGIN
  -- Get the user ID we just created
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = 'your-email@example.com' -- CHANGE THIS to your admin email
  LIMIT 1;

  IF admin_user_id IS NOT NULL THEN
    -- Insert or update the profile
    INSERT INTO public.profiles (id, email, name, created_at, updated_at)
    VALUES (
      admin_user_id,
      'your-email@example.com', -- CHANGE THIS to your admin email
      'Admin',
      NOW(),
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      email = EXCLUDED.email,
      name = EXCLUDED.name,
      updated_at = NOW();

    RAISE NOTICE 'Admin account created successfully with user ID: %', admin_user_id;
  ELSE
    RAISE NOTICE 'User not found. Email may already exist.';
  END IF;
END $$;

-- Step 3: Verify the account was created
SELECT
  id,
  email,
  email_confirmed_at,
  created_at
FROM auth.users
WHERE email = 'your-email@example.com'; -- CHANGE THIS to your admin email

-- ============================================
-- IMPORTANT REMINDERS:
-- ============================================
-- 1. Update your .env file with:
--    ADMIN_EMAIL=your-email@example.com
--
-- 2. Login credentials:
--    Email: your-email@example.com
--    Password: your-secure-password
--
-- 3. Admin dashboard URL:
--    http://localhost:3000/admin
--
-- 4. Without ADMIN_EMAIL in .env, you won't have admin access!
-- ============================================
