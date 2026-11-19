import { Calendar, MessageSquare, X } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { formatLastSeen } from '../../lib/utils/format';
import type { PublicProfile } from '../../types/chat';

interface UserProfileModalProps {
  profile: PublicProfile | null;
  onClose: () => void;
  onStartChat: (userId: string) => Promise<void>;
}

export function UserProfileModal({ profile, onClose, onStartChat }: UserProfileModalProps) {
  if (!profile) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl p-6"
      >
        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close profile"
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col items-center text-center">
          <Avatar
            src={profile.avatarUrl}
            name={profile.displayName}
            size="xl"
            status={profile.status}
          />
          <h3 className="mt-3 font-display text-lg font-semibold">{profile.displayName}</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            @{profile.username} ·{' '}
            {profile.status === 'online' ? 'Online now' : formatLastSeen(profile.lastSeenAt)}
          </p>

          {profile.bio && (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {profile.bio}
            </p>
          )}

          <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              Joined{' '}
              {new Date(profile.createdAt).toLocaleDateString([], {
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>

          <button
            type="button"
            onClick={async () => {
              await onStartChat(profile.id);
              onClose();
            }}
            className="mt-6 w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <MessageSquare className="h-4 w-4" />
            <span>Send message</span>
          </button>
        </div>
      </div>
    </div>
  );
}
