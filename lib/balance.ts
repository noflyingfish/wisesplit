import { db } from "@/lib/db";
import { Decimal, lt, round2, toDecimal, toNumber, type Money, type MoneyInput } from "@/lib/money";
import { sortCurrencyCodes } from "@/lib/currencies";

export type BalanceResult = {
  memberId: string;
  memberName: string;
  paid: number;
  owes: number;
  receivedSettlement: number;
  paidSettlement: number;
  net: number;
};

export type SimplifiedDebt = {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  amount: number;
};

/**
 * Everything computed for one currency. Amounts in different currencies are never
 * mixed: a group's SGD expenses never influence its JPY balances.
 */
export type CurrencyBalances = {
  /** The ISO 4217 code this block is denominated in. */
  currency: string;
  /**
   * True when at least one expense OR settlement exists in this currency. Used to
   * hide currencies with no activity (no empty cards) while keeping a group with
   * no activity at all able to show its "All settled up!" message.
   */
  hasActivity: boolean;
  members: BalanceResult[];
  simplifiedDebts: SimplifiedDebt[];
};

export type GroupBalances = {
  /**
   * One block per configured currency, ordered SGD first then alphabetical by
   * code (see `sortCurrencyCodes`), so every consumer renders the same order.
   */
  currencies: CurrencyBalances[];
};

/**
 * Running totals are `Decimal` (exact); `BalanceResult` and `SimplifiedDebt` are plain
 * numbers because that is what every consumer — comparisons against the `0.01`
 * threshold, `formatCurrency` — already expects, and because a `Decimal` handed to a
 * client component arrives as a string.
 *
 * The conversion happens once, at the very end and *after* rounding: the totals
 * accumulate exactly and only become floats once they are already 2-decimal values,
 * which a float represents faithfully at this magnitude.
 */
function addTo(map: Map<string, Money>, key: string, value: MoneyInput) {
  map.set(key, (map.get(key) ?? new Decimal(0)).plus(toDecimal(value)));
}

/** The five per-member running maps for one currency. */
type Accumulator = {
  paid: Map<string, Money>;
  owes: Map<string, Money>;
  receivedSettlement: Map<string, Money>;
  paidSettlement: Map<string, Money>;
  net: Map<string, Money>;
  hasActivity: boolean;
};

/**
 * Greedy debt simplification over one currency's member results.
 *
 * The running remainders stay `Decimal` — this is the part that used to drift, since
 * it repeatedly subtracts one 2-decimal float from another (`10.05 - 5.03` is
 * `5.0199999999999996` in binary) and then decides whether to stop on `remaining <
 * 0.01`, i.e. on a number that was never quite what it should be.
 *
 * Sign convention (pinned by the callers of this function, where creditors are `net >
 * 0.01` and debtors are `net < -0.01`): POSITIVE `net` means "this member is owed".
 */
function simplifyDebts(memberResults: BalanceResult[]): SimplifiedDebt[] {
  const simplifiedDebts: SimplifiedDebt[] = [];
  const creditors = memberResults
    .filter((m) => m.net > 0.01)
    .map((m) => ({ memberId: m.memberId, memberName: m.memberName, remaining: toDecimal(m.net) }));
  const debtors = memberResults
    .filter((m) => m.net < -0.01)
    .map((m) => ({ memberId: m.memberId, memberName: m.memberName, remaining: toDecimal(m.net).negated() }));

  // Sort descending
  creditors.sort((a, b) => b.remaining.comparedTo(a.remaining));
  debtors.sort((a, b) => b.remaining.comparedTo(a.remaining));

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const transfer = Decimal.min(creditors[ci].remaining, debtors[di].remaining);
    const rounded = round2(transfer);

    if (rounded.greaterThan(0)) {
      simplifiedDebts.push({
        fromId: debtors[di].memberId,
        fromName: debtors[di].memberName,
        toId: creditors[ci].memberId,
        toName: creditors[ci].memberName,
        amount: toNumber(rounded),
      });
    }

    creditors[ci].remaining = creditors[ci].remaining.minus(transfer);
    debtors[di].remaining = debtors[di].remaining.minus(transfer);

    if (lt(creditors[ci].remaining, 0.01)) ci++;
    if (lt(debtors[di].remaining, 0.01)) di++;
  }

  return simplifiedDebts;
}

