import { NextResponse } from "next/server";
import type { ContactInquiry } from "@prisma/client";
import { prisma } from "@/backend/prisma";
import { sendInquiryNotification } from "@/backend/email";
import { clientIp, rateLimit } from "@/backend/rate-limit";
import { contactSchema, firstZodError } from "@/shared/validators";

export async function POST(req: Request) {
  const ip = clientIp(req);
  const limit = rateLimit(`contact:${ip}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: "rate_limited",
        message: "Too many submissions. Please try again in a minute.",
      },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      }
    );
  }

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json(
      { error: "validation", field: "body", message: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  const parsed = contactSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return NextResponse.json(
      { error: "validation", field: issue.field, message: issue.message },
      { status: 400 }
    );
  }

  const data = {
    fullName: parsed.data.fullName,
    phone: parsed.data.phone || null,
    email: parsed.data.email,
    subject: parsed.data.subject || null,
    userType: parsed.data.userType,
    message: parsed.data.message,
  };

  try {
    const inquiry = await prisma.contactInquiry.create({ data });
    const emailed = await sendInquiryNotification(inquiry);
    return NextResponse.json(
      { id: inquiry.id, status: inquiry.status, stored: true, emailed },
      { status: 201 }
    );
  } catch (error) {
    // Database unavailable — still try to route the message by email so the
    // inquiry is not lost, then acknowledge receipt.
    console.error("[api] POST /api/v1/contact — database write failed:", error);
    const now = new Date();
    const fallback: ContactInquiry = {
      id: "unpersisted",
      createdAt: now,
      updatedAt: now,
      status: "PENDING",
      notes: null,
      ...data,
    };
    const emailed = await sendInquiryNotification(fallback);
    return NextResponse.json(
      {
        id: null,
        status: "PENDING",
        stored: false,
        emailed,
        message: emailed
          ? "Your message was delivered to the cooperative."
          : "Your message could not be saved right now. Please call the office.",
      },
      { status: emailed ? 201 : 503 }
    );
  }
}

export const dynamic = "force-dynamic";