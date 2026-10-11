"use client";

import { useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { joinGroup } from "@/app/g/[groupSlug]/join/_actions";

type PickerMember = { id: string; name: string };

/**
 * The join step is a picker, not a name field.
 *
 * A member's identity is chosen here once and is never changed inside the app — the
 * header menu lists the group's members read-only and carries no switch action, and the
 * Settings per-member "Copy link" is a distribution shortcut, not a way to become
 * someone else. This component therefore offers only the group's EXISTING members, in
 * the alphabetical order the page supplies. It creates nothing.
 */
export function JoinForm({
  groupSlug,
  groupName,
  members,
}: {
  groupSlug: string;
  groupName: string;
  members: PickerMember[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const formData = new FormData(e.currentTarget);
    const memberId = (formData.get("memberId") as string) ?? "";

    if (!memberId) {
      setError("Please select your name");
      return;
    }

    setSubmitting(true);
    // `finally` for the same reason as the landing form: a rejected action must not
    // leave the control reading "Signing in..." with the rejection unreported.
    try {
      const result = await joinGroup(groupSlug, formData);
      if (result?.error) setError(result.error);
    } catch {
      setError("Could not sign you in because of a server error. Please try again.");
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
        <p className="text-slate-500 mb-8">Pick your name to sign in</p>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 text-left"
        >
          {/* Same banner shape and `role="alert"` as the rest of the app — the one
              rejection surface, so a server refusal is never silent. */}
          {error && (
            <div role="alert" className="mb-4 px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
              {error}
            </div>
          )}

          {members.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">
              This group has no members yet.
            </p>
          ) : (
            <fieldset className="space-y-2">
              <legend className="sr-only">Select your name</legend>
              {members.map((m) => (
                <label key={m.id} className="block cursor-pointer">
                  {/* A real radio (visually hidden) drives selection, so keyboard
                      arrow-nav and screen readers work; the styled sibling reads the
                      `peer-checked` / `peer-focus-visible` state. */}
                  <input
                    type="radio"
                    name="memberId"
                    value={m.id}
                    checked={selectedId === m.id}
                    onChange={() => setSelectedId(m.id)}
                    className="peer sr-only"
                  />
                  <span className="flex items-center justify-between px-4 py-3 rounded-xl border border-slate-200 text-sm text-slate-700 transition-colors hover:border-emerald-300 hover:bg-slate-50 peer-checked:border-emerald-700 peer-checked:bg-emerald-50 peer-checked:font-medium peer-checked:text-emerald-800 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/30">
                    <span>{m.name}</span>
                    {selectedId === m.id && (
                      <Check size={16} className="text-emerald-700" />
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <button
            type="submit"
            disabled={submitting || !selectedId}
            className="mt-5 w-full py-3 px-4 bg-emerald-700 hover:bg-emerald-800 active:bg-emerald-900 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-xl transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/30 shadow-sm"
          >
            {submitting ? "Signing in..." : "Continue"}
          </button>
        </form>

        <p className="mt-4 text-sm text-slate-500">
          Not on the list? Ask the organiser to add you.
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
