import { ArrowLeft } from 'lucide-react';
import { LinkUpLogo } from './LinkUpLogo';

export function NotFoundScreen() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="flex justify-center">
          <LinkUpLogo size="md" />
        </div>
        <p className="font-mono text-xs font-semibold uppercase tracking-widest text-slate-400">
          Error 404
        </p>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Page not found</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          The page you requested does not exist or is not available for your account.
        </p>
        <div className="pt-2">
          <a
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to LinkUp</span>
          </a>
        </div>
      </div>
    </div>
  );
}
