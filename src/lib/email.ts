import { Resend } from "resend";
import type { ContactInquiry } from "@prisma/client";

const resendApiKey = process.env.RESEND_API_KEY?.trim();
const inbox = process.env.CONTACT_INBOX?.trim() || "kalisizocoop@gmail.com";
const from =
  process.env.RESEND_FROM?.trim() || "Kalisizo Coffee <onboarding@resend.dev>";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderInquiryHtml(inquiry: ContactInquiry): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 12px;color:#64748b;font-size:13px;vertical-align:top;white-space:nowrap;">${label}</td>
      <td style="padding:8px 12px;color:#0f172a;font-size:14px;vertical-align:top;">${value}</td>
    </tr>`;

  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;">
    <div style="background:#0e3d28;padding:20px 24px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;color:#fbf7ef;font-size:18px;">New Contact Inquiry</h1>
      <p style="margin:4px 0 0;color:#eac76c;font-size:13px;">Kalisizo Coffee Farmers Cooperative Society Ltd</p>
    </div>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e2e8f0;border-top:none;border-radius:0 0 12px 12px;">
      ${row("Full Name", escapeHtml(inquiry.fullName))}
      ${row("Email", escapeHtml(inquiry.email))}
      ${row("Phone", escapeHtml(inquiry?.phone ?? "—"))}
      ${row("User Type", escapeHtml(inquiry.userType))}
      ${row("Subject", escapeHtml(inquiry?.subject ?? "—"))}
      ${row("Status", escapeHtml(inquiry.status))}
      <tr>
        <td style="padding:8px 12px;color:#64748b;font-size:13px;vertical-align:top;">Message</td>
        <td style="padding:8px 12px;color:#0f172a;font-size:14px;vertical-align:top;">${escapeHtml(
          inquiry.message
        )}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;color:#64748b;font-size:13px;">Received</td>
        <td style="padding:8px 12px;color:#0f172a;font-size:13px;">${new Date(
          inquiry.createdAt
        ).toLocaleString()}</td>
      </tr>
    </table>
  </div>`;
}

/**
 * Sends a contact-inquiry notification email.
 * Degrades gracefully: when RESEND_API_KEY is not configured the email is
 * only logged, and the API still acknowledges the inquiry.
 */
export async function sendInquiryNotification(
  inquiry: ContactInquiry
): Promise<boolean> {
  if (!resendApiKey) {
    console.log(
      `[email] RESEND_API_KEY not configured — skipping email for inquiry "${inquiry.id}". Deliver to: ${inbox}`
    );
    return false;
  }

  try {
    const resend = new Resend(resendApiKey);
    const { error } = await resend.emails.send({
      from,
      to: [inbox],
      replyTo: inquiry.email,
      subject: `New inquiry from ${inquiry.fullName}`,
      html: renderInquiryHtml(inquiry),
    });
    if (error) {
      console.error("[email] Resend error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] Failed to send inquiry notification:", err);
    return false;
  }
}