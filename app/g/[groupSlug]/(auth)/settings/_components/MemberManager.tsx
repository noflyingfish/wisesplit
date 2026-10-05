"use client";

import { useState } from "react";
import { Copy, Check, UserPlus, Link2, Share2 } from "lucide-react";
import { addMember } from "@/app/g/[groupSlug]/(auth)/settings/_actions";

type Member = { id: string; name: string; token: string };

export function MemberManager({ groupSlug, members, currentMemberId }: { groupSlug: string; members: Member[]; currentMemberId: string }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLink, setNewLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  async function copyLink(token: string, name: string) {
    const link = `${window.location.origin}/g/${groupSlug}/u/${token}`;
    await navigator.clipboard.writeText(link);
    setCopied(name);
    setTimeout(() => setCopied(null), 2000);
  }

  async function copyInviteLink() {
    const link = `${window.location.origin}/g/${groupSlug}/join`;
    await navigator.clipboard.writeText(link);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  async function handleAddMember(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) { setError("Name is required"); return; }
    setAdding(true);
    const formData = new FormData();
    formData.append("name", newName);
    // `finally` so a rejected action cannot leave the control on "Adding...".
    try {
      const result = await addMember(groupSlug, formData);
      if (result?.error) { setError(result.error); }
      else if (result?.token) {
        setNewLink(`${window.location.origin}/g/${groupSlug}/u/${result.token}`);
        setNewName("");
        setShowAdd(false);
      }
    } catch {
      setError("Could not add the member because of a server error. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div className="divide-y divide-slate-100">
      {members.map((m) => (
        <div key={m.id} className="px-5 py-3.5 flex items-center gap-3">
          <span className="text-lg flex-shrink-0">👤</span>
          <span className="text-sm font-medium text-slate-700">{m.name}{m.id === currentMemberId ? <span className="text-emerald-700 ml-1">(you)</span> : null}</span>
          <button onClick={() => copyLink(m.token, m.name)}
            className="ml-auto flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
            {copied === m.name ? <Check size={12} className="text-emerald-700" /> : <Copy size={12} />}
            <span className="hidden sm:inline">Copy link</span>
          </button>
        </div>
      ))}

      {newLink && (
        <div className="px-5 py-4 bg-emerald-50 border-t border-emerald-100">
          <div className="flex items-center gap-2 text-sm text-emerald-700 mb-2"><Link2 size={14} /><span className="font-medium">Member link ready!</span></div>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-white rounded-lg text-xs text-slate-600 border border-emerald-200 truncate">{newLink}</code>
            <button onClick={() => { navigator.clipboard.writeText(newLink); setNewLink(null); }}
              className="flex-shrink-0 px-3 py-2 bg-emerald-700 text-white text-xs font-medium rounded-lg hover:bg-emerald-800 transition-colors">Copy & dismiss</button>
          </div>
        </div>
      )}

      {showAdd && (
        <form onSubmit={handleAddMember} className="px-5 py-4 bg-slate-50/50">
          {/* The app's one rejection surface (see `ExpenseForm`): a server refusal —
              a member name past the column's 191 characters, say — has to be visible,
              not silent. Banner shape (`bg-rose-50` + `border-rose-200`) and
              `role="alert"`; a `<p>` with `text-rose-700` so it still reads as this
              panel's inline error. */}
          {error && <p role="alert" className="mb-2 px-3 py-2 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Member name" autoFocus
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-700" />
            <button type="submit" disabled={adding} className="px-4 py-2 bg-emerald-700 text-white text-sm font-medium rounded-lg hover:bg-emerald-800 disabled:opacity-50 transition-colors">{adding ? "Adding..." : "Add"}</button>
            <button type="button" onClick={() => { setShowAdd(false); setError(null); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          className="w-full px-5 py-3.5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50/50 transition-colors">
          <UserPlus size={16} />Add Member
        </button>
      )}

      <div className="px-5 py-3.5 border-t border-slate-100 flex items-center gap-3">
        <Share2 size={16} className="text-slate-500 flex-shrink-0" />
        <span className="text-sm text-slate-500 flex-1">Share this group link to invite new members</span>
        <button onClick={copyInviteLink} aria-label="Copy invite link"
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors">
          {inviteCopied ? <Check size={12} className="text-emerald-700" /> : <Copy size={12} />}
          {/* Same `hidden sm:inline` as the member rows above: at 375 px the label is
              dropped so the button stays a narrow icon and the "Share this group link…"
              copy keeps its room. The icon already carries the state (Copy / Check). */}
          <span className="hidden sm:inline">{inviteCopied ? "Copied" : "Copy invite link"}</span>
        </button>
      </div>
    </div>
  );
}
