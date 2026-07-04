import { db } from "@/lib/db";
import { JoinForm } from "./_components/JoinForm";
import Link from "next/link";

export default async function JoinPage({
  params,
}: {
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
  });

  if (!group) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Group not found
          </h1>
          <p className="text-slate-500 mb-6">
            This group doesn&apos;t exist. It may have been deleted or the link
            might be incorrect.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors"
          >
            Create a new group
          </Link>
        </div>
      </div>
    );
  }

  return <JoinForm groupSlug={groupSlug} groupName={group.name} />;
}
