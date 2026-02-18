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
}

function statusClass(s: string) {
  if (s === "COMPLETED") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
  if (s === "FAILED") return "bg-red-500/20 text-red-300 border border-red-500/30";
  if (s === "IN_PROGRESS" || s === "QUEUED") return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
  return "bg-slate-500/20 text-slate-400 border border-slate-500/30";
}

export default function BuildPage() {
  const { buildId } = useParams<{ buildId: string }>();
  const [build, setBuild] = useState<Build | null>(null);
  const { logs, status, downloadUrl } = useBuildLogs(buildId);
  const currentStatus = status || build?.status || "—";

  useEffect(() => {
    if (buildId) api.get(`/builds/${buildId}`).then((res) => setBuild(res.data)).catch(() => {});
  }, [buildId]);

  return (
    <AppShell>
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-400 hover:text-sky-400 transition-colors text-sm">
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">Build</h1>
            <p className="text-sm font-mono text-slate-400">{buildId}</p>
          </div>
        </div>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Status</CardTitle>
            <CardDescription>Current build state and artifact.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4">
            <span className={`status-pill ${statusClass(currentStatus)}`}>{currentStatus}</span>
            {downloadUrl && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium px-4 py-2 transition-colors"
              >
                Download artifact
              </a>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Logs</CardTitle>
            <CardDescription>Live build output.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <pre className="bg-slate-950/80 text-slate-300 text-xs p-4 max-h-[420px] overflow-auto whitespace-pre-wrap font-mono rounded-b-xl border-t border-slate-700/50">
              {logs || "No logs yet."}
            </pre>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

