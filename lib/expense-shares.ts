/**
 * Turning a user's split input into the dollar shares that get persisted.
 *
 * Pure — no database, no request context — so `createExpense` and `updateExpense`
 * cannot drift apart. They each used to carry their own verbatim copy of this
 * arithmetic, which is exactly how two code paths end up disagreeing about the same
 * expense.
 *
 * All arithmetic is `Decimal`, never float. The old `Math.round(n * 100) / 100`
 * idiom is not exact rounding: `Math.round(1.005 * 100) / 100` is `1.00` because
 * `1.005 * 100` is `100.49999999999999` in binary, where the true decimal answer is
 * `1.01`. That was reachable from an ordinary percentage split — 10% of $10.05 is
 * exactly $1.005 — so the split a user saw depended on which binary representation
 * their input happened to land on.
 */

import { round2, sum, toDecimal, type Money, type MoneyInput } from "@/lib/money";

export const SPLIT_TYPES = ["equal", "unequal", "percentage"] as const;
export type SplitType = (typeof SPLIT_TYPES)[number];

export function isSplitType(value: unknown): value is SplitType {
  return typeof value === "string" && (SPLIT_TYPES as readonly string[]).includes(value);
}

export type ResolvedShare = {
  /** Exact decimal, ready to hand straight to Prisma's `Decimal` column. */
  amount: Money;
  memberId: string;
  /** The whole-number percentage the user typed; `null` unless splitType is "percentage". */
  percentage: Money | null;
};

export type ResolveResult = { shares: ResolvedShare[] } | { error: string };

export function resolveShares(
  amount: MoneyInput,
  splitType: SplitType,
  sharesData: FormDataEntryValue | null
): ResolveResult {
  let raw: unknown;
  try {
    raw = sharesData ? JSON.parse(String(sharesData)) : [];
  } catch {
    // A malformed payload used to throw out of the action, which surfaced to the
    // user as a button stuck on "Saving..." with no explanation.
    return { error: "Could not read the split — please re-enter it." };
  }
  if (!Array.isArray(raw)) return { error: "Could not read the split — please re-enter it." };

  const total = toDecimal(amount);

  if (splitType === "equal") {
    const involvedIds = raw as string[];
    if (involvedIds.length === 0) return { error: "Select at least one member to split with" };
    const shareAmount = round2(total.div(involvedIds.length));
    return {
      shares: involvedIds.map((id, i) => ({
        memberId: id,
        // The first member absorbs the rounding remainder so the shares always sum
        // to the expense total (an amount does not divide evenly into a whole number
        // of cents).
        amount: i === 0 ? round2(total.minus(shareAmount.times(involvedIds.length - 1))) : shareAmount,
        percentage: null,
      })),
    };
  }

  if (splitType === "percentage") {
    const pctShares = raw as { memberId: string; percentage: number }[];
    if (pctShares.length === 0) return { error: "No percentage shares provided" };

    for (const s of pctShares) {
      if (!Number.isInteger(s.percentage) || s.percentage < 0 || s.percentage > 100) {
        return { error: "Percentages must be whole numbers between 0 and 100" };
      }
    }

    const totalPct = pctShares.reduce((acc, s) => acc + s.percentage, 0);
    if (totalPct !== 100) {
      return { error: `Percentages must total 100% (currently ${totalPct}%)` };
    }

    const rawShares = pctShares.map((s) => ({
      memberId: s.memberId,
      // Multiply before dividing, in `Decimal`: 10.05 * 10 / 100 is exactly 1.005,
      // which rounds to 1.01 — the answer the user expects and the old float path
      // could not deliver.
      amount: round2(total.times(s.percentage).div(100)),
    }));
    const rawTotal = sum(rawShares.map((s) => s.amount));
    const remainder = round2(total.minus(rawTotal));

    return {
      shares: rawShares.map((s, i) => ({
        memberId: s.memberId,
        amount: i === 0 ? round2(s.amount.plus(remainder)) : s.amount,
        // Stored so the edit page can show the percentages the user actually typed
        // rather than guessing them back out of the dollar amounts.
        percentage: toDecimal(pctShares[i].percentage),
      })),
    };
  }

  // ---- unequal (explicit) ---------------------------------------------------
  //
  // This is the ONLY branch that refuses rather than normalises, and that asymmetry is
  // deliberate — do not "fix" it by making the three branches consistent.
  //
  // The equal and percentage branches compute the shares themselves and normalise:
  // each share is rounded and the remainder is pushed onto the first member, so their
  // shares always sum to the amount by construction. Here the user types the amounts,
  // and silently rewriting what they typed would leave the screen showing a total that
  // is not what was stored. So this branch demands exactness instead.
  const explicit = raw as { memberId: string; amount: number }[];
  if (explicit.length === 0) return { error: "No shares provided" };

  const explicitAmounts = explicit.map((s) => toDecimal(s.amount));

  // Rule 1: every share is a whole number of cents.
  //
  // `SUM-004`. Nothing checked this before, and `Expense.amount` is credited in full
  // while `DECIMAL(12,2)` rounds each share AFTER this validation approved the total —
  // so a share with a third decimal place destroyed money silently. 10.00 split
  // 3.333/3.333/3.334 stores 3.33 + 3.33 + 3.33 = 9.99 and the group's nets sum to
  // 0.01 instead of 0.00, with nothing on any screen to show it.
  const notWholeCents = explicitAmounts.find((d) => !d.times(100).isInteger());
  if (notWholeCents !== undefined) {
    return {
      error: `Each share must be a whole number of cents — ${notWholeCents} is not (at most 2 decimal places).`,
    };
  }

  // Rule 2: the shares sum to the amount EXACTLY. Replaces the old
  // `abs(explicitTotal.minus(total)).greaterThan(0.02)`, whose 0.02 tolerance admitted
  // exactly the one-cent shortfall rule 1 alone cannot catch: 3.33 + 3.33 + 3.33
  // against 10.00 is all-2dp and sums to 9.99 — the COMMON case, not a pathological
  // one. Rule 2 is not implied by rule 1, and both are required.
  //
  // Exact equality, with no epsilon added: `toDecimal` routes numbers through
  // `String(value)`, so a typed 3.33 is the exact decimal 3.33 rather than the double
  // (measured: 3.33 + 3.33 + 3.34 equals 10 exactly; 3.33 * 3 does not), and `sum` is
  // exact `Decimal` addition.
  const explicitTotal = sum(explicitAmounts);
  if (!explicitTotal.equals(total)) {
    return { error: `Shares total (${explicitTotal}) must equal amount (${total})` };
  }

  return {
    shares: explicit.map((s, i) => ({
      memberId: s.memberId,
      amount: explicitAmounts[i],
      percentage: null,
    })),
  };
}
