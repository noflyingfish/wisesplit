"use client";

import { useState } from "react";
import { Trash2, Plus, Tag } from "lucide-react";
import { addCategory, deleteCategory } from "@/app/g/[groupSlug]/(auth)/settings/_actions";

const QUICK_EMOJIS = ["🍕", "🚗", "🏠", "🎉", "🛒", "📦", "🎬", "✈️", "🏥", "📱", "👕", "☕"];

type Category = { id: string; emoji: string; name: string };

export function CategoryManager({ groupSlug, categories }: { groupSlug: string; categories: Category[] }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newEmoji, setNewEmoji] = useState("📦");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) { setError("Name is required"); return; }
    setAdding(true);
    const formData = new FormData();
    formData.append("emoji", newEmoji);
    formData.append("name", newName.trim());
    const result = await addCategory(groupSlug, formData);
    setAdding(false);
    if (result.error) { setError(result.error); } else { setNewName(""); setNewEmoji("📦"); setShowAdd(false); }
  }

  async function handleDelete(id: string) { setDeletingId(id); await deleteCategory(groupSlug, id); setDeletingId(null); }

  return (
    <div className="divide-y divide-slate-100">
      {categories.map((cat) => (
        <div key={cat.id} className="px-5 py-3 flex items-center gap-3">
          <span className="text-lg flex-shrink-0">{cat.emoji}</span>
          <span className="text-sm font-medium text-slate-700">{cat.name}</span>
          <button onClick={() => handleDelete(cat.id)} disabled={deletingId === cat.id}
            className="ml-auto p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50"><Trash2 size={14} /></button>
        </div>
      ))}

      {categories.length === 0 && !showAdd && (
        <div className="px-5 py-8 text-center"><Tag size={24} className="text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-400">No custom categories yet</p></div>
      )}

      {showAdd && (
        <form onSubmit={handleAdd} className="px-5 py-4 bg-slate-50/50 space-y-3">
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            {QUICK_EMOJIS.map((emoji) => (
              <button key={emoji} type="button" onClick={() => setNewEmoji(emoji)}
                className={`w-9 h-9 flex items-center justify-center text-lg rounded-lg border-2 transition-colors ${newEmoji === emoji ? "border-emerald-500 bg-emerald-50" : "border-slate-200 hover:border-slate-300"}`}>{emoji}</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Category name" autoFocus
              className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500" />
            <button type="submit" disabled={adding} className="px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-lg hover:bg-emerald-600 disabled:opacity-50 transition-colors">{adding ? "Adding..." : "Add"}</button>
            <button type="button" onClick={() => { setShowAdd(false); setError(null); }} className="px-3 py-2 text-sm text-slate-500 hover:text-slate-700">Cancel</button>
          </div>
        </form>
      )}

      {!showAdd && (
        <button onClick={() => setShowAdd(true)}
          className="w-full px-5 py-3.5 flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-emerald-600 hover:bg-emerald-50/50 transition-colors"><Plus size={16} />Add Category</button>
      )}
    </div>
  );
}
