"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, User, Copy, Check } from "lucide-react";
import { clearGroupCookie } from "@/lib/actions";
import type { MemberCookie } from "@/lib/auth";

type Member = {
  id: string;
  name: string;
  token: string;
};

export function UserMenu({
  groupSlug,
  members,
  currentMember,
}: {
  groupSlug: string;
  members: Member[];
  currentMember: MemberCookie;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function copyLink(token: string, name: string) {
    const link = `${window.location.origin}/g/${groupSlug}/u/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(name);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleLeave() {
    // Must pass the real groupSlug: the cookie is named `wisesplit_<memberToken>`
    // and scoped to `/g/<groupSlug>`, so both the name set and the path deleted
    // depend on it. The previous call here used the literal string "current",
    // which matched no cookie that has ever been written.
    await clearGroupCookie(groupSlug);
    setOpen(false);
    // `revalidatePath`-style invalidation is not needed for a cookie write; the
    // server action re-renders the affected layout and the layout guard then
    // redirects to /join.
    router.push(`/g/${groupSlug}/join`);
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium text-slate-700 transition-colors"
      >
        <User size={14} />
        <span>{currentMember.memberName}</span>
        <ChevronDown
          size={14}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-lg border border-slate-200 py-2 z-50">
          <div className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Switch Member
          </div>
          {members.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                copyLink(m.token, m.name);
              }}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-slate-50 transition-colors ${
                m.id === currentMember.memberId
                  ? "text-emerald-700 font-medium"
                  : "text-slate-700"
              }`}
            >
              <span>
                {m.id === currentMember.memberId ? `${m.name} (you)` : m.name}
              </span>
              <span className="flex items-center gap-1 text-slate-500 hover:text-emerald-700">
                {copied === m.name ? (
                  <Check size={14} className="text-emerald-700" />
                ) : (
                  <Copy size={14} />
                )}
              </span>
            </button>
          ))}
          <div className="border-t border-slate-100 mt-1 pt-1">
            <button
              onClick={handleLeave}
              className="w-full text-left px-4 py-2 text-sm text-slate-500 hover:text-rose-800 hover:bg-slate-50 transition-colors"
            >
              Leave group
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
