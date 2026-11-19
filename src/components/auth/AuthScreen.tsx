import { useState, type FormEvent } from 'react';
import { ArrowRight, Lock, Mail, Moon, Sun, User } from 'lucide-react';
import {
  auth,
  googleAuthProvider,
  sendPasswordResetEmail,
  signInWithPopup,
} from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { LinkUpLogo } from '../ui/LinkUpLogo';
import type { SiteConfig, ThemePreference } from '../../types/chat';

interface AuthScreenProps {
  themePreference: ThemePreference;
  onChangeTheme: (pref: ThemePreference) => void;
  siteConfig?: SiteConfig | null;
}

type AuthMode = 'signin' | 'signup' | 'reset';

export function AuthScreen({ themePreference, onChangeTheme, siteConfig }: AuthScreenProps) {
  const siteName = siteConfig?.siteName || 'LinkUp';
  const tagline = siteConfig?.tagline || 'Stay connected. Chat together.';
  const allowSignups = siteConfig ? siteConfig.allowSignups : true;
  const { loginWithEmail, registerWithEmail } = useAuth();

  const [mode, setMode] = useState<AuthMode>('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    if (code === 'auth/popup-closed-by-user') return 'Sign-in window was closed before completing.';
    if (code === 'auth/popup-blocked') {
      return 'Popup was blocked by the browser. Please allow popups or sign in with Email & Password below.';
    }
    return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email address is required.');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'reset') {
        await sendPasswordResetEmail(auth, trimmedEmail);
        setNotice('Password reset instructions have been sent if your account uses Firebase email auth.');
      } else if (mode === 'signup') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setBusy(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setBusy(false);
          return;
        }
        await registerWithEmail(trimmedEmail, password, displayName.trim() || undefined);
      } else {
        await loginWithEmail(trimmedEmail, password);
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Minimal Header */}
      <header className="h-16 px-6 flex items-center justify-between">
        <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
          <LinkUpLogo size="sm" />
          <span className="font-display font-semibold text-lg tracking-tight">{siteName}</span>
        </div>

        <button
          type="button"
          onClick={() => onChangeTheme(themePreference === 'dark' ? 'light' : 'dark')}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          aria-label="Toggle color theme"
        >
          {themePreference === 'dark' ? (
            <>
              <Sun className="h-4 w-4" />
              <span>Light</span>
            </>
          ) : (
            <>
              <Moon className="h-4 w-4" />
              <span>Dark</span>
            </>
          )}
        </button>
      </header>

      {/* Focused Messenger-Style Sign In */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <section className="w-full max-w-[420px] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 sm:p-8 shadow-xs">
          <div className="flex flex-col items-center text-center mb-6">
            <LinkUpLogo size="lg" />
            <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
              {mode === 'signin' && `Sign in to ${siteName}`}
              {mode === 'signup' && `Create your ${siteName} account`}
              {mode === 'reset' && 'Reset your password'}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{tagline}</p>
          </div>

          {siteConfig?.maintenanceMode && (
            <div className="mb-4 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-800 dark:text-amber-300">
              {siteConfig.maintenanceMessage || 'Scheduled maintenance is active. Administrator sign-in only.'}
            </div>
          )}

          {/* Primary Google OAuth CTA */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleGoogleSignIn()}
            className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
          >
            <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27c3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10c5.35 0 9.25-3.67 9.25-9.09c0-1.15-.15-1.81-.15-1.81Z"
              />
            </svg>
            <span>Continue with Google</span>
          </button>

          <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
            <span>or use email</span>
            <div className="h-px flex-1 bg-slate-200 dark:bg-slate-800" />
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg mb-4">
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setError(null);
                setNotice(null);
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'signin'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Sign in
            </button>
            {allowSignups && (
              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError(null);
                  setNotice(null);
                }}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  mode === 'signup'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Register
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setMode('reset');
                setError(null);
                setNotice(null);
              }}
              className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'reset'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Reset
            </button>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {notice && (
            <div
              role="status"
              className="mb-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-3.5 py-2.5 text-xs text-emerald-700 dark:text-emerald-300"
            >
              {notice}
            </div>
          )}

          <form onSubmit={handleEmailSubmit} className="space-y-3">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display name
                </label>
                <div className="relative">
                  <User className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Your full name"
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Email address
              </label>
              <div className="relative">
                <Mail className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {mode !== 'reset' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Confirm password
                </label>
                <div className="relative">
                  <Lock className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full min-h-[42px] px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-60 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <span>
                {busy
                  ? 'Please wait...'
                  : mode === 'signin'
                  ? 'Sign in'
                  : mode === 'signup'
                  ? 'Create account'
                  : 'Send reset link'}
              </span>
              <ArrowRight className="h-4 w-4" />
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
