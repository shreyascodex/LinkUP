import { useEffect, useState, type FormEvent } from 'react';
import { Check, Search, Users, X } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import type { PublicProfile } from '../../types/chat';

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreateGroup: (payload: {
    name: string;
    description: string;
    memberIds: string[];
  }) => Promise<void>;
}

export function CreateGroupModal({ open, onClose, onCreateGroup }: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<PublicProfile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api
      .searchUsers(query)
      .then((res) => setUsers(res.users))
      .catch(() => setUsers([]));
  }, [open, query]);

  if (!open) return null;

  const toggleUser = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Group name is required.');
      return;
    }
    if (selectedIds.length === 0) {
      setError('Select at least one member to create a group.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onCreateGroup({
        name: name.trim(),
        description: description.trim(),
        memberIds: selectedIds,
      });
      setName('');
      setDescription('');
      setSelectedIds([]);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create group');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 flex items-center justify-center p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="font-display font-semibold text-base">Create Group Chat</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Group name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Product Design Sync"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Topic or team purpose"
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Add members ({selectedIds.length} selected)
              </label>
            </div>
            <div className="relative mb-2">
              <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search users..."
                className="w-full h-9 pl-8 pr-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {users.length === 0 ? (
                <p className="p-4 text-xs text-slate-400 text-center">
                  No other registered users found yet.
                </p>
              ) : (
                users.map((u) => {
                  const selected = selectedIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleUser(u.id)}
                      className={`w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-indigo-50 dark:bg-indigo-950/40'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={u.avatarUrl} name={u.displayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-xs font-medium truncate">{u.displayName}</p>
                          <p className="text-[11px] text-slate-500 truncate">@{u.username}</p>
                        </div>
                      </div>
                      <span
                        className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                          selected
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : 'border-slate-300 dark:border-slate-600'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
            >
              {busy ? 'Creating...' : 'Create group'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
