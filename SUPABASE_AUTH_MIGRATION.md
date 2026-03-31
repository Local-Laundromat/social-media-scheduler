# Supabase Auth Migration Guide

Your social media scheduler has been migrated to use Supabase Auth! This provides enterprise-grade authentication with better security, scalability, and built-in features.

## What Changed

### Database Schema
- **Old**: Custom `users` table with `password_hash` column
- **New**: Supabase `auth.users` table + custom `profiles` table

### Authentication
- **Old**: Custom JWT tokens with bcrypt password hashing
- **New**: Supabase Auth JWT tokens (more secure, auto-refresh, battle-tested)

### Benefits
- Automatic JWT token refresh
- Built-in email verification
- Password reset via email
- Session management
- Rate limiting and brute-force protection
- OAuth providers (Google, GitHub, etc.) ready to enable
- Multi-factor authentication support

## Setup Instructions

### Step 1: Database Setup (DONE ✅)

You already ran the SQL to create the new schema. It includes:
- `profiles` table for user data
- `posts`, `facebook_accounts`, `instagram_accounts`, `tiktok_accounts` tables
- Row Level Security (RLS) policies
- Automatic profile creation trigger

### Step 2: Update Your .env File

Add these variables to your `.env` file:

```env
# Supabase Configuration
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here

# Optional: Frontend URL for password reset emails
FRONTEND_URL=http://localhost:3000
```

**Where to find these values:**
1. Go to your Supabase project dashboard
2. Click "Settings" → "API"
3. Copy the "Project URL" (SUPABASE_URL)
4. Copy the "anon/public" key (SUPABASE_ANON_KEY)

### Step 3: Update Frontend Files

#### Update login.html

Add the Supabase CDN script and your credentials:

```html
<!-- Add before closing </body> tag -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/supabase-client.js"></script>

<script>
// Update the Supabase credentials in supabase-client.js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
</script>
```

#### Update login form handler

Replace your existing login logic with:

```javascript
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;

  try {
    const data = await SupabaseAuth.signIn(email, password);

    // Redirect to dashboard
    window.location.href = '/dashboard';
  } catch (error) {
    alert(error.message);
  }
});
```

#### Update signup form handler

```javascript
document.getElementById('signupForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value;
  const password = document.getElementById('password').value;
  const name = document.getElementById('name').value;
  const teamName = document.getElementById('teamName').value;

  try {
    const data = await SupabaseAuth.signUp(email, password, name, teamName, null);

    alert('Account created successfully!');
    window.location.href = '/dashboard';
  } catch (error) {
    alert(error.message);
  }
});
```

### Step 4: Update Dashboard to Require Auth

Add this to the top of your `dashboard.html` or `dashboard.js`:

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="/js/supabase-client.js"></script>

<script>
// Protect the dashboard route
window.addEventListener('DOMContentLoaded', async () => {
  await SupabaseAuth.requireAuth();

  // Load user data
  const user = await SupabaseAuth.getCurrentUser();
  console.log('Logged in user:', user);
});
</script>
```

### Step 5: Update API Calls

Replace all API calls to use the auth helper:

**Old way:**
```javascript
const response = await fetch('/api/posts', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

**New way:**
```javascript
const response = await SupabaseAuth.apiRequest('/api/posts', {
  method: 'GET'
});
```

### Step 6: Update supabase-client.js Credentials

Open `/public/js/supabase-client.js` and replace:

```javascript
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // Replace with your actual URL
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY'; // Replace with your actual key
```

## Testing

### Test Registration
1. Go to `http://localhost:3000/login`
2. Click "Sign Up" or create account
3. Enter email, password, name, and team name
4. Click "Create Account"
5. You should be redirected to the dashboard

### Test Login
1. Go to `http://localhost:3000/login`
2. Enter your email and password
3. Click "Login"
4. You should see the dashboard

### Test Password Reset
1. Go to login page
2. Click "Forgot Password"
3. Enter your email
4. Check your email for reset link
5. Click link and set new password

### Verify Database
Run this SQL in Supabase to see your users:

```sql
-- See auth users
SELECT id, email, created_at FROM auth.users;

-- See profiles
SELECT * FROM profiles;

-- See posts linked to users
SELECT p.*, pr.name as user_name
FROM posts p
JOIN profiles pr ON p.user_id = pr.id;
```

## API Endpoints

### New Supabase Auth Endpoints

All mounted under `/api/auth/supabase/`:

- `POST /api/auth/supabase/signup` - Register new user
- `POST /api/auth/supabase/login` - Sign in
- `POST /api/auth/supabase/logout` - Sign out
- `GET /api/auth/supabase/verify` - Verify JWT token
- `GET /api/auth/supabase/me` - Get current user info
- `POST /api/auth/supabase/forgot-password` - Request password reset
- `POST /api/auth/supabase/reset-password` - Reset password

### Legacy Endpoints (Still Available)

- `/api/auth/signup` - Old custom auth (kept for backwards compatibility)
- `/api/auth/login` - Old custom auth
- `/auth/facebook` - Facebook OAuth (still works)
- `/auth/instagram` - Instagram OAuth (still works)

## Common Issues

### Issue: "Invalid authentication token"
**Solution**: Clear localStorage and log in again
```javascript
localStorage.clear();
window.location.href = '/login';
```

### Issue: "RLS policy violation"
**Solution**: Make sure you're authenticated and the token is being sent
- Check that `Authorization: Bearer <token>` header is present
- Verify token with `/api/auth/supabase/verify`

### Issue: "Profile not found"
**Solution**: The trigger should create profiles automatically, but you can manually create one:
```sql
INSERT INTO profiles (id, name)
VALUES ('user-uuid-here', 'User Name');
```

### Issue: Can't receive reset password emails
**Solution**: Configure email in Supabase dashboard:
1. Go to "Authentication" → "Email Templates"
2. Customize the "Reset Password" template
3. Set your SMTP settings or use Supabase's built-in email

## Rollback (If Needed)

If you need to rollback to the old authentication:

1. Comment out the Supabase routes in `server.js`:
```javascript
// app.use('/api/auth/supabase', authSupabaseRoutes);
```

2. Use the old endpoints:
```javascript
// Old login
fetch('/api/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password })
});
```

3. Restore the old `users` table (you'll need to recreate it)

## Next Steps

### Enable Email Verification
1. Go to Supabase Dashboard → Authentication → Settings
2. Toggle "Enable email confirmations"
3. Users will receive verification emails on signup

### Add OAuth Providers
1. Go to Authentication → Providers
2. Enable Google, GitHub, etc.
3. Configure OAuth credentials
4. Users can sign in with one click!

### Enable Multi-Factor Authentication
1. Go to Authentication → Settings
2. Enable "Multi-Factor Authentication"
3. Users can add TOTP/SMS verification

## Support

If you encounter issues:
1. Check the browser console for errors
2. Check your backend logs (`npm run dev`)
3. Verify your Supabase credentials in `.env`
4. Check that the SQL schema was created correctly
5. Ensure RLS policies are enabled

Your app is now using enterprise-grade authentication! 🎉
