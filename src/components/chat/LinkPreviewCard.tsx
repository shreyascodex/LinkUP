import { useEffect, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { api } from '../../lib/api';
import type { LinkPreviewData } from '../../types/chat';

const previewCache = new Map<string, LinkPreviewData | null>();

export function LinkPreviewCard({ url, isOwn }: { url: string; isOwn: boolean }) {
  const [preview, setPreview] = useState<LinkPreviewData | null>(() =>
    previewCache.has(url) ? previewCache.get(url) ?? null : null
  );

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) ?? null);
      return;
    }
    let active = true;
    api
      .getLinkPreview(url)
      .then((res) => {
        previewCache.set(url, res.preview);
        if (active) setPreview(res.preview);
      })
      .catch(() => {
        previewCache.set(url, null);
      });
    return () => {
      active = false;
    };
  }, [url]);

  if (!preview || (!preview.title && !preview.description)) return null;

  return (
    <a
      href={preview.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-2 block rounded-xl border p-2.5 text-left transition-colors ${
        isOwn
          ? 'bg-indigo-700/35 border-indigo-400/35 hover:bg-indigo-700/50 text-white'
          : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100'
      }`}
    >
      <div className="flex items-center justify-between gap-2 text-[11px] opacity-80">
        <span className="truncate font-medium">{preview.siteName || new URL(preview.url).hostname}</span>
        <ExternalLink className="h-3 w-3 shrink-0" />
      </div>
      {preview.title && <p className="mt-0.5 text-xs font-semibold line-clamp-1">{preview.title}</p>}
      {preview.description && (
        <p className="mt-0.5 text-[11px] opacity-80 line-clamp-2">{preview.description}</p>
      )}
    </a>
  );
}
