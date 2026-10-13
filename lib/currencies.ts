/**
 * The currency master list.
 *
 * THIS IS THE SINGLE SOURCE OF TRUTH for which currencies a group may configure.
 * To offer more (less-travelled) currencies, **append one ISO 4217 code to
 * `CURRENCY_CODES` below** — nothing else needs to change. The code must be a
 * well-formed ISO 4217 code (three uppercase letters) so `Intl.NumberFormat` can
 * resolve its symbol and minor units; the seeding, validation, dropdowns and
 * display all read from this one list, so a code is never typed out in the UI or
 * in a validator.
 *
 * Deliberately dependency-free: this module is imported by client components
 * (the add-currency dropdown, the amount-input prefix), so it must not reach for
 * the Prisma runtime or any server-only code.
 */

/** Every currency a group can configure, in the order the dropdown lists them. */
export const CURRENCY_CODES = [
  "SGD",
  "TWD",
  "USD",
  "EUR",
  "GBP",
  "JPY",
  "MYR",
  "THB",
  "IDR",
  "HKD",
  "KRW",
  "AUD",
  "CNY",
  "VND",
  "PHP",
  "INR",
] as const;

export type CurrencyCode = (typeof CURRENCY_CODES)[number];

/**
 * Seeded into every new group and never deletable. Identity is the ISO code
 * alone — there is no separate "primary currency" field, and no display label:
 * headers show the code and amounts show `Intl`'s symbol for it.
 */
export const DEFAULT_CURRENCY_CODE: CurrencyCode = "SGD";

/** Narrow an untrusted value (form input, DB row) to a known code. */
export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === "string" && (CURRENCY_CODES as readonly string[]).includes(value);
}

/**
 * The currencies whose minor unit is zero, i.e. that must render with no decimal
 * places (`¥1,000`, not `¥1,000.00`). Kept explicit rather than derived so the
 * rule is auditable in one line and does not depend on the runtime's ICU data.
 * Append a code here if you add a zero-decimal currency to `CURRENCY_CODES`.
 */
const ZERO_DECIMAL_CODES = new Set(["JPY", "KRW", "VND", "IDR"]);

/** Decimal places this currency's minor units call for: 0 or 2. */
export function currencyFractionDigits(code: string): number {
  return ZERO_DECIMAL_CODES.has(code) ? 0 : 2;
}

/**
 * The symbol `Intl.NumberFormat` uses for this currency (`$`, `NT$`, `¥`, `SGD`,
 * …). Used for the amount-input prefix in the forms, where the currency may be
 * switched before any amount is entered. Falls back to the bare code for a code
 * `Intl` cannot resolve, so the prefix never renders blank.
 */
export function currencySymbol(code: string): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);
    return parts.find((p) => p.type === "currency")?.value ?? code;
  } catch {
    return code;
  }
}

/** Every code in the master list that is NOT already configured for the group. */
export function availableCurrencyCodes(configured: readonly string[]): CurrencyCode[] {
  const taken = new Set(configured);
  return CURRENCY_CODES.filter((code) => !taken.has(code));
}

/**
 * The one ordering every currency list uses: **SGD first, then alphabetical by
 * code**. Applied to the balances cards, the dashboard toggle, the settle
 * suggestions and the settings list alike so no two surfaces disagree.
 */
export function sortCurrencyCodes(codes: readonly string[]): string[] {
  return [...codes].sort((a, b) => {
    if (a === b) return 0;
    if (a === DEFAULT_CURRENCY_CODE) return -1;
    if (b === DEFAULT_CURRENCY_CODE) return 1;
    return a.localeCompare(b);
  });
}
