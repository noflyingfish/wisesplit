import Link from "next/link";
import { db } from "@/lib/db";

export default async function GroupLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ groupSlug: string }>;
}) {
  const { groupSlug } = await params;

  const group = await db.group.findUnique({
    where: { slug: groupSlug },
  });

  if (!group) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-4">🔍</div>
          <h1 className="text-xl font-semibold text-slate-900 mb-2">
            Group not found
          </h1>
          <p className="text-slate-500">
            This group doesn&apos;t exist. Maybe the link is wrong?
          </p>
          <Link
            href="/"
            className="inline-block mt-4 text-emerald-600 font-medium hover:text-emerald-700"
          >
            Create a new group →
          </Link>
        </div>
      </div>
    );
  }

  // No auth check — public pages (/join, /u/[token]) pass through.
  // Auth is handled by (auth)/layout.tsx for protected pages.
  return <>{children}</>;
}
