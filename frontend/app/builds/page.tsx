"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { AppShell } from "@/components/app-shell";

interface Build {
  id: string;
  status: string;
  createdAt: string;
  flavorId: string;
  buildType: string;
  flavor?: {
    name: string;
    project: { name: string };
  };
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; dot: string; label: string; isActive: boolean }> = {
    SUCCESS: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", label: "Completed", isActive: false },
    FAILED: { cls: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-400", label: "Failed", isActive: false },
    RUNNING: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-400", label: "Running", isActive: true },
    QUEUED: { cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", dot: "bg-sky-400", label: "Queued", isActive: true },
    PENDING: { cls: "bg-gh-bg text-gh-faint border-gh-border", dot: "bg-gh-faint", label: "Pending", isActive: false },
  };
  const s = map[status] ?? { cls: "bg-gh-surface text-gh-muted border-gh-border", dot: "bg-gh-faint", label: status, isActive: false };
  return (
    <span className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${s.isActive ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

export default function BuildsIndexPage() {
  const router = useRouter();
  const [builds, setBuilds] = useState<Build[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBuilds = () => {
    setLoading(true);
    api.get("/builds")
      .then((res) => setBuilds(res.data))
      .catch((err) => console.error("Failed to fetch builds:", err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchBuilds();
  }, []);

  const deleteBuild = async (e: React.MouseEvent, buildId: string) => {
    e.stopPropagation();
    if (!confirm("Delete this build? Logs and download link will be removed.")) return;
    try {
      await api.delete(`/builds/${buildId}`);
      setBuilds((prev) => prev.filter((b) => b.id !== buildId));
    } catch (err) {
      console.error("Failed to delete build:", err);
      alert("Failed to delete build");
    }
  };

  const clearLogs = async (e: React.MouseEvent, buildId: string) => {
    e.stopPropagation();
    if (!confirm("Clear logs for this build?")) return;
    try {
      await api.post(`/builds/${buildId}/clear-logs`);
      fetchBuilds();
    } catch (err) {
      console.error("Failed to clear logs:", err);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6 animate-fade-in max-w-6xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-gh-default">Build History</h1>
            <p className="text-sm text-gh-muted mt-1">Track and manage all your white-label builds.</p>
          </div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-medium text-gh-subtle hover:text-android transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            </svg>
            Back to Projects
          </Link>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-gh-surface border border-gh-border animate-pulse" />
            ))}
          </div>
        ) : builds.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gh-border bg-gh-surface/50 flex flex-col items-center justify-center py-20 text-center px-6">
            <div className="w-16 h-16 rounded-2xl bg-gh-bg border border-gh-border flex items-center justify-center mb-4 text-gh-faint">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
            </div>
            <p className="text-base font-medium text-gh-default">No builds yet</p>
            <p className="text-sm text-gh-muted mt-1 max-w-sm">Start a build from a flavor configuration page (Projects → Flavor → Start Recompilation Build).</p>
            <Link href="/dashboard" className="mt-6 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-android hover:bg-android-dim text-[#0d1117] text-sm font-bold transition-colors">
              Go to Projects
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl border border-gh-border bg-gh-surface overflow-hidden divide-y divide-gh-border">
            {builds.map((build) => (
              <div
                key={build.id}
                onClick={() => router.push(`/builds/${build.id}`)}
                className="flex items-center justify-between p-4 sm:p-5 hover:bg-gh-elevated transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center border shrink-0 transition-colors ${
                      build.status === "SUCCESS"
                        ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                        : build.status === "FAILED"
                          ? "bg-red-500/10 border-red-500/20 text-red-400"
                          : "bg-gh-bg border-gh-border text-gh-subtle"
                    }`}
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gh-default group-hover:text-android transition-colors">
                        Build #{build.id.slice(-6).toUpperCase()}
                      </span>
                      <StatusBadge status={build.status} />
                    </div>
                    <p className="text-xs text-gh-muted mt-0.5">
                      {build.buildType} · {new Date(build.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="hidden sm:block text-right">
                    <p className="text-xs font-medium text-gh-subtle">{build.flavor?.name || "Unknown"}</p>
                    <p className="text-[10px] text-gh-faint uppercase tracking-wider">{build.flavor?.project?.name || "—"}</p>
                  </div>
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={(e) => clearLogs(e, build.id)}
                      className="p-2 rounded-lg text-gh-faint hover:text-android hover:bg-android/10 transition-colors"
                      title="Clear logs"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                    </button>
                    <button
                      onClick={(e) => deleteBuild(e, build.id)}
                      className="p-2 rounded-lg text-gh-faint hover:text-danger hover:bg-danger/10 transition-colors"
                      title="Delete build"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-gh-faint group-hover:text-android transition-colors ml-1">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
