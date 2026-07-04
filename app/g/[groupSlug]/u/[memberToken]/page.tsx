import { db } from "@/lib/db";
import { TokenHandler } from "./_components/TokenHandler";

export default async function MemberTokenPage({
  params,
}: {
  params: Promise<{ groupSlug: string; memberToken: string }>;
}) {
  const { groupSlug, memberToken } = await params;

  const member = await db.groupMember.findUnique({
    where: { token: memberToken },
    include: { group: true },
  });

  if (!member || member.group.slug !== groupSlug) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔗</div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Invalid link
          </h1>
          <p className="text-slate-500">
            This invitation link is not valid. Please ask the group creator for
            a new link.
          </p>
        </div>
      </div>
    );
  }

  return (
    <TokenHandler
      memberToken={member.token}
      groupSlug={groupSlug}
      memberId={member.id}
      memberName={member.name}
    />
  );
}
