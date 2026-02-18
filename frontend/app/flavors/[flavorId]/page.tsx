"use client";

import { useEffect, useState, FormEvent } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";

interface Flavor {
  id: string;
  name: string;
  configJson?: Record<string, unknown>;
  project: {
    id: string;
    name: string;
  };
}

interface Build {
  id: string;
  status: string;
  createdAt: string;
}

export default function FlavorPage() {
  const { flavorId } = useParams<{ flavorId: string }>();
  const [flavor, setFlavor] = useState<Flavor | null>(null);
  const [appName, setAppName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [versionCode, setVersionCode] = useState<number | "">("");
  const [versionName, setVersionName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [firebaseProjectId, setFirebaseProjectId] = useState("");
  const [admobAppId, setAdmobAppId] = useState("");
  const [primaryColor, setPrimaryColor] = useState("");
  const [splashBackgroundColor, setSplashBackgroundColor] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [builds, setBuilds] = useState<Build[]>([]);
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [buildType, setBuildType] = useState<"APK" | "AAB" | "BOTH">("APK");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const [flavorRes, buildsRes] = await Promise.all([
        api.get(`/projects/flavors/${flavorId}`),
        api.get(`/builds/flavor/${flavorId}`)
      ]);
      setFlavor(flavorRes.data);
      const cfg = (flavorRes.data.configJson || {}) as any;
      setAppName(cfg.app?.name ?? "");
      setPackageName(cfg.app?.applicationId ?? "");
      setVersionCode(typeof cfg.app?.versionCode === "number" ? cfg.app.versionCode : "");
      setVersionName(cfg.app?.versionName ?? "");
      setApiBaseUrl(cfg.api?.baseUrl ?? "");
      setFirebaseProjectId(cfg.firebase?.projectId ?? "");
      setAdmobAppId(cfg.admob?.appId ?? "");
      setPrimaryColor(cfg.app?.primaryColor ?? "");
      setSplashBackgroundColor(cfg.app?.splashBackgroundColor ?? "");
      setBuilds(buildsRes.data);
    }
    if (flavorId) load().catch(() => {});
  }, [flavorId]);

  async function saveConfig(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const config = {
        app: {
          name: appName || undefined,
          applicationId: packageName || undefined,
          versionCode:
            versionCode === "" ? undefined : Number.parseInt(String(versionCode), 10),
          versionName: versionName || undefined,
          primaryColor: primaryColor || undefined,
          splashBackgroundColor: splashBackgroundColor || undefined
        },
        api: { baseUrl: apiBaseUrl || undefined },
        firebase: { projectId: firebaseProjectId || undefined },
        admob: { appId: admobAppId || undefined }
      };
      const res = await api.patch(`/projects/flavors/${flavorId}`, { config });
      setFlavor((prev) => (prev ? { ...prev, configJson: res.data.configJson } : prev));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setError(err?.message || "Failed to save config");
    } finally {
      setSaving(false);
    }
  }

  async function startBuild(e: FormEvent) {
    e.preventDefault();
    if (!flavor || !sourceFile) return;
    setError(null);

    const isApk = sourceFile.name.endsWith(".apk");
    const uploadPath = isApk ? "/uploads/upload-apk" : "/uploads/upload-source";
    const form = new FormData();
    form.append("file", sourceFile);
    form.append("projectId", flavor.project.id);
    form.append("flavorId", flavor.id);

    try {
      const uploadRes = await api.post(uploadPath, form, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      const { url, type } = uploadRes.data;

      const buildRes = await api.post("/builds/build", {
        flavorId: flavor.id,
        buildType,
        sourceUrl: url,
        sourceType: type === "APK" ? "APK" : "SOURCE"
      });
      setBuilds((prev) => [buildRes.data, ...prev]);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to queue build");
    }
  }

  function statusClass(s: string) {
    if (s === "COMPLETED") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
    if (s === "FAILED") return "bg-red-500/20 text-red-300 border border-red-500/30";
    if (s === "IN_PROGRESS" || s === "QUEUED") return "bg-amber-500/20 text-amber-300 border border-amber-500/30";
    return "bg-slate-500/20 text-slate-400 border border-slate-500/30";
  }

  return (
    <AppShell>
      <div className="space-y-8 animate-fade-in">
        <div className="flex items-center gap-4">
          <Link
            href={`/projects/${flavor?.project?.id}`}
            className="text-slate-400 hover:text-sky-400 transition-colors text-sm"
          >
            ← Back to project
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-100">
              {flavor?.name || "Flavor"}
            </h1>
            {flavor && (
              <p className="text-sm text-slate-400">Project: {flavor.project.name}</p>
            )}
          </div>
        </div>

        <form onSubmit={saveConfig} className="space-y-6">
          <Card className="card-hover">
            <CardHeader>
              <CardTitle>App identity</CardTitle>
              <CardDescription>Display name and package identifier for this flavor.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">App name</label>
                <Input
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  placeholder="Client A App"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Package name</label>
                <Input
                  value={packageName}
                  onChange={(e) => setPackageName(e.target.value)}
                  placeholder="com.example.clienta"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader>
              <CardTitle>Version</CardTitle>
              <CardDescription>Android versionCode and versionName for the build.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Version code</label>
                <Input
                  type="number"
                  value={versionCode}
                  onChange={(e) =>
                    setVersionCode(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))
                  }
                  placeholder="64"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Version name</label>
                <Input
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="7.1"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader>
              <CardTitle>API &amp; services</CardTitle>
              <CardDescription>Backend base URL and optional Firebase / AdMob IDs.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">API base URL</label>
                <Input
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="https://api.client-a.com"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">Firebase project ID</label>
                  <Input
                    value={firebaseProjectId}
                    onChange={(e) => setFirebaseProjectId(e.target.value)}
                    placeholder="my-app-12345"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-300">AdMob app ID</label>
                  <Input
                    value={admobAppId}
                    onChange={(e) => setAdmobAppId(e.target.value)}
                    placeholder="ca-app-pub-xxxxxxxx~yyyyyyyy"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader>
              <CardTitle>Colors</CardTitle>
              <CardDescription>Primary and splash colors (e.g. #3B82F6 or #0ea5e9).</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Primary color</label>
                <Input
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="#0ea5e9"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Splash background color</label>
                <Input
                  value={splashBackgroundColor}
                  onChange={(e) => setSplashBackgroundColor(e.target.value)}
                  placeholder="#ffffff"
                />
              </div>
            </CardContent>
          </Card>

          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save configuration"}
            </Button>
            {saveSuccess && (
              <span className="text-sm text-emerald-400 animate-fade-in">Saved successfully.</span>
            )}
          </div>
        </form>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Start build</CardTitle>
            <CardDescription>Upload APK or Android source ZIP and choose output type.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={startBuild} className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Source file (APK or source ZIP)</label>
                <Input
                  type="file"
                  accept=".apk,.zip"
                  onChange={(e) => setSourceFile(e.target.files?.[0] || null)}
                  className="cursor-pointer"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-300">Build type</label>
                <select
                  value={buildType}
                  onChange={(e) => setBuildType(e.target.value as "APK" | "AAB" | "BOTH")}
                  className="h-10 w-full max-w-xs rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="APK">Signed APK</option>
                  <option value="AAB">Signed AAB</option>
                  <option value="BOTH">APK + AAB</option>
                </select>
              </div>
              <Button type="submit">Queue build</Button>
            </form>
          </CardContent>
        </Card>

        <Card className="card-hover">
          <CardHeader>
            <CardTitle>Build history</CardTitle>
            <CardDescription>Recent builds for this flavor.</CardDescription>
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
                  {builds.map((b) => (
                    <tr key={b.id} className="border-t border-slate-700/50 hover:bg-slate-800/30 transition-colors">
                      <td className="px-6 py-3 font-mono text-slate-300">{b.id.slice(0, 8)}…</td>
                      <td className="px-6 py-3">
                        <span className={`status-pill ${statusClass(b.status)}`}>{b.status}</span>
                      </td>
                      <td className="px-6 py-3 text-slate-400">{new Date(b.createdAt).toLocaleString()}</td>
                      <td className="px-6 py-3">
                        <Link href={`/builds/${b.id}`} className="text-sky-400 hover:text-sky-300 font-medium">
                          View logs
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {!builds.length && (
                    <tr>
                      <td colSpan={4} className="px-6 py-8 text-center text-slate-500">
                        No builds yet. Start one above.
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

