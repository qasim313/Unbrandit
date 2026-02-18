"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/store/auth";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";

interface Project {
  id: string;
  name: string;
}

interface Build {
  id: string;
  status: string;
  createdAt: string;
}

function statusClass(s: string) {
  if (s === "COMPLETED") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
  if (s === "FAILED") return "bg-red-500/20 text-red-300 border border-red-500/30";
  if (s === "IN_PROGRESS" || s === "QUEUED") return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
  return "bg-slate-500/20 text-slate-400 border border-slate-500/30";
}

export default function DashboardPage() {
  const { token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [newProjectName, setNewProjectName] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [projRes, buildRes] = await Promise.all([
          api.get("/projects"),
          api.get("/builds")
        ]);
        setProjects(projRes.data);
        setBuilds(buildRes.data);
      } finally {
        setLoading(false);
      }
    }
    if (token || typeof window !== "undefined") load().catch(() => setLoading(false));
  }, [token]);

  async function createProject() {
    if (!newProjectName.trim()) return;
    const res = await api.post("/projects", { name: newProjectName.trim() });
    setProjects((prev) => [...prev, res.data]);
    setNewProjectName("");
  }

  return (
    <AppShell>
      <div className="space-y-8 animate-fade-in">
        <header>
          <h1 className="text-2xl font-bold text-slate-100">Dashboard</h1>
          <p className="text-slate-400 mt-1">Manage projects and monitor builds.</p>
        </header>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Projects</CardTitle>
            <CardDescription>Create a project, then add flavors and run builds.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={(e) => { e.preventDefault(); createProject(); }}
              className="flex flex-wrap gap-2 items-center"
            >
              <Input
                placeholder="New project name"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-64"
              />
              <Button type="submit">Create project</Button>
            </form>
            <div className="rounded-lg border border-slate-700/50 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 text-slate-400">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Name</th>
                    <th className="px-4 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">Loading…</td></tr>
                  ) : projects.length === 0 ? (
                    <tr><td colSpan={2} className="px-4 py-8 text-center text-slate-500">No projects yet. Create one above.</td></tr>
                  ) : (
                    projects.map((p) => (
                      <tr key={p.id} className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium text-slate-200">{p.name}</td>
                        <td className="px-4 py-3">
                          <Link href={`/projects/${p.id}`} className="text-sky-400 hover:text-sky-300 font-medium">
                            Open →
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Recent builds</CardTitle>
            <CardDescription>Latest build activity across all flavors.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50 text-slate-400">
                  <tr>
                    <th className="px-6 py-3 text-left font-medium">ID</th>
                    <th className="px-6 py-3 text-left font-medium">Status</th>
                    <th className="px-6 py-3 text-left font-medium">Created</th>
                    <th className="px-6 py-3 text-left font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">Loading…</td></tr>
                  ) : builds.length === 0 ? (
                    <tr><td colSpan={4} className="px-6 py-8 text-center text-slate-500">No builds yet.</td></tr>
                  ) : (
                    builds.map((b) => (
                      <tr key={b.id} className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                        <td className="px-6 py-3 font-mono text-slate-300">{b.id.slice(0, 8)}…</td>
                        <td className="px-6 py-3">
                          <span className={`status-pill ${statusClass(b.status)}`}>{b.status}</span>
                        </td>
                        <td className="px-6 py-3 text-slate-400">{new Date(b.createdAt).toLocaleString()}</td>
                        <td className="px-6 py-3">
                          <Link href={`/builds/${b.id}`} className="text-sky-400 hover:text-sky-300 font-medium">View</Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

