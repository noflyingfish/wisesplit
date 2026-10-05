import { Prisma } from "@prisma/client";

/**
 * Money, the exact way.
 *
 * The four money columns are `DECIMAL` in MariaDB (`Expense.amount`,
 * `ExpenseShare.amount`, `ExpenseShare.percentage`, `Settlement.amount`), so Prisma
 * hands them back as `Decimal` OBJECTS, not JS numbers.
 *
 * WHAT ACTUALLY BREAKS — measured on this stack (Prisma 6.19.3 / decimal.js), because
 * the failure list is narrower than "a Decimal is not a number" suggests, and the
 * dangerous ones are the quiet ones:
 *
 *   `a + b`                      -> "10.055.02"  (STRING CONCATENATION, not 15.07)
 *   `typeof a === "number"`      -> false        (silently, no error anywhere)
 *   `a - b`, `a * n`, `a / n`    -> a plain float, so the exactness is gone
 *                                   (10.05 - 5.02 is 5.030000000000001, not 5.03)
 *   `JSON.stringify`             -> "10.05"      (a STRING reaches the client)
 *   React server -> client prop  -> throws "Decimal objects are not supported"
 *
 * and what does NOT break, despite looking like it should: `Math.abs`, `Math.round`,
 * `Math.min`/`Math.max`, `<` and `>`, `Intl.NumberFormat.format()`, `String()` and even
 * `toFixed()` all coerce through `valueOf()` and appear to work — returning a *float*.
 * That is the trap: they are the paths that keep producing plausible wrong answers
 * instead of errors. `round2` below replaces the `Math.round(n * 100) / 100` idiom with
 * one that rounds the decimal the user meant.
 *
 * So: convert at the EDGES (in and out of the database, in and out of client
 * components), and do every calculation in between with `Decimal` methods —
 * `plus` / `minus` / `times` / `div` / `comparedTo` / `toDecimalPlaces`.
 *
 * Server-only: this module imports the Prisma runtime as a *value*, so importing it
 * from a client component would pull the whole client into the browser bundle.
 * Display formatting that client components need lives in `lib/utils.ts` instead,
 * which is deliberately dependency-free.
 */

/** The Prisma decimal constructor (decimal.js), re-exported so callers need one import. */
export const Decimal = Prisma.Decimal;
export type Money = Prisma.Decimal;

/**
 * Anything that might denote an amount on its way in or out: a `Decimal` straight
 * from Prisma, a plain number, a string (which is what a `Decimal` becomes the
 * moment it crosses into a client component), or nothing at all.
 */
export type MoneyInput = Money | number | string | null | undefined;

/**
 * True for a Prisma `Decimal` (or anything decimal.js-shaped).
 *
 * Exists so money checks stop being written as `typeof x === "number"`, which is
 * false for every `Decimal` and therefore fails *silently*: the edit page used it
 * to decide whether stored percentages were present, so the check answered "no" for
 * correctly-stored rows, dropped them, and fell back to a heuristic that cannot
 * recover them. Nothing threw. Nothing logged. The form just quietly showed
 * "Unequal" instead of the percentages the user had typed.
 */
export function isDecimal(value: unknown): value is Money {
  return Prisma.Decimal.isDecimal(value);
}

/** True for a value that is worth treating as an amount: a Decimal, or a finite number/string. */
export function isMoneyInput(value: unknown): value is Money | number | string {
  if (isDecimal(value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "string") return value.trim() !== "" && Number.isFinite(Number(value));
  return false;
}

/**
 * Normalise to a `Decimal`.
 *
 * Numbers are converted through their string form (`String(10.05)` === `"10.05"`), so
 * the decimal the user actually meant is preserved. This is exactly the trap the old
 * `Math.round(n * 100) / 100` idiom fell into: `1.005 * 100` is `100.49999999999999`
 * in binary, so it rounded to `1.00` where the true decimal answer is `1.01`.
 * `Decimal` rounds the decimal you meant, half-up.
 */
export function toDecimal(value: MoneyInput): Money {
  if (isDecimal(value)) return value;
  if (value === null || value === undefined) return new Decimal(0);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return new Decimal(0);
    return new Decimal(String(value));
  }
  const trimmed = value.trim();
  if (trimmed === "") return new Decimal(0);
  return new Decimal(trimmed);
}

/**
 * Back to a plain JS number. For reading values that are already 2-decimal — the
 * shape every money value has by the time it is displayed, compared against a
 * threshold, or handed to a client component.
 *
 * Do NOT use the result for further arithmetic on unrounded values; that is how the
 * float error gets back in. Round first (`round2`), then convert.
 */
export function toNumber(value: MoneyInput): number {
  return toDecimal(value).toNumber();
}

/**
 * The app's money scale: two decimal places, rounded half-up.
 *
 * Replaces `Math.round(n * 100) / 100` everywhere. Same intent, but it rounds the
 * decimal rather than whatever the binary representation happened to be, and it is
 * the same answer on every machine.
 */
export function round2(value: MoneyInput): Money {
  return toDecimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Sum of a list of amounts, as an exact `Decimal`. `Decimal.sum` equivalent for MoneyInput. */
export function sum(values: MoneyInput[]): Money {
  return values.reduce<Money>((total, v) => total.plus(toDecimal(v)), new Decimal(0));
}

/** Comparison helpers, so callers never have to fall back to `<` / `>` on objects. */
export function gt(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).comparedTo(toDecimal(b)) > 0;
}
export function gte(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).comparedTo(toDecimal(b)) >= 0;
}
export function lt(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).comparedTo(toDecimal(b)) < 0;
}
export function lte(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).comparedTo(toDecimal(b)) <= 0;
}
export function eq(a: MoneyInput, b: MoneyInput): boolean {
  return toDecimal(a).comparedTo(toDecimal(b)) === 0;
}
export function abs(a: MoneyInput): Money {
  return toDecimal(a).abs();
}
export function isPositive(a: MoneyInput): boolean {
  return toDecimal(a).greaterThan(0);
}
