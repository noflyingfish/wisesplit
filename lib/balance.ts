import { db } from "@/lib/db";
import { Decimal, lt, round2, toDecimal, toNumber, type Money, type MoneyInput } from "@/lib/money";

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

export type GroupBalances = {
  members: BalanceResult[];
  simplifiedDebts: SimplifiedDebt[];
};

/**
 * Running totals are `Decimal` (exact); `BalanceResult` and `SimplifiedDebt` are plain
 * numbers because that is what every consumer — comparisons against the `0.01`
 * threshold, `Math.abs` in the bar widths, `formatCurrency` — already expects, and
 * because a `Decimal` handed to a client component arrives as a string.
 *
 * The conversion happens once, here, at the very end and *after* rounding: the totals
 * accumulate exactly and only become floats once they are already 2-decimal values,
 * which a float represents faithfully at this magnitude.
 */
function addTo(map: Map<string, Money>, key: string, value: MoneyInput) {
  map.set(key, (map.get(key) ?? new Decimal(0)).plus(toDecimal(value)));
}

export async function computeBalances(groupId: string): Promise<GroupBalances> {
  const [expenses, settlements, members] = await Promise.all([
    db.expense.findMany({
      where: { groupId },
      include: { shares: true },
    }),
    db.settlement.findMany({
      where: { groupId },
    }),
    db.groupMember.findMany({
      where: { groupId },
    }),
  ]);

  // Step 1: Compute net balance per member
  const net = new Map<string, Money>();
  const paid = new Map<string, Money>();
  const owes = new Map<string, Money>();
  const receivedSettlement = new Map<string, Money>();
  const paidSettlement = new Map<string, Money>();

  for (const member of members) {
    net.set(member.id, new Decimal(0));
    paid.set(member.id, new Decimal(0));
    owes.set(member.id, new Decimal(0));
    receivedSettlement.set(member.id, new Decimal(0));
    paidSettlement.set(member.id, new Decimal(0));
  }

  for (const expense of expenses) {
    // The payer is owed the full amount
    addTo(paid, expense.paidById, expense.amount);
    addTo(net, expense.paidById, expense.amount);

    // Each share holder owes their portion
    for (const share of expense.shares) {
      addTo(owes, share.memberId, share.amount);
      addTo(net, share.memberId, toDecimal(share.amount).negated());
    }
  }

  // Sign convention (pinned by the simplification step below, where creditors are
  // `net > 0.01` and debtors are `net < -0.01`): POSITIVE `net` means "this member is
  // owed money". The expense loop above honours that — the payer gains `amount`, each
  // sharer loses their `share`.
  //
  // A settlement is the *reverse* of the expense it clears, so it must move `net` the
  // opposite way: the receiver is a creditor being paid back, so their outstanding
  // credit falls; the payer is a debtor settling up, so their debt falls. Both signs
  // were inverted here before, which made every recorded payment *double* the debt it
  // was meant to clear (`net[receiver] += amount` and `net[payer] -= amount`), and
  // conjured a debt out of nothing in a group with no expenses at all.
  for (const settlement of settlements) {
    // Receiver's outstanding credit goes down
    addTo(receivedSettlement, settlement.receivedById, settlement.amount);
    addTo(net, settlement.receivedById, toDecimal(settlement.amount).negated());

    // Payer's outstanding debt goes down (their balance rises)
    addTo(paidSettlement, settlement.paidById, settlement.amount);
    addTo(net, settlement.paidById, settlement.amount);
  }

  // Build member results — the boundary: exact decimals in, plain numbers out.
  const memberResults: BalanceResult[] = members.map((m) => ({
    memberId: m.id,
    memberName: m.name,
    paid: toNumber(round2(paid.get(m.id) ?? 0)),
    owes: toNumber(round2(owes.get(m.id) ?? 0)),
    receivedSettlement: toNumber(round2(receivedSettlement.get(m.id) ?? 0)),
    paidSettlement: toNumber(round2(paidSettlement.get(m.id) ?? 0)),
    net: toNumber(round2(net.get(m.id) ?? 0)),
  }));

  // Step 2: Simplify debts (greedy algorithm)
  //
  // The running remainders stay `Decimal` — this is the part that used to drift, since
  // it repeatedly subtracts one 2-decimal float from another (`10.05 - 5.03` is
  // `5.0199999999999996` in binary) and then decides whether to stop on `remaining <
  // 0.01`, i.e. on a number that was never quite what it should be.
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

  return { members: memberResults, simplifiedDebts };
}
