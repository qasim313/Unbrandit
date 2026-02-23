"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { AppShell } from "@/components/app-shell";

interface Project {
  id: string;
  name: string;
  appName: string | null;
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  logoUrl: string | null;
  status: "PENDING" | "DECOMPILING" | "READY" | "FAILED";
  createdAt: string;
  flavors?: { id: string }[];
}

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ProjectStatusBadge({ status }: { status: Project["status"] }) {
  const map: Record<Project["status"], { cls: string; dot: string; label: string }> = {
    READY: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]", label: "Ready" },
    FAILED: { cls: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-400", label: "Failed" },
    DECOMPILING: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-400 animate-pulse", label: "Processing" },
    PENDING: { cls: "bg-gh-bg text-gh-faint border-gh-border", dot: "bg-gh-faint", label: "Pending" },
  };
  const s = map[status] ?? { cls: "bg-gh-surface text-gh-muted border-gh-border", dot: "bg-gh-faint", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${s.cls}`}>
      <span className={`w-1 h-1 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

type CreateStep = "idle" | "uploading" | "creating";

export default function DashboardPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [newName, setNewName] = useState("");
  const [apkFile, setApkFile] = useState<File | null>(null);
  const [createStep, setCreateStep] = useState<CreateStep>("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadedApkUrl, setUploadedApkUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const isBusy = createStep !== "idle";
  const [dragOver, setDragOver] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (isBusy) return;
    const file = e.dataTransfer.files?.[0];
    if (file?.name.toLowerCase().endsWith(".apk")) {
      setApkFile(file);
      uploadApk(file);
    }
  }

  async function uploadApk(file: File) {
    setUploadError(null);
    setUploadedApkUrl(null);
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/uploads/upload-apk", formData, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (ev) => {
          if (ev.total && ev.total > 0) {
            setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
          }
        }
      });
      setUploadedApkUrl(res.data.url);
    } catch (err: any) {
      setUploadError(err?.response?.data?.error || "Upload failed. Please try again.");
      setApkFile(null);
    } finally {
      setIsUploading(false);
    }
  }

  useEffect(() => {
    api.get("/projects")
      .then((res: any) => setProjects(res.data))
      .catch(() => { })
      .finally(() => setLoading(false));
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || !uploadedApkUrl) return;
    setError(null);
    setCreateStep("creating");

    try {
      const res = await api.post("/projects", {
        name: newName.trim(),
        originalApkUrl: uploadedApkUrl
      });

      router.push(`/projects/${res.data.id}/processing`);
    } catch (err: any) {
      const errorMsg = err?.response?.data?.details
        ? Object.entries(err.response.data.details)
          .map(([f, ms]) => `${f}: ${(ms as string[]).join(", ")}`)
          .join(" | ")
        : err?.response?.data?.error || "Something went wrong. Please try again.";
      setError(errorMsg);
      setCreateStep("idle");
      setUploadProgress(0);
    }
  }

  return (
    <AppShell>
      <div className="space-y-8 animate-fade-in max-w-6xl mx-auto">
        {/* Page header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-gh-default">Projects</h1>
            <p className="text-sm text-gh-muted mt-1">Upload a base APK, then create flavors and build variants.</p>
          </div>
          <Link
            href="/builds"
            className="inline-flex items-center gap-2 text-sm font-medium text-gh-subtle hover:text-android transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            </svg>
            View build history
          </Link>
        </div>

        {/* Create project section */}
        <div className="relative p-6 sm:p-8 rounded-2xl border border-gh-border bg-gh-surface shadow-sm">
          {isBusy && (
            <div className="absolute inset-0 rounded-2xl bg-gh-bg/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-4 min-h-[200px]">
              <div className="w-12 h-12 rounded-full border-2 border-android border-t-transparent animate-spin" />
              <div className="text-center space-y-1">
                <p className="text-sm font-semibold text-gh-default">
                  Creating project…
                </p>
                <p className="text-xs text-gh-muted">
                  Setting up your project. You’ll be redirected next.
                </p>
              </div>
            </div>
          )}

          <div className="mb-6">
            <h2 className="text-lg font-bold text-gh-default">Create a new project</h2>
            <p className="text-sm text-gh-muted mt-1">Give your project a name and upload the base Android APK. We’ll extract it and then you can add flavors.</p>
          </div>

          <form onSubmit={createProject} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-1.5">
                <label htmlFor="project-name" className="block text-sm font-medium text-gh-default">
                  Project name
                </label>
                <div className="relative">
                  <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gh-faint pointer-events-none">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
                    </svg>
                  </div>
                  <input
                    id="project-name"
                    type="text"
                    placeholder="e.g. My App"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    disabled={isBusy}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-gh-border bg-gh-bg text-sm text-gh-default placeholder:text-gh-faint focus:outline-none focus:border-android/50 focus:ring-2 focus:ring-android/10 transition-all font-medium disabled:opacity-60 disabled:cursor-not-allowed"
                  />
                </div>
                <p className="text-xs text-gh-faint">A short name to identify this app (you can change it later).</p>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-gh-default">Base APK file</label>
                <div
                  className={`relative min-h-[100px] border-2 border-dashed rounded-xl flex flex-col items-center justify-center p-5 transition-all ${!isBusy ? "cursor-pointer" : "cursor-not-allowed opacity-80"} ${apkFile ? "border-android/40 bg-android/5" : dragOver ? "border-android/50 bg-android/10" : "border-gh-border hover:border-gh-muted bg-gh-bg"}`}
                  onClick={() => !isBusy && document.getElementById("project-apk-upload")?.click()}
                  onDragOver={(e) => { e.preventDefault(); if (!isBusy) setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                >
                  <div className={`mb-2 ${apkFile ? "text-android" : "text-gh-faint"}`}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                  </div>
                  <span className={`text-sm text-center leading-tight ${apkFile ? "text-gh-default font-medium" : "text-gh-muted"}`}>
                    {apkFile ? (
                      <>
                        {apkFile.name}
                        <span className="block text-xs text-gh-faint mt-1 font-normal">{formatFileSize(apkFile.size)}</span>
                      </>
                    ) : (
                      "Choose an APK file or drag it here"
                    )}
                  </span>
                  <input
                    id="project-apk-upload"
                    type="file"
                    accept=".apk"
                    disabled={isBusy || isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setApkFile(file);
                        uploadApk(file);
                      }
                    }}
                    className="hidden"
                  />

                  {(isUploading || uploadedApkUrl) && (
                    <div className="absolute inset-0 bg-gh-surface/60 backdrop-blur-[2px] rounded-xl flex flex-col items-center justify-center p-4 z-20 animate-fade-in">
                      {isUploading ? (
                        <>
                          <div className="w-full max-w-[160px] h-1.5 bg-gh-border rounded-full overflow-hidden shadow-inner">
                            <div
                              className="h-full bg-android shadow-[0_0_10px_rgba(164,198,57,0.3)] transition-all duration-300"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-bold text-gh-default mt-2 uppercase tracking-widest">{uploadProgress}% Uploaded</span>
                        </>
                      ) : (
                        <div className="flex flex-col items-center animate-scale-in">
                          <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-2">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest">Ready to Create</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gh-faint">The Android app you want to white-label. Only .apk is supported.</p>
              </div>
            </div>

            <div className="lg:col-span-2 flex flex-col justify-end h-full min-h-[44px]">
              <button
                type="submit"
                disabled={isBusy || isUploading || !newName.trim() || !uploadedApkUrl}
                className="h-11 w-full rounded-xl bg-android hover:bg-android-dim text-[#0d1117] text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-android/10 active:scale-[0.98]"
              >
                {!isBusy && (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                    Create project
                  </>
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-danger shrink-0 mt-0.5">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-danger font-medium">{error}</p>
            </div>
          )}
        </div>

        {/* Existing Projects */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-gh-default">Your projects</h2>
            {!loading && projects.length > 0 && (
              <span className="text-xs text-gh-muted">{projects.length} project{projects.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-gh-surface border border-gh-border animate-pulse" />
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-16 rounded-2xl border-2 border-dashed border-gh-border bg-gh-surface/40 px-6">
              <div className="w-14 h-14 rounded-2xl bg-gh-bg border border-gh-border flex items-center justify-center mx-auto mb-4 text-gh-faint">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 2H7C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 16H7V6h10v12z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-gh-default">No projects yet</p>
              <p className="text-xs text-gh-muted mt-1 max-w-sm mx-auto">Create your first project above: add a name and upload your base APK to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {projects.map((p) => {
                const flavorCount = p.flavors?.length ?? 0;
                return (
                  <div
                    key={p.id}
                    className="p-1 px-1 group rounded-2xl border border-gh-border bg-gh-surface hover:bg-gh-elevated hover:border-android/30 hover:shadow-xl hover:shadow-android/5 transition-all duration-300 cursor-pointer overflow-hidden"
                    onClick={() => router.push(`/projects/${p.id}`)}
                  >
                    <div className="p-5 flex items-start gap-5 relative">
                      <div className="w-14 h-14 rounded-2xl bg-gh-bg border border-gh-border flex items-center justify-center shrink-0 overflow-hidden shadow-inner font-bold text-gh-faint">
                        {p.logoUrl ? (
                          <img src={p.logoUrl} alt="Icon" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" opacity="0.3"><path d="M17 2H7C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 16H7V6h10v12z" /></svg>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pr-10">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-base font-bold text-gh-default truncate group-hover:text-android transition-colors">{p.appName || p.name}</h3>
                          <ProjectStatusBadge status={p.status} />
                        </div>
                        <p className="text-xs text-gh-muted font-mono truncate mb-3">{p.packageName || "decompiling..."}</p>

                        <div className="flex items-center gap-4 text-[11px] font-bold text-gh-faint uppercase tracking-tighter">
                          <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>
                            {flavorCount} Flavor{flavorCount !== 1 ? 's' : ''}
                          </div>
                          <span className="opacity-20">|</span>
                          <div className="flex items-center gap-1.5">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                            v{p.versionName || "?"} ({p.versionCode || 0})
                          </div>
                        </div>
                      </div>

                      <div className="absolute top-6 right-6 text-gh-faint group-hover:text-android group-hover:translate-x-1 transition-all">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
