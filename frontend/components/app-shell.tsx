"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/store/auth";

function AndroidIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6.18 15.64a2.18 2.18 0 0 1-2.18-2.18V9.61a2.18 2.18 0 1 1 4.36 0v3.85a2.18 2.18 0 0 1-2.18 2.18zm11.64 0a2.18 2.18 0 0 1-2.18-2.18V9.61a2.18 2.18 0 1 1 4.36 0v3.85a2.18 2.18 0 0 1-2.18 2.18zM5.36 6.97l1.32-2.29A.31.31 0 0 0 6.14 4a.31.31 0 0 0-.43.11L4.37 6.48A7.27 7.27 0 0 0 1.5 12h21a7.27 7.27 0 0 0-2.87-5.52L18.29 4.11A.31.31 0 0 0 17.86 4a.31.31 0 0 0-.11.43l1.32 2.29A6.28 6.28 0 0 0 15 5.17H9a6.28 6.28 0 0 0-3.64 1.8zM9.5 9.5a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zm5 0a.75.75 0 1 1 0-1.5.75.75 0 0 1 0 1.5zM3.5 13.5C3.5 17.09 7.36 20 12 20s8.5-2.91 8.5-6.5H3.5z" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { setToken } = useAuth();

  function handleSignOut() {
    setToken(null);
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gh-bg">
      <header className="h-12 shrink-0 flex items-center justify-between px-4 sm:px-6 border-b border-gh-border bg-gh-surface">
        <nav className="flex items-center gap-6">
          <Link href="/dashboard" className="flex items-center gap-2 text-gh-default hover:text-android transition-colors">
            <span className="text-android">
              <AndroidIcon size={20} />
            </span>
            <span className="font-semibold text-sm">Unbrandit</span>
          </Link>
          <Link
            href="/builds"
            className="text-sm text-gh-muted hover:text-android transition-colors font-medium"
          >
            Builds
          </Link>
        </nav>
        <button
          onClick={handleSignOut}
          className="text-xs text-gh-faint hover:text-danger transition-colors font-medium"
        >
          Sign out
        </button>
      </header>
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
          {children}
        </div>
      </main>
    </div>
  );
}
