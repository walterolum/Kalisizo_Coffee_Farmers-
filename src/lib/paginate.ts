/**
 * Pagination and search helpers shared by the public and admin list endpoints.
 *
 * Every list endpoint is paginated so no page can request an unbounded number of
 * rows. `PAGE_SIZE` is the default; `MAX_PAGE_SIZE` caps what a caller may ask
 * for regardless of the query string.
 */
import { NextResponse } from "next/server";

export const PAGE_SIZE = 12;
export const MAX_PAGE_SIZE = 50;

/** Clamped, 1-based page number. */
export function parsePage(raw: string | null): number {
  const value = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(value) || value < 1) return 1;
  return value;
}

/** Clamped page size, protecting the database from oversized requests. */
export function parsePageSize(raw: string | null, fallback = PAGE_SIZE): number {
  const value = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, MAX_PAGE_SIZE);
}

export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrevious: boolean;
};

/** Runs a count + find pair and normalises the result into a paginated envelope. */
export async function paginate<T>(
  count: () => Promise<number>,
  find: (skip: number, take: number) => Promise<T[]>,
  page: number,
  pageSize: number
): Promise<Paginated<T>> {
  const total = await count();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const items = await find((safePage - 1) * pageSize, pageSize);
  return {
    items,
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasNext: safePage < totalPages,
    hasPrevious: safePage > 1,
  };
}

export function jsonPage<T>(payload: Paginated<T>, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Escapes a user-supplied search term for a Postgres LIKE/ILIKE pattern so `%`
 * and `_` in the query are matched literally rather than as wildcards.
 */
export function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
