"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { useAuth } from "@/store/auth";
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

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useAuth();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("No verification token found in the link.");
      return;
    }

    api
      .get(`/auth/verify-email?token=${token}`)
      .then((res) => {
        setToken(res.data.token);
        setStatus("success");
        setTimeout(() => router.push("/dashboard"), 2000);
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err?.response?.data?.error || "Verification failed. The link may have expired.");
      });
  }, [token]);

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
          <div className="p-6 text-center space-y-4">

            {status === "loading" && (
              <>
                <div className="w-12 h-12 rounded-full bg-gh-elevated border border-gh-border flex items-center justify-center mx-auto">
                  <svg className="animate-spin text-android" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gh-default">Verifying your email…</p>
                  <p className="text-xs text-gh-muted mt-1">Please wait a moment.</p>
                </div>
              </>
            )}

            {status === "success" && (
              <>
                <div className="w-12 h-12 rounded-full bg-success/10 border border-success/20 flex items-center justify-center mx-auto">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3fb950" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gh-default">Email verified!</p>
                  <p className="text-xs text-gh-muted mt-1">Your account is active. Redirecting to dashboard…</p>
                </div>
              </>
            )}

            {status === "error" && (
              <>
                <div className="w-12 h-12 rounded-full bg-danger/10 border border-danger/20 flex items-center justify-center mx-auto">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f85149" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-gh-default">Verification failed</p>
                  <p className="text-xs text-gh-muted mt-1">{message}</p>
                </div>
                <div className="space-y-2 pt-2">
                  <Link
                    href="/check-email"
                    className="block w-full h-9 rounded-md bg-android hover:bg-android-dim text-[#0d1117] text-sm font-semibold transition-colors flex items-center justify-center"
                  >
                    Resend verification email
                  </Link>
                  <Link href="/login" className="block text-xs text-info hover:underline">
                    ← Back to sign in
                  </Link>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailContent />
    </Suspense>
  );
}
