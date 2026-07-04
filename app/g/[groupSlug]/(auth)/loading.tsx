export default function AuthLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-6 animate-pulse">
      <div className="flex items-center justify-between mb-6">
        <div className="h-7 w-40 bg-slate-200 rounded-lg" />
        <div className="h-9 w-28 bg-slate-200 rounded-xl" />
      </div>
      <div className="flex gap-2 border-b border-slate-200 pb-2 mb-6">
        {[1, 2, 3, 4].map((i) => (<div key={i} className="h-9 w-24 bg-slate-200 rounded-lg" />))}
      </div>
      <div className="space-y-4">
        <div className="h-32 bg-slate-200 rounded-2xl" />
        <div className="h-48 bg-slate-200 rounded-2xl" />
      </div>
    </div>
  );
}
