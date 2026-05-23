/**
 * Email Service
 * Simple email sending with support for Resend, SendGrid, or SMTP
 */

/**
 * Send team invitation email
 */
async function sendTeamInvitationEmail({
  toEmail,
  teamName,
  inviterName,
  inviteToken,
  role
}) {
  const inviteUrl = `${process.env.APP_URL || 'http://localhost:3000'}/dashboard?invite=${inviteToken}`;

  const subject = `You're invited to join ${teamName} on Quu`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f9fafb;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f9fafb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 40px 40px 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: white; font-size: 28px; font-weight: 600;">Team Invitation</h1>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #1f2937;">
                Hi there!
              </p>

              <p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #1f2937;">
                <strong>${inviterName}</strong> has invited you to join <strong>${teamName}</strong> on Quu as a <strong>${role}</strong>.
              </p>

              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #1f2937;">
                Quu is a social media scheduling platform that helps teams manage their social media presence across multiple platforms.
              </p>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 20px 0; font-size: 14px; line-height: 1.6; color: #6b7280;">
                Or copy and paste this link into your browser:
              </p>

              <p style="margin: 0 0 20px 0; font-size: 13px; line-height: 1.6; color: #6366f1; word-break: break-all;">
                ${inviteUrl}
              </p>

              <p style="margin: 30px 0 0 0; font-size: 14px; line-height: 1.6; color: #9ca3af;">
                This invitation will expire in 7 days.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9fafb; padding: 30px 40px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px 0; font-size: 13px; color: #6b7280; text-align: center;">
                Quu - Social Media Scheduler
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af; text-align: center;">
                If you didn't expect this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;

  const text = `
Hi there!

${inviterName} has invited you to join ${teamName} on Quu as a ${role}.

Accept your invitation by clicking this link:
${inviteUrl}

Or copy and paste this link into your browser:
${inviteUrl}

This invitation will expire in 7 days.

---
Quu - Social Media Scheduler
If you didn't expect this invitation, you can safely ignore this email.
  `.trim();

  return sendEmail({
    to: toEmail,
    subject,
    html,
    text
  });
}

/**
 * Send email using configured provider
 */
async function sendEmail({ to, subject, html, text }) {
  // Check which email provider is configured
  if (process.env.RESEND_API_KEY) {
    return sendViaResend({ to, subject, html, text });
  } else if (process.env.SENDGRID_API_KEY) {
    return sendViaSendGrid({ to, subject, html, text });
  } else if (process.env.SMTP_HOST) {
    return sendViaSMTP({ to, subject, html, text });
  } else {
    // No email provider configured - log to console (dev mode)
    console.log('\n========== EMAIL (No provider configured) ==========');
    console.log('To:', to);
    console.log('Subject:', subject);
    console.log('Text:', text);
    console.log('====================================================\n');

    return {
      success: true,
      message: 'Email logged to console (no provider configured)',
      provider: 'console'
    };
  }
}

/**
 * Send email via Resend (recommended)
 * https://resend.com
 */
async function sendViaResend({ to, subject, html, text }) {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || 'Quu <noreply@yourdomain.com>',
        to: [to],
        subject,
        html,
        text
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Resend API error');
    }

    console.log('✓ Email sent via Resend:', data.id);
    return {
      success: true,
      messageId: data.id,
      provider: 'resend'
    };
  } catch (error) {
    console.error('Resend email error:', error);
    throw error;
  }
}

/**
 * Send email via SendGrid
 * https://sendgrid.com
 */
async function sendViaSendGrid({ to, subject, html, text }) {
  try {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: to }]
        }],
        from: {
          email: process.env.EMAIL_FROM || 'noreply@yourdomain.com',
          name: 'Quu'
        },
        subject,
        content: [
          {
            type: 'text/plain',
            value: text
          },
          {
            type: 'text/html',
            value: html
          }
        ]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`SendGrid API error: ${errorText}`);
    }

    const messageId = response.headers.get('x-message-id');
    console.log('✓ Email sent via SendGrid:', messageId);

    return {
      success: true,
      messageId,
      provider: 'sendgrid'
    };
  } catch (error) {
    console.error('SendGrid email error:', error);
    throw error;
  }
}

/**
 * Send email via SMTP (using nodemailer)
 * For Gmail, Outlook, custom SMTP servers
 */
async function sendViaSMTP({ to, subject, html, text }) {
  try {
    // Dynamically import nodemailer (needs to be installed)
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"Quu" <noreply@yourdomain.com>',
      to,
      subject,
      text,
      html
    });

    console.log('✓ Email sent via SMTP:', info.messageId);

    return {
      success: true,
      messageId: info.messageId,
      provider: 'smtp'
    };
  } catch (error) {
    console.error('SMTP email error:', error);
    throw error;
  }
}

/**
 * Check if email service is configured
 */
function isEmailConfigured() {
  return !!(
    process.env.RESEND_API_KEY ||
    process.env.SENDGRID_API_KEY ||
    process.env.SMTP_HOST
  );
}

/**
 * Get configured email provider name
 */
function getEmailProvider() {
  if (process.env.RESEND_API_KEY) return 'resend';
  if (process.env.SENDGRID_API_KEY) return 'sendgrid';
  if (process.env.SMTP_HOST) return 'smtp';
  return 'none';
}

module.exports = {
  sendTeamInvitationEmail,
  sendEmail,
  isEmailConfigured,
  getEmailProvider
};
