import { Bell, CheckCheck } from 'lucide-react';
import { formatConversationTimestamp } from '../../lib/utils/format';
import type { AppNotification } from '../../types/chat';

interface NotificationsPanelProps {
  notifications: AppNotification[];
  loading: boolean;
  onMarkAllRead: () => Promise<void>;
  onOpenNotification: (notification: AppNotification) => Promise<void>;
}

export function NotificationsPanel({
  notifications,
  loading,
  onMarkAllRead,
  onOpenNotification,
}: NotificationsPanelProps) {
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/70 dark:bg-slate-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Notifications</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {unreadCount > 0 ? `${unreadCount} unread updates` : 'You are all caught up'}
            </p>
          </div>

          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void onMarkAllRead()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
            >
              <CheckCheck className="h-4 w-4" />
              <span>Mark all read</span>
            </button>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-12 text-center">
              <Bell className="h-8 w-8 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                No notifications yet
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                New messages and group invitations will appear here.
              </p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void onOpenNotification(n)}
                className={`w-full px-5 py-4 text-left flex items-start justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer ${
                  !n.isRead ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {!n.isRead && (
                      <span className="h-2 w-2 rounded-full bg-indigo-600 shrink-0" />
                    )}
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {n.title}
                    </p>
                  </div>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                    {n.body}
                  </p>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                  {formatConversationTimestamp(n.createdAt)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
