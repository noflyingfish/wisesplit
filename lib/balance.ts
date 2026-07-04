import { db } from "@/lib/db";

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
  const net = new Map<string, number>();
  const paid = new Map<string, number>();
  const owes = new Map<string, number>();
  const receivedSettlement = new Map<string, number>();
  const paidSettlement = new Map<string, number>();

  for (const member of members) {
    net.set(member.id, 0);
    paid.set(member.id, 0);
    owes.set(member.id, 0);
    receivedSettlement.set(member.id, 0);
    paidSettlement.set(member.id, 0);
  }

  for (const expense of expenses) {
    // The payer is owed the full amount
    paid.set(expense.paidById, (paid.get(expense.paidById) ?? 0) + expense.amount);
    net.set(expense.paidById, (net.get(expense.paidById) ?? 0) + expense.amount);

    // Each share holder owes their portion
    for (const share of expense.shares) {
      owes.set(share.memberId, (owes.get(share.memberId) ?? 0) + share.amount);
      net.set(share.memberId, (net.get(share.memberId) ?? 0) - share.amount);
    }
  }

  for (const settlement of settlements) {
    // Receiver gets credit
    receivedSettlement.set(
      settlement.receivedById,
      (receivedSettlement.get(settlement.receivedById) ?? 0) + settlement.amount
    );
    net.set(
      settlement.receivedById,
      (net.get(settlement.receivedById) ?? 0) + settlement.amount
    );

    // Payer gets debited
    paidSettlement.set(
      settlement.paidById,
      (paidSettlement.get(settlement.paidById) ?? 0) + settlement.amount
    );
    net.set(
      settlement.paidById,
      (net.get(settlement.paidById) ?? 0) - settlement.amount
    );
  }

  // Build member results
  const memberResults: BalanceResult[] = members.map((m) => ({
    memberId: m.id,
    memberName: m.name,
    paid: paid.get(m.id) ?? 0,
    owes: owes.get(m.id) ?? 0,
    receivedSettlement: receivedSettlement.get(m.id) ?? 0,
    paidSettlement: paidSettlement.get(m.id) ?? 0,
    net: Math.round((net.get(m.id) ?? 0) * 100) / 100,
  }));

  // Step 2: Simplify debts (greedy algorithm)
  const simplifiedDebts: SimplifiedDebt[] = [];
  const creditors = memberResults
    .filter((m) => m.net > 0.01)
    .map((m) => ({ ...m, amount: m.net }));
  const debtors = memberResults
    .filter((m) => m.net < -0.01)
    .map((m) => ({ ...m, amount: -m.net }));

  // Sort descending
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  let ci = 0;
  let di = 0;

  while (ci < creditors.length && di < debtors.length) {
    const transfer = Math.min(creditors[ci].amount, debtors[di].amount);
    const rounded = Math.round(transfer * 100) / 100;

    if (rounded > 0) {
      simplifiedDebts.push({
        fromId: debtors[di].memberId,
        fromName: debtors[di].memberName,
        toId: creditors[ci].memberId,
        toName: creditors[ci].memberName,
        amount: rounded,
      });
    }

    creditors[ci].amount -= transfer;
    debtors[di].amount -= transfer;

    if (creditors[ci].amount < 0.01) ci++;
    if (debtors[di].amount < 0.01) di++;
  }

  return { members: memberResults, simplifiedDebts };
}
