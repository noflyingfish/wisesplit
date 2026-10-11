import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { computeBalances } from "@/lib/balance";
import { sortCurrencyCodes } from "@/lib/currencies";
import { SettleForm } from "./_components/SettleForm";

export default async function NewSettlePage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;
  const memberCookie = await getMemberCookie();

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    include: { members: true, currencies: true },
  });

  if (!group || !memberCookie) return null;

  const { currencies } = await computeBalances(group.id);

  // Flatten to one suggestion list, each entry carrying its own currency, so
  // applying a suggestion sets the currency as well (a TWD debt is not cleared as
  // SGD). Order follows computeBalances: SGD first, then alphabetical.
  const suggestions = currencies.flatMap((c) =>
    c.simplifiedDebts.map((d) => ({ ...d, currency: c.currency }))
  );

  return (
    <SettleForm
      groupSlug={groupSlug}
      members={group.members.map((m) => ({ id: m.id, name: m.name }))}
      currencies={sortCurrencyCodes(group.currencies.map((c) => c.code))}
      currentMemberId={memberCookie.memberId}
      suggestions={suggestions}
    />
  );
}
