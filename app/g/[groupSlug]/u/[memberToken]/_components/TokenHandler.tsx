"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { loginWithToken } from "../_actions";

export function TokenHandler({
  memberToken,
  groupSlug,
  memberId,
  memberName,
}: {
  memberToken: string;
  groupSlug: string;
  memberId: string;
  memberName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    async function doLogin() {
      try {
        await loginWithToken(memberToken, groupSlug, memberId, memberName);
        router.push(`/g/${groupSlug}/dashboard`);
        router.refresh();
      } catch {
        setError(true);
      }
    }
    doLogin();
  }, [memberToken, groupSlug, memberId, memberName, router]);

  if (error) {
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
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3" />
        <p className="text-sm text-slate-500">Signing you in...</p>
      </div>
    </div>
  );
}
