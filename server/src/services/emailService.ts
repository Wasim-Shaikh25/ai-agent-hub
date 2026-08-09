import { config } from '../config.js';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/**
 * Sends an email. When SMTP is configured it uses nodemailer; otherwise it
 * logs the message to stdout (dev/test fallback) so flows can still be tested
 * without a real mail server.
 */
export async function sendEmail(msg: EmailMessage): Promise<{ messageId: string }> {
  if (config.smtpHost) {
    const { createTransport } = await import('nodemailer');
    const transporter = createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
    });
    const info = await transporter.sendMail({
      from: config.smtpFrom,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    return { messageId: info.messageId };
  }

  // Dev/test console delivery — prints enough to verify the flow.
  console.log(`[EMAIL] to=${msg.to} subject="${msg.subject}"\n${msg.text}`);
  return { messageId: 'console' };
}

export async function sendOtp(email: string, code: string): Promise<{ messageId: string }> {
  return sendEmail({
    to: email,
    subject: 'Your AI Agent Hub sign-in code',
    text: `Your one-time sign-in code is: ${code}\n\nIt expires in 10 minutes.`,
  });
}

export async function sendPasswordReset(email: string, code: string, link: string): Promise<{ messageId: string }> {
  return sendEmail({
    to: email,
    subject: 'Reset your AI Agent Hub password',
    text: `Use this code to reset your password: ${code}\n\nOr open this link:\n${link}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
  });
}
