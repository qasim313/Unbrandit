"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { AppShell } from "@/components/app-shell";

interface Flavor {
  id: string;
  name: string;
}

interface Project {
  id: string;
  name: string;
  appName: string | null;
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  logoUrl: string | null;
  status: string;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [newFlavorName, setNewFlavorName] = useState("");
  const [creatingFlavor, setCreatingFlavor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [savingProject, setSavingProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [deletingFlavorId, setDeletingFlavorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [projectRes, flavorsRes] = await Promise.all([
          api.get<Project>(`/projects/${projectId}`),
          api.get<Flavor[]>(`/projects/${projectId}/flavors`)
        ]);
        setProject(projectRes.data);
        setFlavors(flavorsRes.data);
        setProjectNameDraft(projectRes.data.name);

        if (projectRes.data.status === "DECOMPILING") {
          router.push(`/projects/${projectId}/processing`);
        }
      } catch (err) {
        console.error("Failed to load project", err);
        setError("Failed to load project");
      } finally {
        setLoading(false);
      }
    }
    if (projectId) load();
  }, [projectId, router]);

  async function createFlavor(e: FormEvent) {
    e.preventDefault();
    if (!newFlavorName.trim()) return;
    setCreatingFlavor(true);
    setError(null);
    try {
      const res = await api.post<Flavor>("/projects/create-flavor", {
        projectId,
        name: newFlavorName.trim(),
        config: {}
      });
      setFlavors((prev: Flavor[]) => [...prev, res.data]);
      setNewFlavorName("");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to create flavor");
    } finally {
      setCreatingFlavor(false);
    }
  }

  async function saveProjectName() {
    if (!project || projectNameDraft.trim() === project.name) {
      setEditingProjectName(false);
      return;
    }
    setSavingProject(true);
    setError(null);
    try {
      const res = await api.patch<Project>(`/projects/${projectId}`, { name: projectNameDraft.trim() });
      setProject(res.data);
      setEditingProjectName(false);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to update project name");
    } finally {
      setSavingProject(false);
    }
  }

  async function deleteProject() {
    if (!projectId || !confirm("Delete this project and all its flavors and builds? This cannot be undone.")) return;
    setDeletingProject(true);
    setError(null);
    try {
      await api.delete(`/projects/${projectId}`);
      router.push("/dashboard");
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete project");
      setDeletingProject(false);
    }
  }

  async function deleteFlavor(flavorId: string, flavorName: string) {
    if (!confirm(`Delete flavor "${flavorName}"? Builds for this flavor will remain but the flavor config will be removed.`)) return;
    setDeletingFlavorId(flavorId);
    setError(null);
    try {
      await api.delete(`/projects/flavors/${flavorId}`);
      setFlavors((prev) => prev.filter((f) => f.id !== flavorId));
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to delete flavor");
    } finally {
      setDeletingFlavorId(null);
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-6 animate-pulse">
          <div className="h-8 w-48 bg-gh-surface rounded-md" />
          <div className="h-40 w-full bg-gh-surface rounded-xl" />
          <div className="h-64 w-full bg-gh-surface rounded-xl" />
        </div>
      </AppShell>
    );
  }

  if (!project) return null;

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-8 animate-fade-in">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gh-subtle">
          <Link href="/dashboard" className="hover:text-gh-default transition-colors">Dashboard</Link>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
          <span className="text-gh-faint">{project.name}</span>
        </div>

        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0" />
            {error}
          </div>
        )}

        {/* Base Project Configuration Card */}
        <div className="p-8 rounded-3xl border border-gh-border bg-gh-surface flex flex-col md:flex-row items-center md:items-start gap-10 shadow-lg shadow-android/5 relative overflow-hidden">
          {/* Decorative background element */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-android/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

          <div className="w-40 h-40 rounded-[2.5rem] bg-gh-bg border-2 border-gh-border flex items-center justify-center overflow-hidden shrink-0 group relative shadow-2xl transition-transform hover:scale-[1.02] duration-500">
            {project.logoUrl ? (
              <img src={project.logoUrl} alt="App Logo" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            ) : (
              <div className="text-gh-faint p-8">
                <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17 2H7C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 16H7V6h10v12z" />
                </svg>
              </div>
            )}
            <div className="absolute inset-0 bg-android/10 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>

          <div className="flex-1 space-y-6 text-center md:text-left z-10">
            <div>
              <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-2">
                {editingProjectName ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={projectNameDraft}
                      onChange={(e) => setProjectNameDraft(e.target.value)}
                      onBlur={saveProjectName}
                      onKeyDown={(e) => e.key === "Enter" && saveProjectName()}
                      className="h-10 px-3 rounded-lg border border-gh-border bg-gh-bg text-gh-default font-bold text-xl focus:outline-none focus:ring-2 focus:ring-android/30"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={saveProjectName}
                      disabled={savingProject}
                      className="h-10 px-3 rounded-lg bg-android text-[#0d1117] text-sm font-bold disabled:opacity-50"
                    >
                      {savingProject ? "…" : "Save"}
                    </button>
                    <button type="button" onClick={() => { setEditingProjectName(false); setProjectNameDraft(project.name); }} className="text-gh-faint hover:text-gh-default text-sm">Cancel</button>
                  </div>
                ) : (
                  <h1 className="text-3xl font-extrabold text-gh-default tracking-tight font-display">{project.appName || project.name}</h1>
                )}
                {!editingProjectName && (
                  <button
                    type="button"
                    onClick={() => setEditingProjectName(true)}
                    className="p-1.5 rounded-lg text-gh-faint hover:text-android hover:bg-android/10 transition-colors"
                    title="Edit project name"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                  </button>
                )}
                <span className="px-3 py-1 rounded-full bg-android/15 text-android text-[11px] font-black uppercase tracking-widest border border-android/30 shadow-sm">Base Template</span>
              </div>
              <p className="text-sm text-gh-muted font-mono bg-gh-bg/50 px-3 py-1.5 rounded-lg border border-gh-border w-fit mx-auto md:mx-0 select-all">
                {project.packageName || "package.id.unknown"}
              </p>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 pt-2">
              <div className="space-y-1">
                <p className="text-[10px] font-black text-gh-faint uppercase tracking-[0.2em]">App Version</p>
                <p className="text-base font-bold text-gh-default">{project.versionName || "1.0.0"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-gh-faint uppercase tracking-[0.2em]">Build Code</p>
                <p className="text-base font-bold text-gh-default">{project.versionCode || "0"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-gh-faint uppercase tracking-[0.2em]">Decompilation</p>
                <div className="flex items-center gap-2 justify-center md:justify-start">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]" />
                  <p className="text-sm font-bold text-gh-default">Ready</p>
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black text-gh-faint uppercase tracking-[0.2em]">Flavors</p>
                <p className="text-base font-bold text-gh-default">{flavors.length}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={deleteProject}
                disabled={deletingProject}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-danger hover:bg-danger/10 border border-danger/30 transition-colors disabled:opacity-50"
              >
                {deletingProject ? (
                  <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                )}
                Delete project
              </button>
            </div>
          </div>
        </div>

        {/* Flavors Section */}
        <div className="space-y-5">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-lg font-bold text-gh-default">White-label Flavors</h2>
            <span className="text-xs text-gh-muted bg-gh-surface px-2 py-1 rounded-md border border-gh-border italic">{flavors.length} variant{flavors.length !== 1 ? "s" : ""} created</span>
          </div>

          {/* Create form */}
          <form onSubmit={createFlavor} className="flex gap-2 items-center p-3 rounded-xl border border-gh-border bg-gh-surface shadow-sm focus-within:ring-1 focus-within:ring-android/20 transition-all">
            <div className="flex-1 relative">
              <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gh-faint pointer-events-none">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Flavor Name (e.g. Plus, Pro, Custom...)"
                value={newFlavorName}
                onChange={(e) => setNewFlavorName(e.target.value)}
                className="w-full h-10 pl-10 pr-4 rounded-lg bg-transparent text-sm text-gh-default placeholder:text-gh-faint focus:outline-none"
              />
            </div>
            <button
              type="submit"
              disabled={creatingFlavor || !newFlavorName.trim()}
              className="h-10 px-5 rounded-lg bg-android hover:bg-android-dim text-[#0d1117] text-sm font-bold transition-all disabled:opacity-30 disabled:grayscale disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap shadow-sm active:scale-95"
            >
              {creatingFlavor ? (
                <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
              )}
              Create Flavor
            </button>
          </form>

          {/* Flavor grid */}
          {flavors.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border-2 border-dashed border-gh-border bg-gh-surface opacity-60">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-gh-bg flex items-center justify-center text-gh-faint">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                  </svg>
                </div>
              </div>
              <p className="text-sm font-medium text-gh-subtle">No flavors created yet</p>
              <p className="text-xs text-gh-faint mt-1">Start by creating a new flavor variant above.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {flavors.map((f) => (
                <div
                  key={f.id}
                  className="group relative p-6 rounded-2xl border border-gh-border bg-gh-surface hover:bg-gh-elevated hover:border-android/30 hover:shadow-lg transition-all duration-300 overflow-hidden"
                >
                  <div
                    className="absolute top-4 right-4 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all z-10"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); deleteFlavor(f.id, f.name); }}
                      disabled={deletingFlavorId === f.id}
                      className="p-2 rounded-lg text-gh-faint hover:text-danger hover:bg-danger/10 transition-colors disabled:opacity-50"
                      title="Delete flavor"
                    >
                      {deletingFlavorId === f.id ? (
                        <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                      ) : (
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                      )}
                    </button>
                  </div>

                  <div
                    className="flex flex-col h-full gap-5 cursor-pointer"
                    onClick={() => router.push(`/flavors/${f.id}`)}
                  >
                    <div className="w-12 h-12 rounded-xl bg-android-muted border border-android/10 flex items-center justify-center text-android mb-2 shadow-sm">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                      </svg>
                    </div>

                    <div>
                      <h3 className="font-bold text-gh-default text-lg group-hover:text-android transition-colors">{f.name}</h3>
                      <p className="text-xs text-gh-muted mt-1 uppercase tracking-widest font-bold">Standard Config</p>
                    </div>

                    <div className="pt-4 border-t border-gh-border/50 flex items-center justify-between">
                      <div className="flex items-center gap-1.5 opacity-60">
                        <span className="w-1.5 h-1.5 rounded-full bg-gh-faint" />
                        <p className="text-[10px] font-bold text-gh-faint uppercase tracking-tighter">Draft Version</p>
                      </div>
                      <div className="text-xs text-gh-faint font-mono">ID: {f.id.slice(0, 8)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
