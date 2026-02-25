"use client";

import React, { useEffect, useState, FormEvent, ChangeEvent, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { AdvancedConfig } from "@/components/advanced-config";

interface Flavor {
  id: string;
  name: string;
  configJson?: any;
  projectId: string;
}

interface Project {
  id: string;
  name: string;
  appName: string | null;
  packageName: string | null;
  versionName: string | null;
  versionCode: number | null;
  logoUrl: string | null;
  sourceUrl: string | null;
  originalApkUrl: string | null;
}

interface Build {
  id: string;
  status: string;
  createdAt: string;
}

interface UploadedApk {
  apkUrl: string;
  filename: string;
  versionName: string;
  versionCode: number | string;
  uploadedAt: string;
  sizeBytes?: number;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; dot: string; label: string }> = {
    SUCCESS: { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400", label: "Completed" },
    FAILED: { cls: "bg-red-500/15 text-red-400 border-red-500/30", dot: "bg-red-400", label: "Failed" },
    RUNNING: { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30", dot: "bg-amber-400 animate-pulse", label: "Running" },
    QUEUED: { cls: "bg-sky-500/15 text-sky-400 border-sky-500/30", dot: "bg-sky-400 animate-pulse", label: "Queued" },
    PENDING: { cls: "bg-gh-bg text-gh-faint border-gh-border", dot: "bg-gh-faint", label: "Pending" },
  };
  const s = map[status] ?? { cls: "bg-gh-surface text-gh-muted border-gh-border", dot: "bg-gh-faint", label: status };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function SectionHeader({ icon, title, description }: { icon: string; title: string; description: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-gh-bg border border-gh-border flex items-center justify-center text-xl shrink-0">
        {icon}
      </div>
      <div>
        <h3 className="font-display font-semibold text-gh-default">{title}</h3>
        <p className="text-sm text-gh-muted mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="field-label">{label}</label>
      {children}
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function ColorField({ label, hint, value, onChange }: { label: string; hint?: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label className="field-label">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative">
          <input
            type="color"
            value={value || "#0ea5e9"}
            onChange={(e) => onChange(e.target.value)}
            className="w-11 h-11 rounded-xl border border-gh-border bg-gh-bg cursor-pointer p-1"
          />
        </div>
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#0ea5e9"
          className="flex-1 font-mono"
        />
      </div>
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FlavorPage() {
  const { flavorId } = useParams<{ flavorId: string }>();
  const [flavor, setFlavor] = useState<Flavor | null>(null);
  const [project, setProject] = useState<Project | null>(null);

  // Config fields
  const [appName, setAppName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [versionCode, setVersionCode] = useState<number | "">("");
  const [versionName, setVersionName] = useState("");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [firebaseProjectId, setFirebaseProjectId] = useState("");
  const [admobAppId, setAdmobAppId] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0ea5e9");
  const [splashBackgroundColor, setSplashBackgroundColor] = useState("#ffffff");
  const [logoUrl, setLogoUrl] = useState("");
  const [overrides, setOverrides] = useState<{ type: "string" | "resource" | "file"; search?: string; replace?: string; path?: string; replaceUrl?: string; fileName?: string }[]>([]);

  // Build state
  const [versions, setVersions] = useState<any[]>([]);
  const [showingRollback, setShowingRollback] = useState(false);
  const [buildType, setBuildType] = useState<"APK" | "AAB" | "BOTH">("APK");
  const [builds, setBuilds] = useState<Build[]>([]);

  // UI state
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingKeystore, setUploadingKeystore] = useState(false);
  const keystoreInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function load() {
      const flavorRes = await api.get<Flavor & { project?: Project }>(`/projects/flavors/${flavorId}`);
      setFlavor(flavorRes.data);
      const proj = flavorRes.data.project;
      setProject(proj ?? null);

      const buildsRes = await api.get<Build[]>(`/builds/flavor/${flavorId}`);
      setBuilds(buildsRes.data);

      const cfg = (flavorRes.data.configJson || {}) as any;
      setAppName(cfg.app?.name ?? proj?.appName ?? "");
      setPackageName(cfg.app?.applicationId ?? proj?.packageName ?? "");
      setVersionCode(cfg.app?.versionCode ?? proj?.versionCode ?? "");
      setVersionName(cfg.app?.versionName ?? proj?.versionName ?? "");
      setPrimaryColor(cfg.app?.primaryColor ?? "#0ea5e9");
      setSplashBackgroundColor(cfg.app?.splashBackgroundColor ?? "#ffffff");
      setLogoUrl(cfg.branding?.logoUrl ?? proj?.logoUrl ?? "");

      setApiBaseUrl(cfg.api?.baseUrl ?? "");
      setFirebaseProjectId(cfg.firebase?.projectId ?? "");
      setAdmobAppId(cfg.admob?.appId ?? "");
      setOverrides(cfg.overrides ?? []);
    }
    if (flavorId) load().catch((e) => console.error(e));
  }, [flavorId]);

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      const config = {
        ...(flavor?.configJson || {}),
        app: {
          name: appName === project?.appName ? undefined : appName,
          applicationId: packageName === project?.packageName ? undefined : packageName,
          versionCode: versionCode === project?.versionCode ? undefined : Number.parseInt(String(versionCode), 10),
          versionName: versionName === project?.versionName ? undefined : versionName,
          primaryColor: primaryColor === "#0ea5e9" ? undefined : primaryColor,
          splashBackgroundColor: splashBackgroundColor === "#ffffff" ? undefined : splashBackgroundColor,
        },
        branding: {
          logoUrl: logoUrl === project?.logoUrl ? undefined : logoUrl,
        },
        signing: (flavor?.configJson as any)?.signing || undefined,
        api: { baseUrl: apiBaseUrl || undefined },
        overrides: overrides.length > 0 ? overrides : undefined,
        firebase: { projectId: firebaseProjectId || undefined },
        admob: { appId: admobAppId || undefined },
      };
      const res = await api.patch<{ configJson: any }>(`/projects/flavors/${flavorId}`, { config });
      setFlavor((prev: Flavor | null) => (prev ? { ...prev, configJson: res.data.configJson } : prev));

      // Refresh versions
      const versionsRes = await api.get<any[]>(`/projects/flavors/${flavorId}/versions`);
      setVersions(versionsRes.data);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  }

  async function rollbackToVersion(versionId: string) {
    setSaving(true);
    try {
      const res = await api.post<{ flavor: Flavor }>(`/projects/flavors/${flavorId}/rollback/${versionId}`);
      setFlavor(res.data.flavor);
      const cfg = (res.data.flavor.configJson || {}) as any;
      setAppName(cfg.app?.name ?? "");
      setPackageName(cfg.app?.applicationId ?? "");
      setVersionCode(typeof cfg.app?.versionCode === "number" ? cfg.app.versionCode : "");
      setVersionName(cfg.app?.versionName ?? "");
      setApiBaseUrl(cfg.api?.baseUrl ?? "");
      setFirebaseProjectId(cfg.firebase?.projectId ?? "");
      setAdmobAppId(cfg.admob?.appId ?? "");
      setPrimaryColor(cfg.app?.primaryColor ?? "#0ea5e9");
      setSplashBackgroundColor(cfg.app?.splashBackgroundColor ?? "#ffffff");

      // Refresh versions
      const versionsRes = await api.get(`/projects/flavors/${flavorId}/versions`);
      setVersions(versionsRes.data);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setError("Failed to rollback version");
    } finally {
      setSaving(false);
    }
  }

  async function startBuild(e: FormEvent) {
    e.preventDefault();
    if (!flavor || !project?.originalApkUrl) return;
    setBuildError(null);

    try {
      const buildRes = await api.post("/builds/build", {
        flavorId: flavor.id,
        buildType,
        sourceUrl: project.originalApkUrl,
        sourceType: "APK",
      });
      setBuilds((prev) => [buildRes.data, ...prev]);
    } catch (err: any) {
      setBuildError(err?.response?.data?.error || "Failed to queue build");
    }
  }

  return (
    <AppShell>
      <div className="space-y-8 animate-fade-in max-w-4xl">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-4">
            <Link
              href={`/projects/${project?.id}`}
              className="group flex items-center gap-2 text-xs font-bold text-gh-faint hover:text-android transition-all uppercase tracking-widest"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="group-hover:-translate-x-1 transition-transform">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
              Back to {project?.name || "Project"}
            </Link>
            <div>
              <h1 className="font-display text-4xl font-black text-gh-default tracking-tight">{flavor?.name || "Flavor"}</h1>
              <p className="text-sm text-gh-muted mt-1.5 flex items-center gap-2">
                Customizing variant based on
                <span className="font-bold text-gh-subtle bg-gh-surface px-2 py-0.5 rounded border border-gh-border">{project?.appName || project?.name}</span>
              </p>
            </div>
          </div>
        </div>

        {/* ── Base Project Configuration Card ── */}
        {project && (
          <div className="p-6 rounded-[2rem] border border-gh-border bg-gh-surface/50 flex items-center gap-6 shadow-sm relative overflow-hidden group">
            {/* Subtle indicator that this is the base info */}
            <div className="absolute top-0 right-0 px-4 py-1.5 bg-gh-surface border-b border-l border-gh-border rounded-bl-xl text-[10px] font-black text-gh-faint uppercase tracking-widest">
              Base Template Info
            </div>

            <div className="w-20 h-20 rounded-2xl bg-gh-bg border border-gh-border flex items-center justify-center shrink-0 overflow-hidden shadow-inner group-hover:scale-105 transition-transform duration-500">
              {project.logoUrl ? (
                <img src={project.logoUrl} alt="Base" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="text-gh-faint p-4">
                  <svg width="100%" height="100%" viewBox="0 0 24 24" fill="currentColor"><path d="M17 2H7C5.9 2 5 2.9 5 4v16c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 16H7V6h10v12z" /></svg>
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gh-default mb-0.5">{project.appName}</p>
              <p className="text-xs text-gh-muted font-mono mb-3">{project.packageName}</p>

              <div className="flex items-center gap-4 text-[10px] font-black text-gh-faint uppercase tracking-[0.1em]">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gh-border" />
                  v{project.versionName}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-gh-border" />
                  Build {project.versionCode}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Configuration Form ── */}
        <form onSubmit={saveConfig} className="space-y-5">
          {/* App Identity */}
          <Card>
            <CardHeader>
              <SectionHeader
                icon="🏷️"
                title="App Identity"
                description="The display name and unique package identifier for this flavor."
              />
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FieldGroup
                label="App name"
                hint={appName === project?.appName ? "Inheriting from Project Base" : "Overridden for this Flavor"}
              >
                <div className="relative">
                  <Input
                    value={appName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setAppName(e.target.value)}
                    placeholder={project?.appName || "App Name"}
                    className={appName !== project?.appName ? "border-android/30 focus:ring-android/20" : ""}
                  />
                  {appName !== project?.appName && (
                    <button
                      type="button"
                      onClick={() => setAppName(project?.appName || "")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gh-subtle hover:text-android uppercase tracking-tight transition-colors"
                    >
                      Reset to Base
                    </button>
                  )}
                </div>
              </FieldGroup>
              <FieldGroup
                label="Package name"
                hint={packageName === project?.packageName ? "Inheriting from Project Base" : "Overridden for this Flavor"}
              >
                <div className="relative">
                  <Input
                    value={packageName}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setPackageName(e.target.value)}
                    placeholder={project?.packageName || "com.package.id"}
                    className={`font-mono ${packageName !== project?.packageName ? "border-android/30 focus:ring-android/20" : ""}`}
                  />
                  {packageName !== project?.packageName && (
                    <button
                      type="button"
                      onClick={() => setPackageName(project?.packageName || "")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gh-subtle hover:text-android uppercase tracking-tight transition-colors"
                    >
                      Reset to Base
                    </button>
                  )}
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Version */}
          <Card>
            <CardHeader>
              <SectionHeader
                icon="🔢"
                title="Version"
                description="Control the app version shown to users and used by the Play Store."
              />
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <FieldGroup
                label="Version name"
                hint='The human-readable version shown to users (e.g. "2.1.0").'
              >
                <Input
                  value={versionName}
                  onChange={(e) => setVersionName(e.target.value)}
                  placeholder="2.1.0"
                  className="font-mono"
                />
              </FieldGroup>
              <FieldGroup
                label="Version code"
                hint="An integer that must increase with every release (e.g. 21). Used internally by Android."
              >
                <Input
                  type="number"
                  value={versionCode}
                  onChange={(e) => setVersionCode(e.target.value === "" ? "" : Number.parseInt(e.target.value, 10))}
                  placeholder="21"
                  min={1}
                  className="font-mono"
                />
              </FieldGroup>
            </CardContent>
          </Card>

          {/* Branding & Colors */}
          <Card>
            <CardHeader>
              <SectionHeader
                icon="🎨"
                title="Branding & Colors"
                description="Choose the primary brand color and splash screen background for this flavor."
              />
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <ColorField
                label="Primary color"
                hint="Main theme color for the app UI."
                value={primaryColor}
                onChange={setPrimaryColor}
              />
              <ColorField
                label="Splash background color"
                hint="The background color shown on the splash/loading screen when the app opens."
                value={splashBackgroundColor}
                onChange={setSplashBackgroundColor}
              />
              <FieldGroup
                label="App Logo Overwrite"
                hint={logoUrl === project?.logoUrl ? "Inheriting icon from Project Base" : "Using flavor-specific logo override"}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-16 h-16 rounded-2xl border bg-gh-bg flex items-center justify-center overflow-hidden shrink-0 ${logoUrl !== project?.logoUrl ? "border-android/40 shadow-glow-android/10" : "border-gh-border"}`}>
                    <img src={logoUrl || "/placeholder-icon.svg"} alt="Logo Preview" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = '/placeholder-icon.svg'; }} />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <Input
                        type="file"
                        accept="image/*"
                        className="text-xs"
                        onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const form = new FormData();
                          form.append("file", file);
                          try {
                            const res = await api.post("/uploads/upload-logo", form, {
                              headers: { "Content-Type": "multipart/form-data" }
                            });
                            setLogoUrl(res.data.displayUrl || res.data.url);
                          } catch (err) {
                            setError("Failed to upload logo");
                          }
                        }}
                      />
                      {logoUrl !== project?.logoUrl && (
                        <Button
                          variant="default"
                          size="sm"
                          type="button"
                          onClick={() => setLogoUrl(project?.logoUrl || "")}
                          className="h-9 px-3 text-xs"
                        >
                          Use Base Icon
                        </Button>
                      )}
                    </div>
                    <p className="text-[10px] text-gh-faint uppercase tracking-wider font-bold">Recommended: Transparent PNG 512x512</p>
                  </div>
                </div>
              </FieldGroup>
            </CardContent>
          </Card>

          {/* API & Services */}
          <Card>
            <CardHeader>
              <SectionHeader
                icon="🔌"
                title="API & Services"
                description="Connect this flavor to its backend, Firebase project, and AdMob account."
              />
            </CardHeader>
            <CardContent className="space-y-5">
              <FieldGroup
                label="API base URL"
                hint="The backend server URL this flavor's app will connect to."
              >
                <Input
                  value={apiBaseUrl}
                  onChange={(e) => setApiBaseUrl(e.target.value)}
                  placeholder="https://api.myclient.com"
                  type="url"
                />
              </FieldGroup>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <FieldGroup
                  label="Firebase project ID"
                  hint='Found in your Firebase console (e.g. "my-app-12345"). Leave blank if not using Firebase.'
                >
                  <Input
                    value={firebaseProjectId}
                    onChange={(e) => setFirebaseProjectId(e.target.value)}
                    placeholder="my-app-12345"
                    className="font-mono"
                  />
                </FieldGroup>
                <FieldGroup
                  label="AdMob app ID"
                  hint='Your AdMob app ID (e.g. "ca-app-pub-xxx~yyy"). Leave blank if not using ads.'
                >
                  <Input
                    value={admobAppId}
                    onChange={(e) => setAdmobAppId(e.target.value)}
                    placeholder="ca-app-pub-xxxxxxxx~yyyyyyyy"
                    className="font-mono"
                  />
                </FieldGroup>
              </div>
            </CardContent>
          </Card>

          {/* Signing Config (Read-only or guided) */}
          <Card>
            <CardHeader>
              <SectionHeader
                icon="🔐"
                title="Play Store Signing"
                description="Manage your Android signing credentials. These are unique to each flavor."
              />
            </CardHeader>
            <CardContent className="space-y-4">
              {flavor?.configJson?.signing?.keystoreUrl ? (
                <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-3">
                  <div className="flex items-center gap-2 text-sky-400">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                    <span className="text-sm font-semibold uppercase tracking-wider">Signing Active</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gh-muted font-bold">Keystore Alias</p>
                      <p className="text-sm font-mono text-gh-subtle mt-0.5">{flavor.configJson.signing.keyAlias}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-gh-muted font-bold">Keystore URL</p>
                      <p className="text-sm font-mono text-gh-subtle mt-0.5 truncate max-w-[200px]" title={flavor.configJson.signing.keystoreUrl}>
                        {flavor.configJson.signing.keystoreUrl.split('/').pop()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pt-2">
                    <a
                      href={flavor.configJson.signing.keystoreUrl}
                      download
                      className="text-xs font-medium text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1.5"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                      Download Keystore
                    </a>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 flex items-start gap-3">
                  <div className="text-amber-400 mt-0.5 text-lg">ℹ️</div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-amber-200/80">Signature pending</h4>
                    <p className="text-xs text-gh-muted mt-1 leading-relaxed">
                      A unique Play Store signing key will be automatically generated and linked to this flavor during its first build.
                      You only need to provide the passwords and alias below. Or, you can upload an existing keystore.
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4 pt-1">
                <input
                  type="file"
                  accept=".jks,.keystore"
                  className="hidden"
                  ref={keystoreInputRef}
                  onChange={async (e: ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingKeystore(true);
                    const form = new FormData();
                    form.append("file", file);
                    try {
                      const res = await api.post("/uploads/upload-keystore", form, {
                        headers: { "Content-Type": "multipart/form-data" }
                      });
                      const newSigning = { ...(flavor?.configJson?.signing || {}), keystoreUrl: res.data.url };
                      setFlavor(f => f ? { ...f, configJson: { ...f.configJson, signing: newSigning } } : null);
                    } catch (err) {
                      setError("Failed to upload keystore");
                    } finally {
                      setUploadingKeystore(false);
                      if (keystoreInputRef.current) keystoreInputRef.current.value = '';
                    }
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  type="button"
                  className="h-8 text-xs bg-gh-surface border-gh-border"
                  onClick={() => keystoreInputRef.current?.click()}
                  disabled={uploadingKeystore}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  {uploadingKeystore ? "Uploading..." : "Upload existing keystore (.jks, .keystore)"}
                </Button>
                {flavor?.configJson?.signing?.keystoreUrl && (
                  <span className="text-[10px] text-gh-faint italic">Passwords are stored securely and never shown in plain text.</span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <FieldGroup label="Alias">
                  <Input
                    placeholder="e.g. upload"
                    value={flavor?.configJson?.signing?.keyAlias || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const cfg = (flavor?.configJson || {}) as any;
                      const signing = { ...(cfg.signing || {}), keyAlias: e.target.value };
                      setFlavor((prev: Flavor | null) => prev ? { ...prev, configJson: { ...cfg, signing } } : prev);
                    }}
                  />
                </FieldGroup>
                <FieldGroup label="Keystore Password">
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={flavor?.configJson?.signing?.keystorePassword || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const cfg = (flavor?.configJson || {}) as any;
                      const signing = { ...(cfg.signing || {}), keystorePassword: e.target.value };
                      setFlavor((prev: Flavor | null) => prev ? { ...prev, configJson: { ...cfg, signing } } : prev);
                    }}
                  />
                </FieldGroup>
                <FieldGroup label="Key Password">
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={flavor?.configJson?.signing?.keyPassword || ""}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const cfg = (flavor?.configJson || {}) as any;
                      const signing = { ...(cfg.signing || {}), keyPassword: e.target.value };
                      setFlavor((prev: Flavor | null) => prev ? { ...prev, configJson: { ...cfg, signing } } : prev);
                    }}
                  />
                </FieldGroup>
              </div>
            </CardContent>
          </Card>

          {/* Advanced Configuration */}
          {project && (
            <AdvancedConfig
              projectId={project.id}
              flavorId={flavorId as string}
              overrides={overrides}
              setOverrides={setOverrides}
            />
          )}

          {/* Save */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/30">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-400 shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={saving} variant="gradient" size="lg">
              {saving ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Saving…
                </span>
              ) : (
                <>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17 21 17 13 7 13 7 21" />
                    <polyline points="7 3 7 8 15 8" />
                  </svg>
                  Save configuration
                </>
              )}
            </Button>
            {saveSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-400 animate-slide-up">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Saved successfully
              </span>
            )}
          </div>
        </form>

        {/* ── Build Section ── */}
        <Card className="border-android/20 bg-android/5">
          <CardHeader>
            <SectionHeader
              icon="🚀"
              title="Build Variant"
              description="Start the recompilation process using the Project Base Template and these flavor overrides."
            />
          </CardHeader>
          <CardContent>
            <form onSubmit={startBuild} className="space-y-6">
              <div className="p-4 rounded-xl bg-android/10 border border-android/20 flex items-center justify-between gap-4 shadow-inner">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-[#0d1117] flex items-center justify-center text-android">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" /></svg>
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-gh-default uppercase tracking-tight">Using Base Source</h4>
                    <p className="text-xs text-gh-muted line-clamp-1">{project?.name}.zip</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-gh-bg/50 p-1.5 rounded-lg border border-gh-border">
                  {(["APK", "AAB"] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBuildType(type as any)}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${buildType === type ? "bg-android text-[#0d1117] shadow-sm" : "hover:bg-gh-surface text-gh-subtle"}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>

              {buildError && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-xs font-medium animate-shake">
                  {buildError}
                </div>
              )}

              <Button
                type="submit"
                disabled={uploading || !project?.originalApkUrl || builds.some(b => b.status === "RUNNING" || b.status === "QUEUED")}
                className="w-full bg-android hover:bg-android-dim text-[#0d1117] h-12 rounded-xl font-bold text-base shadow-lg shadow-android/10 transition-all hover:scale-[1.01] active:scale-95 flex items-center justify-center gap-3"
              >
                {uploading ? (
                  <>
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    Building Flavor...
                  </>
                ) : builds.some(b => b.status === "RUNNING" || b.status === "QUEUED") ? (
                  <>
                    <svg className="animate-spin" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    Build in progress...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 16 12 12 8 16" /><line x1="12" y1="12" x2="12" y2="21" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" /><polyline points="16 16 12 12 8 16" /></svg>
                    Start Recompilation Build
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
        {/* ── Version History ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 text-gh-default">
            <div>
              <CardTitle className="text-lg">Configuration History</CardTitle>
              <CardDescription>Track changes to this flavor's branding and settings.</CardDescription>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={() => setShowingRollback(!showingRollback)}
            >
              {showingRollback ? "Close History" : "View Versions"}
            </Button>
          </CardHeader>
          {showingRollback && (
            <CardContent className="p-0 border-t border-gh-border">
              {versions.length === 0 ? (
                <div className="px-6 py-8 text-center text-gh-muted text-sm italic">No version history yet.</div>
              ) : (
                <div className="divide-y divide-gh-border/40">
                  {versions.map((v: any, i: number) => (
                    <div key={v.id} className="flex items-center justify-between px-6 py-4 hover:bg-gh-surface transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold border ${i === 0 ? "bg-android/15 text-android border-android/30" : "bg-gh-bg text-gh-faint border-gh-border"}`}>
                          v{versions.length - i}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gh-default">
                            {i === 0 ? "Live Configuration" : `Archived from ${new Date(v.createdAt).toLocaleDateString()}`}
                          </p>
                          <p className="text-[10px] text-gh-muted font-mono">{v.id}</p>
                        </div>
                      </div>
                      {i !== 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() => rollbackToVersion(v.id)}
                          className="text-gh-subtle hover:text-gh-default hover:bg-android/10 hover:text-android"
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          )}
        </Card>

        {/* ── Build History ── */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Builds</CardTitle>
            <CardDescription>Track the progress of your APK and AAB recompilations.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {builds.length === 0 ? (
              <div className="text-center py-12 text-gh-muted">
                <div className="text-3xl mb-3">🛠️</div>
                <p className="text-sm">No builds recorded for this flavor.</p>
              </div>
            ) : (
              <div className="divide-y divide-gh-border/40">
                {builds.map((b: Build) => (
                  <div key={b.id} className="flex items-center justify-between px-6 py-4 hover:bg-gh-surface transition-colors">
                    <div className="flex items-center gap-4">
                      <StatusBadge status={b.status} />
                      <div className="flex flex-col">
                        <span className="font-mono text-xs text-gh-muted">{b.id.slice(0, 8)}…</span>
                        {(b as any).flavorVersionId && (
                          <span className="text-[10px] text-android/60 uppercase tracking-tighter font-bold">
                            Config v{versions.length - versions.findIndex((v: any) => v.id === (b as any).flavorVersionId)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-gh-subtle">{new Date(b.createdAt).toLocaleString()}</span>
                      <Link
                        href={`/builds/${b.id}`}
                        className="text-xs font-bold text-android hover:text-android-dim transition-colors flex items-center gap-1"
                      >
                        View Details
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
