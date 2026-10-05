import { createHash } from "crypto";

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim()
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) + "-" +
    createHash("md5").update(Date.now().toString() + name).digest("hex").slice(0, 6);
}

export function generateToken(): string {
  return createHash("md5")
    .update(Date.now().toString() + Math.random().toString() + "wisesplit")
    .digest("hex")
    .slice(0, 12);
}

/**
 * Anything that can be displayed as money.
 *
 * `number` for values the app computed, `string` for a `Decimal` that has crossed into
 * a client component (`JSON.stringify` renders a Prisma `Decimal` as `"12.34"`, not
 * `12.34`), and `object` for a `Decimal` still on the server. Accepting all three here
 * is what lets every one of the ~21 call sites pass whatever it holds without a
 * conversion at each one.
 *
 * Deliberately dependency-free: client components import this module, so it must not
 * reach for the Prisma runtime. `Number(x)` coerces a `Decimal` correctly through its
 * `valueOf()`, which returns the same decimal string.
 */
export type CurrencyValue = number | string | { toString(): string };

export function formatCurrency(amount: CurrencyValue): string {
  const value = typeof amount === "number" ? amount : Number(amount);
  const abs = Math.abs(value);
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(abs);
  return value < 0 ? `-${formatted}` : formatted;
}

/**
 * Today's date in the *viewer's* local timezone, as `YYYY-MM-DD`.
 *
 * Do NOT use `new Date().toISOString().split("T")[0]` for this: `toISOString()` is
 * UTC, so a user east of UTC (this project's user is UTC+8) opening the form before
 * UTC midnight gets *yesterday's* date pre-filled — a wrong default nobody thinks to
 * check. Built from local getters rather than `toLocaleDateString` so the output
 * does not depend on the runtime's ICU locale data.
 */
export function todayISODate(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Renders a stored expense date as the `YYYY-MM-DD` value an `<input type="date">`
 * expects.
 *
 * Expenses are persisted as UTC midnight (`new Date("YYYY-MM-DD")` in
 * `expenses/_actions.ts`), so reading the calendar day back must also be UTC-based.
 * Using local getters here would shift the day back for every user west of UTC.
 * `todayISODate` above is the mirror image: local going in, because that is where a
 * human's "today" comes from.
 */
export function storedDateToInputValue(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(date));
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
