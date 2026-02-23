import Link from "next/link";

function AndroidIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="#3DDC84">
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gh-bg flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <div className="inline-flex flex-col items-center gap-4 mb-10">
          <AndroidIcon />
          <div>
            <h1 className="text-xl font-semibold text-gh-default">Unbrandit</h1>
            <p className="text-sm text-gh-muted mt-1">APK WhiteLabel Studio</p>
          </div>
        </div>

        <p className="text-sm text-gh-muted leading-relaxed mb-8">
          Rebrand Android apps at scale. Upload, configure, and ship white-label APKs and AABs.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href="/login"
            className="h-10 rounded-md bg-android hover:bg-android-dim text-[#0d1117] text-sm font-semibold transition-colors flex items-center justify-center"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="h-10 rounded-md border border-gh-border bg-gh-surface hover:bg-gh-elevated text-gh-default text-sm font-medium transition-colors flex items-center justify-center"
          >
            Create account
          </Link>
        </div>
      </div>
    </div>
  );
}
