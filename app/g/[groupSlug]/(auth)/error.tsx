"use client";

import Link from "next/link";
import { RotateCw } from "lucide-react";

export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex items-center justify-center py-20 px-4">
      <div className="text-center max-w-sm">
        <div className="text-5xl mb-4">😵</div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-sm text-slate-500 mb-6">{error.message || "An unexpected error occurred"}</p>
        <div className="flex gap-3 justify-center">
          <button onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white font-medium rounded-xl hover:bg-emerald-600 transition-colors">
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
