import { useState } from 'react';
import {
  Archive,
  BellOff,
  CheckCheck,
  LogOut,
  Pencil,
  Pin,
  Shield,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import { formatFileSize, formatLastSeen } from '../../lib/utils/format';
import type { ChatMessage, ConversationSummary, PublicProfile } from '../../types/chat';

interface ConversationDetailsDrawerProps {
  conversation: ConversationSummary;
  messages: ChatMessage[];
  currentUserId: string;
  onClose: () => void;
  onConversationUpdated: (conv: ConversationSummary) => void;
  onLeftGroup: (conversationId: string) => void;
  onOpenUserProfile: (profile: PublicProfile) => void;
}

export function ConversationDetailsDrawer({
  conversation,
  messages,
  currentUserId,
  onClose,
  onConversationUpdated,
  onLeftGroup,
  onOpenUserProfile,
}: ConversationDetailsDrawerProps) {
  const isGroup = conversation.type === 'group';
  const isAdmin = conversation.myMembership.role === 'admin';

  const [editingInfo, setEditingInfo] = useState(false);
  const [groupName, setGroupName] = useState(conversation.name || '');
  const [groupDesc, setGroupDesc] = useState(conversation.description || '');
  const [savingInfo, setSavingInfo] = useState(false);

  const [addMemberOpen, setAddMemberOpen] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [candidateUsers, setCandidateUsers] = useState<PublicProfile[]>([]);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sharedAttachments = messages.flatMap((m) => m.attachments);

  const handleSaveGroupInfo = async () => {
    if (!groupName.trim()) return;
    setSavingInfo(true);
    setError(null);
    try {
      const res = await api.updateGroupConversation(conversation.id, {
        name: groupName.trim(),
        description: groupDesc.trim(),
      });
      onConversationUpdated(res.conversation);
      setEditingInfo(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update group');
    } finally {
      setSavingInfo(false);
    }
  };

  const handleSearchCandidates = async (q: string) => {
    setUserQuery(q);
    try {
      const res = await api.searchUsers(q);
      const existingIds = new Set(conversation.members.map((m) => m.userId));
      setCandidateUsers(res.users.filter((u) => !existingIds.has(u.id)));
    } catch {
      setCandidateUsers([]);
    }
  };

  const handleAddMember = async (userId: string) => {
    setBusyAction(true);
    setError(null);
    try {
      const res = await api.addGroupMembers(conversation.id, [userId]);
      onConversationUpdated(res.conversation);
      setCandidateUsers((prev) => prev.filter((u) => u.id !== userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setBusyAction(false);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: 'admin' | 'member') => {
    setBusyAction(true);
    setError(null);
    try {
      const res = await api.updateMemberRole(
        conversation.id,
        userId,
        currentRole === 'admin' ? 'member' : 'admin'
      );
      onConversationUpdated(res.conversation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update role');
    } finally {
      setBusyAction(false);
    }
  };

  const handleRemoveOrLeave = async (userId: string) => {
    setBusyAction(true);
    setError(null);
    try {
      const res = await api.removeGroupMember(conversation.id, userId);
      if (res.left) {
        onLeftGroup(conversation.id);
      } else {
        const listRes = await api.listConversations();
        const updated = listRes.conversations.find((c) => c.id === conversation.id);
        if (updated) onConversationUpdated(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusyAction(false);
    }
  };

  const handlePreference = async (
    patch: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean }
  ) => {
    const res = await api.updatePreferences(conversation.id, patch);
    onConversationUpdated(res.conversation);
  };

  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-80 lg:static lg:z-auto border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full shadow-xl lg:shadow-none">
      <div className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm">
          {isGroup ? 'Group Details' : 'Conversation Info'}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {error && (
          <div className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Header Summary */}
        <div className="flex flex-col items-center text-center">
          <Avatar
            src={isGroup ? conversation.avatarUrl : conversation.peer?.avatarUrl}
            name={isGroup ? conversation.name || 'Group' : conversation.peer?.displayName || 'Chat'}
            size="xl"
            isGroup={isGroup}
            status={!isGroup ? conversation.peer?.status : undefined}
          />
          {!editingInfo ? (
            <>
              <h4 className="mt-3 font-display font-semibold text-base">
                {isGroup
                  ? conversation.name || 'Group Chat'
                  : conversation.peer?.id === currentUserId
                  ? 'Personal Notes'
                  : conversation.peer?.displayName}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isGroup
                  ? `${conversation.members.length} members`
                  : `@${conversation.peer?.username || 'user'} · ${
                      conversation.peer?.status === 'online'
                        ? 'Online'
                        : formatLastSeen(conversation.peer?.lastSeenAt ?? null)
                    }`}
              </p>
              {(isGroup ? conversation.description : conversation.peer?.bio) && (
                <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {isGroup ? conversation.description : conversation.peer?.bio}
                </p>
              )}
              {isGroup && isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setGroupName(conversation.name || '');
                    setGroupDesc(conversation.description || '');
                    setEditingInfo(true);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Edit group info</span>
                </button>
              )}
            </>
          ) : (
            <div className="w-full mt-3 space-y-2.5 text-left">
              <input
                type="text"
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                placeholder="Group name"
                className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
              />
              <textarea
                rows={2}
                value={groupDesc}
                onChange={(e) => setGroupDesc(e.target.value)}
                placeholder="Group description"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 resize-none"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={savingInfo}
                  onClick={handleSaveGroupInfo}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingInfo(false)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handlePreference({ isPinned: !conversation.myMembership.isPinned })}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Pin className="h-3.5 w-3.5" />
            <span>{conversation.myMembership.isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handlePreference({ isMuted: !conversation.myMembership.isMuted })}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <BellOff className="h-3.5 w-3.5" />
            <span>{conversation.myMembership.isMuted ? 'Unmute' : 'Mute'}</span>
          </button>
          <button
            type="button"
            onClick={() =>
              void handlePreference({ isArchived: !conversation.myMembership.isArchived })
            }
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <Archive className="h-3.5 w-3.5" />
            <span>{conversation.myMembership.isArchived ? 'Unarchive' : 'Archive'}</span>
          </button>
          <button
            type="button"
            onClick={async () => {
              await api.markConversationRead(conversation.id);
              const list = await api.listConversations();
              const updated = list.conversations.find((c) => c.id === conversation.id);
              if (updated) onConversationUpdated(updated);
            }}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            <span>Mark read</span>
          </button>
        </div>

        {/* Group Members */}
        {isGroup && (
          <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Members ({conversation.members.length})
              </h4>
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    const next = !addMemberOpen;
                    setAddMemberOpen(next);
                    if (next) void handleSearchCandidates('');
                  }}
                  className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              )}
            </div>

            {addMemberOpen && isAdmin && (
              <div className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 space-y-2">
                <input
                  type="text"
                  value={userQuery}
                  onChange={(e) => void handleSearchCandidates(e.target.value)}
                  placeholder="Search people to add..."
                  className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                />
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {candidateUsers.length === 0 ? (
                    <p className="text-[11px] text-slate-400 py-1">No matching users found</p>
                  ) : (
                    candidateUsers.map((u) => (
                      <div key={u.id} className="flex items-center justify-between gap-2 py-1">
                        <div className="min-w-0 flex items-center gap-2">
                          <Avatar src={u.avatarUrl} name={u.displayName} size="xs" />
                          <span className="text-xs truncate">{u.displayName}</span>
                        </div>
                        <button
                          type="button"
                          disabled={busyAction}
                          onClick={() => void handleAddMember(u.id)}
                          className="px-2 py-1 rounded-md bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-700"
                        >
                          Add
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2">
              {conversation.members.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenUserProfile(m.profile)}
                    className="min-w-0 flex items-center gap-2.5 text-left cursor-pointer"
                  >
                    <Avatar
                      src={m.profile.avatarUrl}
                      name={m.profile.displayName}
                      size="sm"
                      status={m.profile.status}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                        {m.profile.displayName}
                        {m.userId === currentUserId ? ' (You)' : ''}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        @{m.profile.username} · {m.role === 'admin' ? 'Admin' : 'Member'}
                      </p>
                    </div>
                  </button>

                  {isAdmin && m.userId !== currentUserId && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void handleToggleRole(m.userId, m.role)}
                        title={m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Shield className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => void handleRemoveOrLeave(m.userId)}
                        title="Remove from group"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled={busyAction}
              onClick={() => void handleRemoveOrLeave(currentUserId)}
              className="w-full py-2 px-3 rounded-xl border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Leave group</span>
            </button>
          </div>
        )}

        {/* Shared Files */}
        <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Shared Attachments ({sharedAttachments.length})
          </h4>
          {sharedAttachments.length === 0 ? (
            <p className="text-xs text-slate-400">No files shared in this conversation yet.</p>
          ) : (
            <div className="space-y-1.5">
              {sharedAttachments.slice(-8).reverse().map((att) => (
                <button
                  key={att.id}
                  type="button"
                  onClick={() => void api.downloadAttachment(att.url, att.fileName)}
                  className="w-full flex items-center justify-between gap-2 p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-left text-xs cursor-pointer"
                >
                  <span className="truncate font-medium">{att.fileName}</span>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {formatFileSize(att.fileSize)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
