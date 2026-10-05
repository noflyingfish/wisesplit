import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { getMemberCookie } from "@/lib/auth";
import { GroupTabs } from "@/components/GroupTabs";
import { UserMenu } from "@/components/UserMenu";

export default async function AuthLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;

  const memberCookie = await getMemberCookie();

  if (!memberCookie || memberCookie.groupSlug !== groupSlug) {
    redirect(`/g/${groupSlug}/join`);
  }

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
    include: { members: true },
  });

  if (!group) redirect("/");

  // `w-full` is load-bearing, not decoration. This is a flex item in the column-flex
  // `body`, and an `mx-auto` item's auto cross-axis margins suppress
  // `align-items: stretch` — so without an explicit width the column shrink-wraps to
  // its widest child. The `/expenses` category pills (max-content ≈ 849 px) then pin
  // it at the `max-w-2xl` cap at *every* viewport: 297 px of page scroll at 375 px,
  // and a column 145–162 px short of its own cap on /balances and /settings.
  return (
    <div className="w-full max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="flex items-center justify-between mb-6">
        <Link href={`/g/${groupSlug}/dashboard`} className="group">
          <h1 className="text-xl font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
            {group.name}
          </h1>
        </Link>
        <UserMenu
          groupSlug={groupSlug}
          members={group.members}
          currentMember={memberCookie}
        />
      </div>
      <GroupTabs groupSlug={groupSlug} />
      <main className="mt-6">{children}</main>
    </div>
  );
}
