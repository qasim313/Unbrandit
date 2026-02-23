"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { useBuildLogs } from "@/hooks/useBuildLogs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";

interface Build {
  id: string;
  status: string;
  downloadUrl?: string | null;
  flavorId: string;
  logs?: string | null;
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
    <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${s.cls}`}>
      <span className={`w-2 h-2 rounded-full ${s.dot} ${s.isActive ? "animate-pulse" : ""}`} />
      {s.label}
    </span>
  );
}

export default function BuildPage() {
  const { buildId } = useParams<{ buildId: string }>();
  const [build, setBuild] = useState<Build | null>(null);
  const { logs, status, downloadUrl } = useBuildLogs(buildId);
  const currentStatus = status || build?.status || "QUEUED";

  useEffect(() => {
    if (buildId) api.get(`/builds/${buildId}`).then((res) => setBuild(res.data)).catch(() => { });
  }, [buildId]);

  const isActive = currentStatus === "RUNNING" || currentStatus === "QUEUED";
  const isCompleted = currentStatus === "SUCCESS";
  const isFailed = currentStatus === "FAILED";

  return (
    <AppShell>
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/builds" className="flex items-center gap-1.5 text-sm text-gh-muted hover:text-android transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Builds
          </Link>
          <span className="text-gh-faint">/</span>
          <div>
            <h1 className="font-display text-2xl font-bold text-gh-default">Build</h1>
            <p className="font-mono text-xs text-gh-muted mt-0.5">{buildId}</p>
          </div>
        </div>

        <Card className="border-gh-border bg-gh-surface">
          <CardHeader>
            <CardTitle className="text-gh-default">Build status</CardTitle>
            <CardDescription className="text-gh-muted">Current state and output artifact.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-4">
              <StatusBadge status={currentStatus} />

              {isActive && (
                <div className="flex items-center gap-2 text-sm text-amber-400">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Build in progress…
                </div>
              )}

              {isCompleted && (
                <div className="flex items-center gap-2 text-sm text-emerald-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  Build completed successfully
                </div>
              )}

              {isFailed && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                  Build failed — check logs below
                </div>
              )}

              {(downloadUrl || build?.downloadUrl) && (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      const res = await api.get(`/builds/${buildId}/download`, { responseType: "blob" });
                      const url = window.URL.createObjectURL(new Blob([res.data]));
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `build-${buildId}.apk`;
                      document.body.appendChild(a);
                      a.click();
                      window.URL.revokeObjectURL(url);
                      a.remove();
                    } catch (err) {
                      console.error("Download failed:", err);
                      alert("Download failed. Please try again.");
                    }
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-android hover:bg-android-dim text-[#0d1117] text-sm font-bold transition-all shadow-lg shadow-android/10 active:scale-95"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Download artifact
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-gh-border bg-gh-surface">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-gh-default">Build logs</CardTitle>
                <CardDescription className="text-gh-muted">
                  {isActive ? "Live output — updating in real time" : "Full build output"}
                </CardDescription>
              </div>
              {isActive && (
                <div className="flex items-center gap-1.5 text-xs text-amber-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  Live
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="bg-gh-bg text-gh-subtle text-xs p-5 max-h-[500px] overflow-auto whitespace-pre-wrap font-mono rounded-b-2xl border-t border-gh-border leading-relaxed">
              {logs || build?.logs || (isActive ? "Waiting for build output…" : "No logs available.")}
            </pre>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
