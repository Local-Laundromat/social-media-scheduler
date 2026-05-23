-- ============================================
-- DELETE ADMIN ACCOUNT
-- ============================================
-- This script deletes an admin account from Supabase Auth
--
-- INSTRUCTIONS:
-- 1. Replace 'admin-email@example.com' with the admin email to delete
-- 2. Run this in Supabase SQL Editor
-- 3. Update your .env file to remove ADMIN_EMAIL if needed
--
-- WARNING: This permanently deletes the user and all associated data!
-- ============================================

-- Step 1: Get the user ID and verify the account exists
DO $$
DECLARE
  admin_user_id uuid;
  admin_email_input text := 'admin-email@example.com'; -- CHANGE THIS to the email you want to delete
BEGIN
  -- Find the user
  SELECT id INTO admin_user_id
  FROM auth.users
  WHERE email = admin_email_input
  LIMIT 1;

  IF admin_user_id IS NULL THEN
    RAISE NOTICE 'No user found with email: %', admin_email_input;
  ELSE
    RAISE NOTICE 'Found user with ID: %', admin_user_id;
    RAISE NOTICE 'Email: %', admin_email_input;
    RAISE NOTICE 'Proceeding with deletion...';

    -- Step 2: Delete the profile (this will cascade delete related data)
    DELETE FROM public.profiles WHERE id = admin_user_id;
    RAISE NOTICE '✓ Deleted profile for user: %', admin_user_id;

    -- Step 3: Delete the user from auth.users
    DELETE FROM auth.users WHERE id = admin_user_id;
    RAISE NOTICE '✓ Deleted auth user: %', admin_user_id;

    RAISE NOTICE '========================================';
    RAISE NOTICE 'ADMIN ACCOUNT DELETED SUCCESSFULLY!';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Email deleted: %', admin_email_input;
    RAISE NOTICE 'User ID: %', admin_user_id;
    RAISE NOTICE '';
    RAISE NOTICE 'IMPORTANT: If this was your admin email, update .env:';
    RAISE NOTICE 'Remove or change ADMIN_EMAIL=% from your .env file', admin_email_input;
    RAISE NOTICE '========================================';
  END IF;
END $$;

-- Step 4: Verify deletion
SELECT
  id,
  email,
  created_at
FROM auth.users
WHERE email = 'admin-email@example.com'; -- CHANGE THIS to match above

-- Should return no rows if deletion was successful

-- ============================================
-- REMINDERS:
-- ============================================
-- 1. This deletion is PERMANENT and cannot be undone
-- 2. All user data (posts, settings, etc.) will be deleted
-- 3. Update your .env file if this was your admin email
-- 4. If the query returns no rows, deletion was successful
-- ============================================
