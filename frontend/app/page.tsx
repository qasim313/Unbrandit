"use client";

import Link from "next/link";

export default function HomePage() {
  return (
    <div className="flex flex-1 items-center justify-center min-h-[80vh] px-4">
      <div className="max-w-lg w-full space-y-8 text-center animate-fade-in">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-sky-600 items-center justify-center text-white text-2xl font-bold shadow-glow">
          A
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-100">
            APK WhiteLabel Studio
          </h1>
          <p className="text-slate-400 mt-2">
            Secure, scalable white-label Android builds with automated branding.
          </p>
        </div>
        <div className="flex justify-center gap-3 flex-wrap">
          <Link
            href="/login"
            className="px-5 py-2.5 rounded-lg bg-sky-500 hover:bg-sky-600 text-white text-sm font-medium transition-all hover:shadow-glow"
          >
            Log in
          </Link>
          <Link
            href="/register"
            className="px-5 py-2.5 rounded-lg border border-slate-600 hover:bg-slate-800/80 text-slate-200 text-sm font-medium transition-colors"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
}

