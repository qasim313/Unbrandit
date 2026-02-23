"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import Link from "next/link";

function AndroidRobot() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#3DDC84">
      <line x1="8.5" y1="2" x2="6" y2="5" stroke="#3DDC84" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="15.5" y1="2" x2="18" y2="5" stroke="#3DDC84" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="5" y="5" width="14" height="8" rx="4" />
      <circle cx="9" cy="9" r="1.2" fill="#0d1117" />
      <circle cx="15" cy="9" r="1.2" fill="#0d1117" />
      <rect x="3" y="14" width="18" height="8" rx="2" />
      <rect x="0.5" y="14" width="2" height="5.5" rx="1" />
      <rect x="21.5" y="14" width="2" height="5.5" rx="1" />
    </svg>
  );
}

function CheckEmailContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email") || "";
  const [resent, setResent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    setLoading(true);
    setError(null);
    try {
      await api.post("/auth/resend-verification", { email });
      setResent(true);
    } catch (err: any) {
      setError(err?.response?.data?.error || "Failed to resend. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gh-bg flex items-center justify-center px-4">
      <div className="w-full max-w-sm animate-fade-in">

        <div className="text-center mb-7">
          <Link href="/" className="inline-flex flex-col items-center gap-2">
            <AndroidRobot />
            <div>
              <div className="font-semibold text-gh-default">Unbrandit</div>
              <div className="text-xs text-gh-muted">APK WhiteLabel Studio</div>
            </div>
          </Link>
        </div>

        <div className="border border-gh-border rounded-xl bg-gh-surface overflow-hidden">
          <div className="px-6 py-4 border-b border-gh-border bg-gh-bg/50 text-center">
            <div className="flex items-center justify-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3DDC84" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              <h1 className="font-semibold text-gh-default">Check your inbox</h1>
            </div>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm text-gh-muted leading-relaxed">
              We sent a verification link to{" "}
              {email && <strong className="text-gh-default">{email}</strong>}.
              {" "}Click the link in the email to activate your account.
            </p>

            <div className="p-3 rounded-md bg-gh-elevated border border-gh-border text-xs text-gh-muted space-y-1">
              <p className="font-medium text-gh-subtle">Didn&apos;t receive it?</p>
              <ul className="space-y-0.5 list-disc list-inside text-gh-faint">
                <li>Check your spam or junk folder</li>
                <li>The link expires in 24 hours</li>
              </ul>
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-danger/10 border border-danger/30 animate-slide-down">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-xs text-danger">{error}</p>
              </div>
            )}

            {resent ? (
              <div className="flex items-center gap-2 p-3 rounded-md bg-success/10 border border-success/30">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <p className="text-xs text-success">Verification email resent successfully.</p>
              </div>
            ) : (
              <button
                onClick={handleResend}
                disabled={loading || !email}
                className="w-full h-9 rounded-md bg-gh-elevated border border-gh-border text-gh-default text-sm font-medium hover:bg-[#292e36] hover:border-[#8b949e]/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                    Resending…
                  </>
                ) : "Resend verification email"}
              </button>
            )}
          </div>

          <div className="px-6 py-3 border-t border-gh-border bg-gh-bg/50 text-center">
            <Link href="/login" className="text-xs text-info hover:underline">← Back to sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CheckEmailPage() {
  return (
    <Suspense>
      <CheckEmailContent />
    </Suspense>
  );
}
