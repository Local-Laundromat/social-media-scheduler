# Email Setup Guide for Password Reset

## Option 1: Supabase Email (Recommended for Production)

Supabase provides built-in email service for auth emails. No configuration needed in your code!

1. Go to: https://supabase.com/dashboard/project/nnvxkooiwyrlqbxhqxac
2. Navigate to: **Authentication** → **Email Templates**
3. Customize the password reset email template (optional)
4. **Done!** Supabase handles email sending automatically

The password reset already uses Supabase's `resetPasswordForEmail()` function, which sends emails through Supabase's service.

## Option 2: Gmail SMTP (For Custom Email Domain)

If you want to use Gmail to send password reset emails:

### Step 1: Create Gmail App Password

1. Go to your Google Account: https://myaccount.google.com/
2. Enable 2-Factor Authentication (Security → 2-Step Verification)
3. Go to: https://myaccount.google.com/apppasswords
4. Create an app password:
   - Select app: "Mail"
   - Select device: "Other (Custom name)" → Enter "Quu Scheduler"
   - Click "Generate"
   - **Copy the 16-character password** (you won't see it again!)

### Step 2: Update .env File

Edit your `.env` file and add:

```env
# Email Configuration (for password reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-char-app-password
SMTP_FROM=your-email@gmail.com
```

### Step 3: Restart Server

```bash
npm start
```

## Testing Password Reset

1. Go to: http://localhost:3000/login
2. Click "Forgot Password?"
3. Enter your email address
4. Check your email for the reset link
5. Click the link (goes to `/reset-password`)
6. Enter your new password
7. Login!

## Troubleshooting

**Email not arriving?**
- Check spam folder
- Verify Gmail app password is correct
- Make sure 2FA is enabled on your Google account
- Check server logs for email errors

**"Invalid reset link" error?**
- The link expires after a certain time
- Request a new password reset
- Make sure you're clicking the latest email

## Production Notes

For production, consider:
- **SendGrid** (99k emails/month free): https://sendgrid.com
- **Mailgun** (5k emails/month free): https://mailgun.com
- **AWS SES** (62k emails/month free): https://aws.amazon.com/ses/

Update SMTP settings in `.env` with your chosen service.
