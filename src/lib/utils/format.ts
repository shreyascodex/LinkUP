export function formatMessageTime(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatConversationTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffDays === 0 && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays <= 1 && now.getDate() - date.getDate() === 1) {
    return 'Yesterday';
  }
  if (diffDays < 7) {
    return date.toLocaleDateString([], { weekday: 'short' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatDayDivider(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const todayStr = now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === todayStr) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatLastSeen(iso: string | null): string {
  if (!iso) return 'Offline';
  const date = new Date(iso);
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return 'Last seen just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `Last seen ${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `Last seen ${diffHours}h ago`;
  return `Last seen ${date.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'LU';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

const AVATAR_TONES = [
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300',
  'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300',
  'bg-sky-100 text-sky-700 dark:bg-sky-950/80 dark:text-sky-300',
];

export function getAvatarTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

export function extractFirstUrl(text: string): string | null {
  const match = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
  return match ? match[0] : null;
}
