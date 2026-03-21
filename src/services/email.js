const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    // Configure email transporter
    // For development, we'll use a test account or console log
    // For production, use a real SMTP service like Gmail, SendGrid, etc.

    if (process.env.SMTP_HOST && process.env.SMTP_USER) {
      // Production email setup
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
    } else {
      // Development mode - just log to console
      this.transporter = null;
      console.log('⚠️  Email service in development mode - emails will be logged to console');
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordReset(email, resetToken) {
    const resetUrl = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: process.env.SMTP_FROM || 'noreply@quu.app',
      to: email,
      subject: 'Reset Your Password - Quu',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #facc15 0%, #ca8a04 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
            .header h1 { color: #1f2937; margin: 0; }
            .content { background: #fff; padding: 30px; border: 1px solid #e5e7eb; }
            .button { display: inline-block; padding: 14px 28px; background: linear-gradient(135deg, #facc15 0%, #ca8a04 100%); color: #1f2937; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; color: #6b7280; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🔐 Password Reset Request</h1>
            </div>
            <div class="content">
              <p>Hi there,</p>
              <p>We received a request to reset your password for your Quu account.</p>
              <p>Click the button below to reset your password. This link will expire in 1 hour.</p>
              <p style="text-align: center;">
                <a href="${resetUrl}" class="button">Reset Password</a>
              </p>
              <p>Or copy and paste this link into your browser:</p>
              <p style="background: #f3f4f6; padding: 12px; border-radius: 6px; word-break: break-all; font-size: 13px;">
                ${resetUrl}
              </p>
              <p><strong>Didn't request this?</strong> You can safely ignore this email.</p>
            </div>
            <div class="footer">
              <p>Quu - Social Media Scheduler</p>
              <p>This is an automated email, please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Password Reset Request

We received a request to reset your password for your Quu account.

Click this link to reset your password (expires in 1 hour):
${resetUrl}

Didn't request this? You can safely ignore this email.

---
Quu - Social Media Scheduler
      `
    };

    if (this.transporter) {
      // Send actual email
      try {
        await this.transporter.sendMail(mailOptions);
        console.log(`✅ Password reset email sent to ${email}`);
        return { success: true };
      } catch (error) {
        console.error('❌ Email send error:', error);
        return { success: false, error: error.message };
      }
    } else {
      // Development mode - just log
      console.log('\n📧 PASSWORD RESET EMAIL (Development Mode)');
      console.log('═'.repeat(60));
      console.log(`To: ${email}`);
      console.log(`Reset Link: ${resetUrl}`);
      console.log('═'.repeat(60));
      console.log('⚠️  In production, add SMTP credentials to .env\n');
      return { success: true, devMode: true };
    }
  }
}

module.exports = new EmailService();