/**
 * Nets every member's paid, owed and settled amounts — PER CURRENCY — then runs the
 * greedy debt-simplification pass over each currency independently.
 *
 * There is no conversion and no exchange rate anywhere: amounts in different
 * currencies are never summed. An expense or settlement belongs to exactly one
 * currency (its `currencyId`), and the bucketing below is the only place that
 * decides which block it lands in.
 */
export async function computeBalances(groupId: string): Promise<GroupBalances> {
  const [expenses, settlements, members, currencies] = await Promise.all([
    db.expense.findMany({
      where: { groupId },
      include: { shares: true, currency: true },
    }),
    db.settlement.findMany({
      where: { groupId },
      include: { currency: true },
    }),
    db.groupMember.findMany({
      where: { groupId },
    }),
    db.currency.findMany({
      where: { groupId },
    }),
  ]);

  const codes = sortCurrencyCodes(currencies.map((c) => c.code));

  // One accumulator per configured currency, each with every member pre-seeded to 0
  // so a member with no share in a currency still reports a 0 net rather than a gap.
  const accs = new Map<string, Accumulator>();
  for (const code of codes) {
    const acc: Accumulator = {
      paid: new Map(),
      owes: new Map(),
      receivedSettlement: new Map(),
      paidSettlement: new Map(),
      net: new Map(),
      hasActivity: false,
    };
    for (const member of members) {
      acc.paid.set(member.id, new Decimal(0));
      acc.owes.set(member.id, new Decimal(0));
      acc.receivedSettlement.set(member.id, new Decimal(0));
      acc.paidSettlement.set(member.id, new Decimal(0));
      acc.net.set(member.id, new Decimal(0));
    }
    accs.set(code, acc);
  }

  for (const expense of expenses) {
    const acc = accs.get(expense.currency.code);
    // An expense whose currency is not in `currencies` cannot happen (the FK is
    // required and per-group), but skip defensively rather than creating a phantom.
    if (!acc) continue;
    acc.hasActivity = true;

    // The payer is owed the full amount
    addTo(acc.paid, expense.paidById, expense.amount);
    addTo(acc.net, expense.paidById, expense.amount);

    // Each share holder owes their portion
    for (const share of expense.shares) {
      addTo(acc.owes, share.memberId, share.amount);
      addTo(acc.net, share.memberId, toDecimal(share.amount).negated());
    }
  }

  // A settlement is the *reverse* of the expense it clears, so it must move `net` the
  // opposite way: the receiver is a creditor being paid back, so their outstanding
  // credit falls; the payer is a debtor settling up, so their debt falls. Both signs
  // were inverted here before, which made every recorded payment *double* the debt it
  // was meant to clear, and conjured a debt out of nothing in a group with no expenses.
  for (const settlement of settlements) {
    const acc = accs.get(settlement.currency.code);
    if (!acc) continue;
    acc.hasActivity = true;

    // Receiver's outstanding credit goes down
    addTo(acc.receivedSettlement, settlement.receivedById, settlement.amount);
    addTo(acc.net, settlement.receivedById, toDecimal(settlement.amount).negated());

    // Payer's outstanding debt goes down (their balance rises)
    addTo(acc.paidSettlement, settlement.paidById, settlement.amount);
    addTo(acc.net, settlement.paidById, settlement.amount);
  }

  const currencyResults: CurrencyBalances[] = codes.map((code) => {
    const acc = accs.get(code)!;

    // Build member results — the boundary: exact decimals in, plain numbers out.
    const memberResults: BalanceResult[] = members.map((m) => ({
      memberId: m.id,
      memberName: m.name,
      paid: toNumber(round2(acc.paid.get(m.id) ?? 0)),
      owes: toNumber(round2(acc.owes.get(m.id) ?? 0)),
      receivedSettlement: toNumber(round2(acc.receivedSettlement.get(m.id) ?? 0)),
      paidSettlement: toNumber(round2(acc.paidSettlement.get(m.id) ?? 0)),
      net: toNumber(round2(acc.net.get(m.id) ?? 0)),
    }));

    return {
      currency: code,
      hasActivity: acc.hasActivity,
      members: memberResults,
      simplifiedDebts: simplifyDebts(memberResults),
    };
  });

  return { currencies: currencyResults };
}
