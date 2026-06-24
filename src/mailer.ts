import nodemailer from "nodemailer";

export async function sendEmail(
  html: string,
  dateStr: string,
  to: string
): Promise<void> {
  console.log(`[mailer] Sending email to ${to} via QQ SMTP...`);

  const transporter = nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 465,
    secure: true,
    auth: {
      user: process.env.SMTP_USER!,
      pass: process.env.SMTP_PASS!,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `"AI Daily Brief" <${process.env.SMTP_USER}>`,
      to,
      subject: `AI Daily Brief / AI 早报 — ${dateStr}`,
      html,
    });

    console.log(`[mailer] Email sent! ID: ${info.messageId}`);
  } catch (err: any) {
    console.error(`[mailer] Send failed: ${err.message}`);
    throw err;
  }
}
