import { useEffect, useState } from 'react';
import { MessageSquare, Search, UserCheck } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import { formatLastSeen } from '../../lib/utils/format';
import type { MyProfile, PublicProfile } from '../../types/chat';

interface DiscoverPanelProps {
  myProfile: MyProfile;
  onStartDirectChat: (targetUserId: string) => Promise<void>;
  onViewProfile: (profile: PublicProfile) => void;
}

export function DiscoverPanel({
  myProfile,
  onStartDirectChat,
  onViewProfile,
}: DiscoverPanelProps) {
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(() => {
      api
        .searchUsers(query)
        .then((res) => {
          if (active) setUsers(res.users);
        })
        .catch(() => {
          if (active) setUsers([]);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  const handleMessage = async (id: string) => {
    setBusyUserId(id);
    try {
      await onStartDirectChat(id);
    } finally {
      setBusyUserId(null);
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/70 dark:bg-slate-950 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Discover People</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Search registered LinkUp members by name or @username to start a conversation.
            </p>
          </div>
          <button
            type="button"
            disabled={busyUserId === myProfile.id}
            onClick={() => void handleMessage(myProfile.id)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
            <span>Open Personal Notes</span>
          </button>
        </div>

        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by display name or @username..."
            className="w-full h-11 pl-10 pr-4 text-sm rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 animate-pulse"
              />
            ))}
          </div>
        ) : users.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {query ? `No people found matching "${query}"` : 'No other members registered yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Share LinkUp with teammates or open another browser session with a second account to test live multi-user messaging.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {users.map((user) => (
              <div
                key={user.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center justify-between gap-3"
              >
                <button
                  type="button"
                  onClick={() => onViewProfile(user)}
                  className="min-w-0 flex items-center gap-3 text-left cursor-pointer"
                >
                  <Avatar
                    src={user.avatarUrl}
                    name={user.displayName}
                    size="lg"
                    status={user.status}
                  />
                  <div className="min-w-0">
                    <p className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                      {user.displayName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      @{user.username} ·{' '}
                      {user.status === 'online' ? 'Online' : formatLastSeen(user.lastSeenAt)}
                    </p>
                    {user.bio && (
                      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 line-clamp-1">
                        {user.bio}
                      </p>
                    )}
                  </div>
                </button>

                <button
                  type="button"
                  disabled={busyUserId === user.id}
                  onClick={() => void handleMessage(user.id)}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Message</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
