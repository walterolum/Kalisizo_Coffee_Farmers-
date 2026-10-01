import { NextResponse } from "next/server";
import type { ZodTypeAny, z } from "zod";
import { firstZodError } from "@/lib/validators";

/**
 * Shared request-parsing helpers so every API route fails the same way:
 * malformed JSON -> 400, schema violation -> 400 with the offending field, and
 * an unexpected database error -> a generic 503 that never leaks internals.
 */

export function badRequest(message: string, field = "body"): NextResponse {
  return NextResponse.json({ error: "validation", field, message }, { status: 400 });
}

export function unauthorized(message = "Authentication required."): NextResponse {
  return NextResponse.json({ error: "unauthorized", message }, { status: 401 });
}

export function forbidden(message: string): NextResponse {
  return NextResponse.json({ error: "forbidden", message }, { status: 403 });
}

export function notFound(message: string): NextResponse {
  return NextResponse.json({ error: "not_found", message }, { status: 404 });
}

export function serviceUnavailable(message = "The database is temporarily unavailable."): NextResponse {
  return NextResponse.json(
    { error: "service_unavailable", message },
    { status: 503 }
  );
}

/**
 * Parses a JSON request body against `schema`.
 * Returns either the parsed value or a ready-to-send NextResponse.
 */
export async function parseBody<S extends ZodTypeAny>(
  req: Request,
  schema: S
): Promise<{ ok: true; data: z.infer<S> } | { ok: false; response: NextResponse }> {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return { ok: false, response: badRequest("Request body must be valid JSON.") };
  }
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issue = firstZodError(parsed.error);
    return {
      ok: false,
      response: badRequest(issue.message, issue.field),
    };
  }
  return { ok: true, data: parsed.data };
}

/** Reads and validates a single query-string parameter. */
export function queryParam(
  url: URL,
  name: string,
  schema: ZodTypeAny
): { ok: true; value: z.infer<ZodTypeAny> } | { ok: false } {
  const raw = url.searchParams.get(name);
  if (raw === null) return { ok: false };
  const parsed = schema.safeParse(raw);
  return parsed.success ? { ok: true, value: parsed.data } : { ok: false };
}
