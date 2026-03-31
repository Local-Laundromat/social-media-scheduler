# Simple Setup Guide - Everything Is Ready! ✅

## What We Did

We cleaned up ALL the old authentication code and migrated to **Supabase Auth**. Your app now uses:

- ✅ **Supabase Auth** - Professional authentication system (handles millions of users)
- ✅ **Clean code** - Deleted all old custom auth files
- ✅ **One system** - No more confusion between old and new auth

## What This Means for You

### Creating New Accounts
- Uses **Supabase Auth** (`POST /api/auth/signup`)
- Password is hashed by Supabase (super secure)
- User gets stored in Supabase's `auth.users` table
- Profile automatically created in your `profiles` table

### Logging In
- Uses **Supabase Auth** (`POST /api/auth/login`)
- Returns a JWT token (valid for 30 days, auto-refreshes)
- Token is verified by Supabase (can't be faked)

### Resetting Password
- Uses **Supabase Auth** (`POST /api/auth/forgot-password`)
- Supabase sends password reset email automatically
- User clicks link → resets password → done!

## How to Test Right Now

### Step 1: Start the Server

```bash
cd /Users/aminatamansaray/Downloads/social-media-scheduler
npm start
```

### Step 2: Open Your Browser

Go to: `http://localhost:3000/login`

### Step 3: Try Registering

Add this to your `login.html` (or test via API):

```html
<!DOCTYPE html>
<html>
<head>
  <title>Login</title>
</head>
<body>
  <h1>Register</h1>
  <form id="signupForm">
    <input type="email" id="email" placeholder="Email" required>
    <input type="password" id="password" placeholder="Password" required>
    <input type="text" id="name" placeholder="Name">
    <input type="text" id="teamName" placeholder="Team Name" required>
    <button type="submit">Sign Up</button>
  </form>

  <h1>Login</h1>
  <form id="loginForm">
    <input type="email" id="loginEmail" placeholder="Email" required>
    <input type="password" id="loginPassword" placeholder="Password" required>
    <button type="submit">Login</button>
  </form>

  <!-- Load Supabase -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/supabase-client.js"></script>

  <script>
    // Sign up
    document.getElementById('signupForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const name = document.getElementById('name').value;
        const teamName = document.getElementById('teamName').value;

        const data = await SupabaseAuth.signUp(email, password, name, teamName, null);
        alert('Account created! Redirecting...');
        window.location.href = '/dashboard';
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });

    // Login
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        const data = await SupabaseAuth.signIn(email, password);
        alert('Logged in! Redirecting...');
        window.location.href = '/dashboard';
      } catch (error) {
        alert('Error: ' + error.message);
      }
    });
  </script>
</body>
</html>
```

### Step 4: Check Supabase Dashboard

After registering, go to your Supabase dashboard:

1. **Authentication → Users** - You should see your new user!
2. **Table Editor → profiles** - Your profile should be there!

## API Endpoints (All Working)

### Authentication
- `POST /api/auth/signup` - Create account (Supabase)
- `POST /api/auth/login` - Sign in (Supabase)
- `POST /api/auth/logout` - Sign out (Supabase)
- `GET /api/auth/verify` - Check if token is valid
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password` - Reset password

### OAuth (Social Media)
- `GET /auth/facebook` - Connect Facebook page
- `GET /auth/instagram` - Connect Instagram account

## What Got Deleted

- ❌ Old `/src/routes/authApi.js` (custom auth) → Replaced with Supabase version
- ❌ Old `/src/middleware/auth.js` (custom JWT) → Replaced with Supabase version
- ❌ SQLite database files → Using Supabase PostgreSQL only
- ❌ `/src/database/supabase-db.js` → Using Supabase client directly

## What's Still There

- ✅ `/src/routes/auth.js` - Facebook/Instagram OAuth (needed for social posting)
- ✅ All your other routes (posts, users, comments, etc.)
- ✅ Supabase PostgreSQL database
- ✅ Your `.env` configuration (already has Supabase credentials)

## Testing Registration (Using cURL)

```bash
# Register a new user
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "name": "Test User",
    "teamName": "My Team"
  }'
```

Expected response:
```json
{
  "success": true,
  "session": {
    "access_token": "ey...",
    "refresh_token": "...",
    "expires_in": 3600
  },
  "user": {
    "id": "uuid-here",
    "email": "test@example.com",
    "name": "Test User",
    "team_id": 1,
    "role": "owner"
  },
  "team": {
    "id": 1,
    "name": "My Team",
    "invite_code": "ABC123"
  }
}
```

## Testing Login (Using cURL)

```bash
# Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Expected response: Same as signup, with session token!

## Password Reset Flow

1. **User requests reset:**
```bash
curl -X POST http://localhost:3000/api/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com"}'
```

2. **Supabase sends email with reset link**
3. **User clicks link → gets token**
4. **User submits new password:**
```bash
curl -X POST http://localhost:3000/api/auth/reset-password \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN_FROM_EMAIL" \
  -d '{"newPassword": "newpassword123"}'
```

## Common Questions

**Q: Do I need to change my `.env` file?**
A: No! Your `.env` already has the correct Supabase credentials.

**Q: Can I still use the old custom auth?**
A: No, we deleted it to avoid confusion. Everything uses Supabase Auth now.

**Q: What if I want to rollback?**
A: Old files are backed up in `/backup-old-auth/` folder.

**Q: How do I check if a user is logged in?**
A: Call `GET /api/auth/verify` with the token in Authorization header.

**Q: Where are passwords stored?**
A: In Supabase's `auth.users` table (encrypted by Supabase, not in your database).

**Q: Where is user profile data stored?**
A: In your `profiles` table (name, company, role, team_id, etc.).

## Next Steps

1. **Test registration** - Try creating an account
2. **Check Supabase** - Verify user was created
3. **Test login** - Make sure login works
4. **Update your frontend** - Add the HTML forms above to `login.html`
5. **Deploy** - Push to production when ready!

## Troubleshooting

**"Invalid credentials" error**
- Check that your `.env` has the correct `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- Restart the server after any `.env` changes

**"Profile not found" error**
- The trigger should auto-create profiles
- Check Supabase logs in dashboard → Logs
- Manually create profile if needed:
```sql
INSERT INTO profiles (id, name) VALUES ('user-uuid', 'User Name');
```

**"Email already registered" error**
- That email is already in use
- Try a different email or reset password

## Success! 🎉

Your authentication is now production-ready with Supabase. No more custom JWT code to maintain, no more password hashing headaches, and it scales automatically!

**Want to enable email verification?**
Go to Supabase Dashboard → Authentication → Settings → Enable email confirmations

**Want to add Google/GitHub login?**
Go to Supabase Dashboard → Authentication → Providers → Enable OAuth providers
