import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

const FROM = `"${process.env.EMAIL_FROM_NAME || "Unbrandit"}" <${process.env.GMAIL_USER}>`;

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const link = `${appUrl}/verify-email?token=${token}`;

  await transporter.sendMail({
    from: FROM,
    to,
    subject: "Verify your Unbrandit account",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; background: #020817; color: #f1f5f9; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #38bdf8, #8b5cf6); padding: 32px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: white; letter-spacing: -0.5px;">Unbrandit</h1>
          <p style="margin: 8px 0 0; color: rgba(255,255,255,0.8); font-size: 14px;">APK WhiteLabel Studio</p>
        </div>
        <div style="padding: 40px 32px;">
          <h2 style="margin: 0 0 12px; font-size: 20px; color: #f1f5f9;">Verify your email address</h2>
          <p style="margin: 0 0 24px; color: #94a3b8; font-size: 15px; line-height: 1.6;">
            Thanks for signing up. Click the button below to verify your email and activate your account.
            This link expires in <strong style="color: #f1f5f9;">24 hours</strong>.
          </p>
          <a href="${link}" style="display: inline-block; background: linear-gradient(135deg, #38bdf8, #8b5cf6); color: white; text-decoration: none; padding: 14px 32px; border-radius: 10px; font-weight: 600; font-size: 15px;">
            Verify my account
          </a>
          <p style="margin: 24px 0 0; color: #475569; font-size: 13px;">
            Or copy this link into your browser:<br/>
            <span style="color: #38bdf8; word-break: break-all;">${link}</span>
          </p>
        </div>
        <div style="padding: 20px 32px; border-top: 1px solid #1e293b; text-align: center;">
          <p style="margin: 0; color: #334155; font-size: 12px;">
            If you didn't create an Unbrandit account, you can safely ignore this email.
          </p>
        </div>
      </div>
    `
  });
}
