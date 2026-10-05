"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex items-center justify-center py-20 px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">😵</div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Something went wrong</h2>
        {/* Never render `error.message`: in production a server error carries the raw
            Prisma message, which includes the failing query and the database host. The
            digest is an opaque hash and is safe to show as a support reference. */}
        <p className="text-sm text-slate-500 mb-2">
          An unexpected error occurred. Nothing was saved — please try again.
        </p>
        {error.digest && (
          <p className="text-xs text-slate-500 mb-6">Reference: {error.digest}</p>
        )}
        <div className="flex gap-3 justify-center">
          <button onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white font-medium rounded-xl hover:bg-emerald-800 transition-colors">
            <RotateCw size={16} />Try again
          </button>
          <Link href="/"
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors">
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
