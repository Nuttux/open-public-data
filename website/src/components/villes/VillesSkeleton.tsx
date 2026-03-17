'use client';

function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse bg-slate-700/50 rounded ${className}`} />;
}

export function KpiCardSkeleton() {
  return (
    <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700/50">
      <Pulse className="h-3 w-20 mb-2" />
      <Pulse className="h-6 w-24" />
    </div>
  );
}

export function KpiGridSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 space-y-3">
      <Pulse className="h-4 w-40 mb-4" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          <Pulse className="h-4 flex-1" />
          <Pulse className="h-4 w-20" />
          <Pulse className="h-4 w-32 hidden sm:block" />
        </div>
      ))}
    </div>
  );
}

export function SankeySkeleton() {
  return (
    <div className="flex items-center justify-center h-64 rounded-xl bg-slate-800/30 border border-slate-700/30">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
        <Pulse className="h-3 w-24" />
      </div>
    </div>
  );
}

export function CategoryBarsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4 space-y-3">
      <Pulse className="h-4 w-32 mb-2" />
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between">
            <Pulse className="h-3 w-28" />
            <Pulse className="h-3 w-16" />
          </div>
          <Pulse className="h-2 w-full rounded-full" />
        </div>
      ))}
    </div>
  );
}
