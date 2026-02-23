'use client';

import { FormEvent, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { useAuth } from '@/store/auth';

function AndroidRobot() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="#3DDC84">
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setToken } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', { email, password });
      setToken(res.data.token);
      const redirect = searchParams.get('redirect') || '/dashboard';
      router.push(redirect);
    } catch (err: any) {
      const code = err?.response?.data?.code;
      if (code === 'EMAIL_NOT_VERIFIED') {
        router.push(`/check-email?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(err?.response?.data?.error || 'Login failed. Please check your credentials.');
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
          <div className="px-6 py-4 border-b border-gh-border bg-gh-bg/50">
            <h1 className="font-semibold text-gh-default text-center">Sign in to Unbrandit</h1>
          </div>

          <form onSubmit={onSubmit} className="p-6 space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gh-subtle">Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                className="w-full h-10 px-3 rounded-md border border-gh-border bg-gh-bg text-sm text-gh-default placeholder-gh-muted focus:outline-none focus:border-android/50 focus:ring-1 focus:ring-android/20 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gh-subtle">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                className="w-full h-10 px-3 rounded-md border border-gh-border bg-gh-bg text-sm text-gh-default placeholder-gh-muted focus:outline-none focus:border-android/50 focus:ring-1 focus:ring-android/20 transition-colors"
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-md bg-danger/10 border border-danger/30 animate-slide-down">
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#f85149"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <p className="text-xs text-danger leading-relaxed">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 rounded-md bg-android hover:bg-android-dim text-[#0d1117] text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="px-6 py-3 border-t border-gh-border bg-gh-bg/50 text-center">
            <p className="text-xs text-gh-muted">
              New to Unbrandit?{' '}
              <Link href="/register" className="text-info hover:underline font-medium">
                Create an account
              </Link>
            </p>
          </div>
        </div>

        <p className="text-center mt-5 text-xs text-gh-muted">
          <Link href="/" className="hover:text-gh-subtle transition-colors">
            ← Back to home
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

