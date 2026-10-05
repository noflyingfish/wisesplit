"use client";

import { useState } from "react";
import Link from "next/link";
import { joinGroup } from "@/app/g/[groupSlug]/join/_actions";

export function JoinForm({
  groupSlug,
  groupName,
}: {
  groupSlug: string;
  groupName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const name = (formData.get("name") as string)?.trim() ?? "";

    if (!name) {
      setError("Please enter your name");
      return;
    }

    setSubmitting(true);
    // `finally` for the same reason as the landing form: a rejected action must not
    // leave the control reading "Joining..." with the rejection unreported.
    try {
      const result = await joinGroup(groupSlug, formData);
      if (result?.error) setError(result.error);
    } catch {
      setError("Could not join the group because of a server error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md text-center">
        <div className="text-5xl mb-4">👋</div>
        <h1 className="text-2xl font-bold text-slate-900 mb-1">
          Join {groupName}
        </h1>
        <p className="text-slate-500 mb-8">Enter your name to get started</p>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6"
        >
          {error && (
            <div role="alert" className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2 text-left">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-700"
              >
                Your name
              </label>
              <input
                id="name"
                name="name"
                type="text"
                required
                placeholder="Enter your name"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-all"
                autoFocus
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm"
            >
              {submitting ? "Joining..." : "Join Group"}
            </button>
          </div>
        </form>

        <p className="mt-4 text-xs text-slate-500">
          Already have a link? Paste the full URL in your browser.
        </p>

        <Link
          href="/"
          className="inline-block mt-6 text-sm text-slate-500 hover:text-slate-600"
        >
          ← Create a new group instead
        </Link>
      </div>
    </div>
  );
}
