import { useEffect, useState } from 'react';
import { Download, FileText, Image as ImageIcon, Maximize2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { formatFileSize } from '../../lib/utils/format';
import type { MessageAttachment } from '../../types/chat';

export function SecureAttachment({
  attachment,
  isOwn,
}: {
  attachment: MessageAttachment;
  isOwn: boolean;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!attachment.isImage) return;
    let active = true;
    let createdUrl: string | null = null;

    api
      .fetchAuthorizedBlobUrl(attachment.url)
      .then((url) => {
        if (!active) {
          URL.revokeObjectURL(url);
          return;
        }
        createdUrl = url;
        setBlobUrl(url);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment.isImage, attachment.url]);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      await api.downloadAttachment(attachment.url, attachment.fileName);
    } finally {
      setDownloading(false);
    }
  };

  if (attachment.isImage) {
    return (
      <>
        <div className="mt-1.5 rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/80 bg-slate-100 dark:bg-slate-800 max-w-xs">
          {blobUrl && !failed ? (
            <div className="relative group">
              <img
                src={blobUrl}
                alt={attachment.fileName}
                className="max-h-64 w-full object-cover cursor-pointer"
                onClick={() => setLightboxOpen(true)}
              />
              <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="p-1.5 rounded-lg bg-slate-900/75 text-white hover:bg-slate-900"
                  title="Expand image"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="p-1.5 rounded-lg bg-slate-900/75 text-white hover:bg-slate-900"
                  title="Download image"
                >
                  <Download className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="h-36 w-56 flex flex-col items-center justify-center gap-1.5 text-xs text-slate-500">
              <ImageIcon className="h-5 w-5" />
              <span>{failed ? 'Preview unavailable' : 'Loading image...'}</span>
            </div>
          )}
        </div>

        {lightboxOpen && blobUrl && (
          <div
            className="fixed inset-0 z-50 bg-slate-950/85 flex flex-col items-center justify-center p-4"
            onClick={() => setLightboxOpen(false)}
          >
            <div className="w-full max-w-4xl flex items-center justify-between text-white mb-3">
              <span className="text-sm font-medium truncate">{attachment.fileName}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void handleDownload();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-medium flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Download</span>
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxOpen(false)}
                  className="p-2 rounded-lg bg-white/15 hover:bg-white/25"
                  aria-label="Close preview"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <img
              src={blobUrl}
              alt={attachment.fileName}
              onClick={(e) => e.stopPropagation()}
              className="max-h-[82vh] max-w-full rounded-xl object-contain"
            />
          </div>
        )}
      </>
    );
  }

  return (
    <div
      className={`mt-1.5 flex items-center gap-3 px-3 py-2.5 rounded-xl border max-w-xs ${
        isOwn
          ? 'bg-indigo-700/40 border-indigo-400/40 text-white'
          : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100'
      }`}
    >
      <div
        className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
          isOwn ? 'bg-white/15 text-white' : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
        }`}
      >
        <FileText className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium truncate">{attachment.fileName}</p>
        <p className={`text-[11px] tabular-nums ${isOwn ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>
          {formatFileSize(attachment.fileSize)}
        </p>
      </div>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className={`p-2 rounded-lg transition-colors shrink-0 ${
          isOwn
            ? 'hover:bg-white/15 text-white'
            : 'hover:bg-slate-200/70 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
        }`}
        title="Download file"
        aria-label={`Download ${attachment.fileName}`}
      >
        <Download className="h-4 w-4" />
      </button>
    </div>
  );
}
