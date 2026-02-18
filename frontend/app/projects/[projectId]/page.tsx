"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";

interface Flavor {
  id: string;
  name: string;
}

export default function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const [projectName, setProjectName] = useState<string>("");
  const [flavors, setFlavors] = useState<Flavor[]>([]);
  const [newFlavorName, setNewFlavorName] = useState("");
  const [creatingFlavor, setCreatingFlavor] = useState(false);

  useEffect(() => {
    async function load() {
      const [projectsRes, flavorsRes] = await Promise.all([
        api.get("/projects"),
        api.get(`/projects/${projectId}/flavors`)
      ]);
      const project = projectsRes.data.find((p: { id: string }) => p.id === projectId);
      setProjectName(project?.name || "");
      setFlavors(flavorsRes.data);
    }
    if (projectId) load().catch(() => {});
  }, [projectId]);

  async function createFlavor(e: FormEvent) {
    e.preventDefault();
    if (!newFlavorName.trim()) return;
    setCreatingFlavor(true);
    try {
      const res = await api.post("/projects/create-flavor", {
        projectId,
        name: newFlavorName.trim(),
        config: {}
      });
      setFlavors((prev) => [...prev, res.data]);
      setNewFlavorName("");
    } finally {
      setCreatingFlavor(false);
    }
  }

  function goToFlavor(flavorId: string) {
    router.push(`/flavors/${flavorId}`);
  }

  return (
    <AppShell>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-slate-400 hover:text-sky-400 transition-colors text-sm">
            ← Dashboard
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">{projectName || "Project"}</h1>
            <p className="text-sm text-slate-400">Manage flavors and start builds.</p>
          </div>
        </div>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Flavors</CardTitle>
            <CardDescription>Each flavor is a white-label variant with its own branding and config.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={createFlavor} className="flex flex-wrap gap-2 items-center">
              <Input
                placeholder="New flavor name (e.g. Client A)"
                value={newFlavorName}
                onChange={(e) => setNewFlavorName(e.target.value)}
                className="w-80"
              />
              <Button type="submit" disabled={creatingFlavor}>
                {creatingFlavor ? "Creating…" : "Create flavor"}
              </Button>
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
                  {flavors.map((f) => (
                    <tr key={f.id} className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-slate-200">{f.name}</td>
                      <td className="px-4 py-3">
                        <Button variant="ghost" onClick={() => goToFlavor(f.id)}>
                          Configure & build →
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {!flavors.length && (
                    <tr>
                      <td colSpan={2} className="px-4 py-8 text-center text-slate-500">
                        No flavors yet. Create one above.
                      </td>
                    </tr>
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

