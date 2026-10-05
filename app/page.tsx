"use client";

import { useState } from "react";
import { createGroup } from "@/app/_actions";

export default function LandingPage() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const groupName = (formData.get("groupName") as string)?.trim() ?? "";
    const yourName = (formData.get("yourName") as string)?.trim() ?? "";

    if (!groupName || !yourName) {
      setError("Please fill in all fields");
      return;
    }

    setSubmitting(true);
    // `finally`, not a bare call after the await: if the action rejects (a 500, a
    // dropped connection) the button used to be left reading "Creating..." with no
    // banner and no navigation — indistinguishable from a hang. Restoring the control
    // is part of the fix for the over-length rejection, not decoration.
    try {
      const result = await createGroup(formData);
      if (result?.error) setError(result.error);
    } catch {
      setError("Could not create the group because of a server error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md">
        {/* Logo & Tagline */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500 shadow-lg shadow-emerald-200 mb-5">
            <span className="text-3xl">🧾</span>
          </div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
            Wisesplit
          </h1>
          <p className="mt-2 text-slate-500 text-lg">
            Split expenses, not friendships
          </p>
        </div>

        {/* Create Group Form */}
        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5"
        >
          {/* Same banner shape and `role="alert"` as the expense form — the app's one
              rejection surface, so a server refusal is never silent. */}
          {error && (
            <div role="alert" className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <label
              htmlFor="groupName"
              className="block text-sm font-medium text-slate-700"
            >
              Group name
            </label>
            <input
              id="groupName"
              name="groupName"
              type="text"
              required
              placeholder="Summer Trip 2026"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-all"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="yourName"
              className="block text-sm font-medium text-slate-700"
            >
              Your name
            </label>
            <input
              id="yourName"
              name="yourName"
              type="text"
              required
              placeholder="Alice"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700 transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm"
          >
            {submitting ? "Creating..." : "Create Group"}
          </button>

          <p className="text-center text-xs text-slate-500">
            No passwords. Each member gets a unique link.
          </p>
        </form>
      </div>
    </div>
  );
}
