import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, Wrench, X } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useTheme } from './hooks/useTheme';
import { useRealtime } from './hooks/useRealtime';
import { api } from './lib/api';
import { AuthScreen } from './components/auth/AuthScreen';
import { LinkUpLogo } from './components/ui/LinkUpLogo';
import { NavSidebar, type MainTab } from './components/layout/NavSidebar';
import { ConversationListPanel } from './components/chat/ConversationListPanel';
import { ChatPanel } from './components/chat/ChatPanel';
import { ConversationDetailsDrawer } from './components/chat/ConversationDetailsDrawer';
import { CreateGroupModal } from './components/chat/CreateGroupModal';
import { DiscoverPanel } from './components/profile/DiscoverPanel';
import { UserProfileModal } from './components/profile/UserProfileModal';
import { NotificationsPanel } from './components/notifications/NotificationsPanel';
import { AdminConsoleApp } from './components/admin/AdminConsoleApp';
import { NotFoundScreen } from './components/ui/NotFoundScreen';
import { SettingsPanel } from './components/settings/SettingsPanel';
import type {
  AppNotification,
  ChatMessage,
  ConversationSummary,
  MessageAttachment,
  PublicProfile,
  RealtimeEvent,
  SiteConfig,
  ThemePreference,
} from './types/chat';

class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-3">
            <h1 className="font-display text-lg font-semibold">Something went wrong</h1>
            <p className="text-xs text-slate-600 dark:text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
            >
              Reload LinkUp
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function LinkUpWorkspace() {
  const { firebaseUser, profile, settings, loading, error, refreshProfile, setProfile, setSettings, logout } =
    useAuth();
  const { preference, setPreference } = useTheme(settings?.theme);

  const [activeTab, setActiveTab] = useState<MainTab>('messages');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [mobileShowChat, setMobileShowChat] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  const [messagesByConv, setMessagesByConv] = useState<Record<string, ChatMessage[]>>({});
  const [hasMoreByConv, setHasMoreByConv] = useState<Record<string, boolean>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [typingByConv, setTypingByConv] = useState<
    Record<string, Record<string, { displayName: string; expiresAt: number }>>
  >({});

  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(true);

  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [messageSearchResults, setMessageSearchResults] = useState<ChatMessage[]>([]);
  const [searchingMessages, setSearchingMessages] = useState(false);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [viewedProfile, setViewedProfile] = useState<PublicProfile | null>(null);
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [announcementDismissed, setAnnouncementDismissed] = useState(false);

  const activeConvIdRef = useRef<string | null>(null);
  activeConvIdRef.current = activeConversationId;
  const profileIdRef = useRef<string | null>(null);
  profileIdRef.current = profile?.id ?? null;

  useEffect(() => {
    api
      .getSiteConfig()
      .then((res) => setSiteConfig(res.config))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (siteConfig?.siteName) {
      document.title = siteConfig.siteName;
    }
  }, [siteConfig?.siteName]);

  useEffect(() => {
    setAnnouncementDismissed(false);
  }, [siteConfig?.announcementText, siteConfig?.announcementTone]);

  const refreshConversations = useCallback(async () => {
    try {
      const res = await api.listConversations();
      setConversations(res.conversations);
    } catch (err) {
      console.error('Failed to load conversations:', err);
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const refreshNotifications = useCallback(async () => {
    try {
      const res = await api.listNotifications();
      setNotifications(res.notifications);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoadingNotifications(false);
    }
  }, []);

  const loadConversationMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const res = await api.getMessages(conversationId, { limit: 40 });
      setMessagesByConv((prev) => ({ ...prev, [conversationId]: res.messages }));
      setHasMoreByConv((prev) => ({ ...prev, [conversationId]: res.hasMore }));
    } catch (err) {
      console.error('Failed to load messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!profile) return;
    setLoadingConversations(true);
    setLoadingNotifications(true);
    void refreshConversations();
    void refreshNotifications();
  }, [profile?.id, refreshConversations, refreshNotifications]);

  // Prune expired typing indicators every second
  useEffect(() => {
    const interval = window.setInterval(() => {
      const now = Date.now();
      setTypingByConv((prev) => {
        let changed = false;
        const next: typeof prev = {};
        for (const [cid, users] of Object.entries(prev)) {
          const kept: Record<string, { displayName: string; expiresAt: number }> = {};
          for (const [uid, meta] of Object.entries(users)) {
            if (meta.expiresAt > now) {
              kept[uid] = meta;
            } else {
              changed = true;
            }
          }
          if (Object.keys(kept).length > 0) {
            next[cid] = kept;
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Debounced global message search
  useEffect(() => {
    const q = messageSearchQuery.trim();
    if (!profile || q.length < 2) {
      setMessageSearchResults([]);
      setSearchingMessages(false);
      return;
    }
    setSearchingMessages(true);
    const timer = window.setTimeout(() => {
      api
        .searchMessages(q)
        .then((res) => setMessageSearchResults(res.messages))
        .catch(() => setMessageSearchResults([]))
        .finally(() => setSearchingMessages(false));
    }, 280);
    return () => clearTimeout(timer);
  }, [messageSearchQuery, profile]);

  const handleRealtimeEvent = useCallback(
    (event: RealtimeEvent) => {
      const myId = profileIdRef.current;
      if (!myId) return;

      if (event.type === 'message:created') {
        const msg = event.message;
        setMessagesByConv((prev) => {
          const existingList = prev[msg.conversationId] || [];
          // Idempotent deduplication by ID or optimistic clientMessageId
          const alreadyExists = existingList.some((m) => m.id === msg.id);
          if (alreadyExists) return prev;

          if (msg.clientMessageId) {
            const optIdx = existingList.findIndex(
              (m) => m.clientMessageId === msg.clientMessageId
            );
            if (optIdx !== -1) {
              const updated = [...existingList];
              updated[optIdx] = msg;
              return { ...prev, [msg.conversationId]: updated };
            }
          }

          const merged = [...existingList, msg].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
          return { ...prev, [msg.conversationId]: merged };
        });

        // Update conversation summary preview & unread count
        const isViewing = activeConvIdRef.current === msg.conversationId;
        setConversations((prev) => {
          const idx = prev.findIndex((c) => c.id === msg.conversationId);
          if (idx === -1) {
            void refreshConversations();
            return prev;
          }
          const target = prev[idx];
          const updated: ConversationSummary = {
            ...target,
            lastMessageAt: msg.createdAt,
            unreadCount:
              isViewing || msg.senderId === myId ? target.unreadCount : target.unreadCount + 1,
            lastMessage: {
              id: msg.id,
              senderId: msg.senderId,
              senderName: msg.sender.displayName,
              content: msg.content,
              messageType: msg.messageType,
              deletedAt: msg.deletedAt,
              createdAt: msg.createdAt,
            },
          };
          const copy = [...prev];
          copy[idx] = updated;
          copy.sort((a, b) => {
            if (a.myMembership.isPinned !== b.myMembership.isPinned) {
              return a.myMembership.isPinned ? -1 : 1;
            }
            return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
          });
          return copy;
        });

        // If user is currently viewing this conversation and message is from peer, mark read
        if (isViewing && msg.senderId !== myId) {
          void api.markConversationRead(msg.conversationId);
        }
      } else if (event.type === 'message:updated') {
        const msg = event.message;
        setMessagesByConv((prev) => {
          const list = prev[msg.conversationId];
          if (!list) return prev;
          return {
            ...prev,
            [msg.conversationId]: list.map((m) => (m.id === msg.id ? msg : m)),
          };
        });
      } else if (event.type === 'message:deleted') {
        setMessagesByConv((prev) => {
          const list = prev[event.conversationId];
          if (!list) return prev;
          return {
            ...prev,
            [event.conversationId]: list.map((m) =>
              m.id === event.messageId
                ? { ...m, deletedAt: event.deletedAt, content: '', attachments: [] }
                : m
            ),
          };
        });
        void refreshConversations();
      } else if (event.type === 'message:read') {
        const idSet = new Set(event.messageIds);
        setMessagesByConv((prev) => {
          const list = prev[event.conversationId];
          if (!list) return prev;
          return {
            ...prev,
            [event.conversationId]: list.map((m) => {
              if (!idSet.has(m.id)) return m;
              if (m.reads.some((r) => r.userId === event.userId)) return m;
              return {
                ...m,
                reads: [...m.reads, { userId: event.userId, readAt: event.readAt }],
              };
            }),
          };
        });
      } else if (event.type === 'typing:update') {
        setTypingByConv((prev) => {
          const convMap = { ...(prev[event.conversationId] || {}) };
          if (event.isTyping) {
            convMap[event.userId] = {
              displayName: event.displayName,
              expiresAt: Date.now() + 3500,
            };
          } else {
            delete convMap[event.userId];
          }
          return { ...prev, [event.conversationId]: convMap };
        });
      } else if (event.type === 'presence:update') {
        setConversations((prev) =>
          prev.map((conv) => ({
            ...conv,
            peer:
              conv.peer && conv.peer.id === event.userId
                ? {
                    ...conv.peer,
                    status: event.status,
                    lastSeenAt: event.lastSeenAt || conv.peer.lastSeenAt,
                  }
                : conv.peer,
            members: conv.members.map((m) =>
              m.userId === event.userId
                ? {
                    ...m,
                    profile: {
                      ...m.profile,
                      status: event.status,
                      lastSeenAt: event.lastSeenAt || m.profile.lastSeenAt,
                    },
                  }
                : m
            ),
          }))
        );
      } else if (event.type === 'conversation:updated') {
        void refreshConversations();
      } else if (event.type === 'notification:created') {
        setNotifications((prev) => [event.notification, ...prev]);
        if (
          settings?.browserNotifications &&
          'Notification' in window &&
          Notification.permission === 'granted' &&
          document.hidden
        ) {
          new Notification(event.notification.title, {
            body: event.notification.body,
          });
        }
      } else if (event.type === 'site:config') {
        setSiteConfig(event.config);
      }
    },
    [refreshConversations, settings?.browserNotifications]
  );

  const { connected, sendTyping } = useRealtime(Boolean(profile), handleRealtimeEvent);

  // Sync missed state on reconnect
  const prevConnectedRef = useRef(false);
  useEffect(() => {
    if (connected && !prevConnectedRef.current && profile) {
      void refreshConversations();
      if (activeConvIdRef.current) {
        void loadConversationMessages(activeConvIdRef.current);
      }
    }
    prevConnectedRef.current = connected;
  }, [connected, profile, refreshConversations, loadConversationMessages]);

  const handleSelectConversation = useCallback(
    async (conversationId: string) => {
      setActiveConversationId(conversationId);
      setActiveTab('messages');
      setMobileShowChat(true);
      setHighlightedMessageId(null);

      if (!messagesByConv[conversationId]) {
        await loadConversationMessages(conversationId);
      }

      setConversations((prev) =>
        prev.map((c) => (c.id === conversationId ? { ...c, unreadCount: 0 } : c))
      );
      void api.markConversationRead(conversationId);
    },
    [loadConversationMessages, messagesByConv]
  );

  const handleStartDirectChat = useCallback(
    async (targetUserId: string) => {
      const res = await api.createDirectConversation(targetUserId);
      setConversations((prev) => {
        const exists = prev.some((c) => c.id === res.conversation.id);
        return exists
          ? prev.map((c) => (c.id === res.conversation.id ? res.conversation : c))
          : [res.conversation, ...prev];
      });
      await handleSelectConversation(res.conversation.id);
    },
    [handleSelectConversation]
  );

  const handleCreateGroup = async (payload: {
    name: string;
    description: string;
    memberIds: string[];
  }) => {
    const res = await api.createGroupConversation(payload);
    setConversations((prev) => [res.conversation, ...prev]);
    await handleSelectConversation(res.conversation.id);
  };

  const handleSendMessage = async (payload: {
    content: string;
    replyToId?: string | null;
    attachments: MessageAttachment[];
  }) => {
    if (!activeConversationId || !profile) return;
    const clientMessageId = crypto.randomUUID();
    const nowIso = new Date().toISOString();
    const existingList = messagesByConv[activeConversationId] || [];
    const replyTarget = payload.replyToId
      ? existingList.find((m) => m.id === payload.replyToId)
      : undefined;

    const optimistic: ChatMessage = {
      id: `opt-${clientMessageId}`,
      clientMessageId,
      conversationId: activeConversationId,
      senderId: profile.id,
      sender: {
        id: profile.id,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
      },
      replyToId: payload.replyToId ?? null,
      replyTo: replyTarget
        ? {
            id: replyTarget.id,
            senderId: replyTarget.senderId,
            senderName: replyTarget.sender.displayName,
            content: replyTarget.content,
            deletedAt: replyTarget.deletedAt,
          }
        : null,
      content: payload.content,
      messageType: payload.attachments.length > 0 ? 'file' : 'text',
      isEdited: false,
      deletedAt: null,
      attachments: payload.attachments,
      reads: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      pending: true,
    };

    setMessagesByConv((prev) => ({
      ...prev,
      [activeConversationId]: [...(prev[activeConversationId] || []), optimistic],
    }));

    try {
      const res = await api.sendMessage(activeConversationId, {
        content: payload.content,
        replyToId: payload.replyToId,
        clientMessageId,
        attachmentIds: payload.attachments.map((a) => a.id),
      });

      setMessagesByConv((prev) => {
        const list = prev[activeConversationId] || [];
        const hasReal = list.some((m) => m.id === res.message.id);
        if (hasReal) {
          return {
            ...prev,
            [activeConversationId]: list.filter((m) => m.id !== optimistic.id),
          };
        }
        return {
          ...prev,
          [activeConversationId]: list.map((m) => (m.id === optimistic.id ? res.message : m)),
        };
      });
    } catch {
      setMessagesByConv((prev) => ({
        ...prev,
        [activeConversationId]: (prev[activeConversationId] || []).map((m) =>
          m.id === optimistic.id ? { ...m, pending: false, failed: true } : m
        ),
      }));
    }
  };

  const handleRetryMessage = async (failedMsg: ChatMessage) => {
    setMessagesByConv((prev) => ({
      ...prev,
      [failedMsg.conversationId]: (prev[failedMsg.conversationId] || []).filter(
        (m) => m.id !== failedMsg.id
      ),
    }));
    await handleSendMessage({
      content: failedMsg.content,
      replyToId: failedMsg.replyToId,
      attachments: failedMsg.attachments,
    });
  };

  const handleLoadMore = async () => {
    if (!activeConversationId || loadingMore) return;
    const current = messagesByConv[activeConversationId] || [];
    const oldest = current[0];
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const res = await api.getMessages(activeConversationId, {
        before: oldest.createdAt,
        limit: 40,
      });
      setMessagesByConv((prev) => {
        const existing = prev[activeConversationId] || [];
        const existingIds = new Set(existing.map((m) => m.id));
        const older = res.messages.filter((m) => !existingIds.has(m.id));
        return { ...prev, [activeConversationId]: [...older, ...existing] };
      });
      setHasMoreByConv((prev) => ({ ...prev, [activeConversationId]: res.hasMore }));
    } finally {
      setLoadingMore(false);
    }
  };

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) || null,
    [conversations, activeConversationId]
  );

  const unreadMessagesCount = useMemo(
    () =>
      conversations
        .filter((c) => !c.myMembership.isArchived && !c.myMembership.isMuted)
        .reduce((acc, c) => acc + c.unreadCount, 0),
    [conversations]
  );

  const unreadNotificationsCount = useMemo(
    () => notifications.filter((n) => !n.isRead).length,
    [notifications]
  );

  const handleCycleTheme = async () => {
    const next: ThemePreference = preference === 'dark' ? 'light' : 'dark';
    setPreference(next);
    if (profile) {
      const res = await api.updateSettings({ theme: next });
      setSettings(res.settings);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-pulse">
            <LinkUpLogo size="md" />
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Loading LinkUp...
          </p>
        </div>
      </div>
    );
  }

  if (!profile || !settings) {
    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
          <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-center space-y-4">
            <h1 className="font-display text-lg font-semibold">Unable to load your workspace</h1>
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => void refreshProfile()}
                className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
              >
                Retry
              </button>
              <button
                type="button"
                onClick={() => void logout()}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <AuthScreen
        themePreference={preference}
        onChangeTheme={setPreference}
        siteConfig={siteConfig}
      />
    );
  }

  if (siteConfig?.maintenanceMode && !profile.isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-7 text-center space-y-4">
          <div className="mx-auto h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Wrench className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h1 className="font-display text-lg font-semibold">
              {siteConfig.siteName} is under maintenance
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {siteConfig.maintenanceMessage ||
                'LinkUp is currently undergoing scheduled maintenance. Please check back shortly.'}
            </p>
          </div>
          <div className="pt-2 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => void api.getSiteConfig().then((r) => setSiteConfig(r.config))}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
            >
              Check Again
            </button>
            <button
              type="button"
              onClick={() => void logout()}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  const activeTypingUsers = activeConversationId
    ? Object.entries(typingByConv[activeConversationId] || {}).map(([userId, meta]) => ({
        userId,
        displayName: meta.displayName,
      }))
    : [];

  const allowGroupCreation = siteConfig?.allowGroupCreation ?? true;
  const allowFileUploads = siteConfig?.allowFileUploads ?? true;
  const maxAttachmentMb = siteConfig?.maxAttachmentMb ?? 10;
  const announcementText = siteConfig?.announcementText?.trim() || '';

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {announcementText && !announcementDismissed && (
        <div
          className={`px-4 py-2 text-xs font-medium flex items-center justify-between gap-3 border-b shrink-0 ${
            siteConfig?.announcementTone === 'warning'
              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
              : siteConfig?.announcementTone === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-900 text-emerald-900 dark:text-emerald-200'
              : 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-900 text-indigo-900 dark:text-indigo-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {siteConfig?.announcementTone === 'warning' ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            ) : siteConfig?.announcementTone === 'success' ? (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Info className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="truncate">{announcementText}</span>
          </div>
          <button
            type="button"
            onClick={() => setAnnouncementDismissed(true)}
            aria-label="Dismiss announcement"
            className="opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 flex overflow-hidden">
        <NavSidebar
          activeTab={activeTab}
          onSelectTab={(tab) => {
            setActiveTab(tab);
            if (tab !== 'messages') setMobileShowChat(false);
          }}
          profile={profile}
          unreadMessagesCount={unreadMessagesCount}
          unreadNotificationsCount={unreadNotificationsCount}
          themePreference={preference}
          onCycleTheme={() => void handleCycleTheme()}
          hideMobileBar={activeTab === 'messages' && mobileShowChat}
        />

        <main className="flex-1 min-w-0 h-full flex pb-14 md:pb-0">
        {activeTab === 'messages' && (
          <>
            <div
              className={`${
                mobileShowChat ? 'hidden md:flex' : 'flex'
              } w-full md:w-auto h-full`}
            >
              <ConversationListPanel
                conversations={conversations}
                loading={loadingConversations}
                activeId={activeConversationId}
                currentUserId={profile.id}
                onSelectConversation={(id) => void handleSelectConversation(id)}
                onOpenNewChat={() => setActiveTab('discover')}
                onOpenNewGroup={() => setCreateGroupOpen(true)}
                allowGroupCreation={allowGroupCreation}
                onUpdatePreferences={async (cid, patch) => {
                  const res = await api.updatePreferences(cid, patch);
                  setConversations((prev) =>
                    prev.map((c) => (c.id === cid ? res.conversation : c))
                  );
                }}
                onMarkRead={async (cid) => {
                  await api.markConversationRead(cid);
                  setConversations((prev) =>
                    prev.map((c) => (c.id === cid ? { ...c, unreadCount: 0 } : c))
                  );
                }}
                messageSearchQuery={messageSearchQuery}
                onMessageSearchChange={setMessageSearchQuery}
                messageSearchResults={messageSearchResults}
                searchingMessages={searchingMessages}
                onJumpToMessage={async (cid, msgId) => {
                  await handleSelectConversation(cid);
                  setHighlightedMessageId(msgId);
                }}
              />
            </div>

            <div
              className={`${
                mobileShowChat ? 'flex' : 'hidden md:flex'
              } flex-1 min-w-0 h-full`}
            >
              <ChatPanel
                conversation={activeConversation}
                messages={activeConversationId ? messagesByConv[activeConversationId] || [] : []}
                loadingMessages={loadingMessages}
                hasMore={activeConversationId ? Boolean(hasMoreByConv[activeConversationId]) : false}
                loadingMore={loadingMore}
                currentUserId={profile.id}
                typingUsers={activeTypingUsers}
                highlightedMessageId={highlightedMessageId}
                showDetails={showDetails}
                onBackMobile={() => setMobileShowChat(false)}
                onToggleDetails={() => setShowDetails((prev) => !prev)}
                onLoadMore={handleLoadMore}
                onSendMessage={handleSendMessage}
                onRetryMessage={handleRetryMessage}
                onEditMessage={async (msgId, content) => {
                  const res = await api.editMessage(msgId, content);
                  setMessagesByConv((prev) => ({
                    ...prev,
                    [res.message.conversationId]: (
                      prev[res.message.conversationId] || []
                    ).map((m) => (m.id === msgId ? res.message : m)),
                  }));
                }}
                onDeleteMessage={async (msgId) => {
                  await api.deleteMessage(msgId);
                }}
                onTypingChange={(isTyping) => {
                  if (activeConversationId) {
                    sendTyping(activeConversationId, isTyping);
                  }
                }}
                onOpenUserProfile={(p) => setViewedProfile(p)}
                onOpenNewChat={() => setActiveTab('discover')}
                onOpenNewGroup={() => setCreateGroupOpen(true)}
                onStartSelfNotes={() => void handleStartDirectChat(profile.id)}
                allowGroupCreation={allowGroupCreation}
                allowFileUploads={allowFileUploads}
                maxAttachmentMb={maxAttachmentMb}
              />

              {showDetails && activeConversation && (
                <ConversationDetailsDrawer
                  conversation={activeConversation}
                  messages={messagesByConv[activeConversation.id] || []}
                  currentUserId={profile.id}
                  onClose={() => setShowDetails(false)}
                  onConversationUpdated={(updated) => {
                    setConversations((prev) =>
                      prev.map((c) => (c.id === updated.id ? updated : c))
                    );
                  }}
                  onLeftGroup={(cid) => {
                    setConversations((prev) => prev.filter((c) => c.id !== cid));
                    setActiveConversationId(null);
                    setShowDetails(false);
                    setMobileShowChat(false);
                  }}
                  onOpenUserProfile={(p) => setViewedProfile(p)}
                />
              )}
            </div>
          </>
        )}

        {activeTab === 'discover' && (
          <DiscoverPanel
            myProfile={profile}
            onStartDirectChat={handleStartDirectChat}
            onViewProfile={(p) => setViewedProfile(p)}
          />
        )}

        {activeTab === 'notifications' && (
          <NotificationsPanel
            notifications={notifications}
            loading={loadingNotifications}
            onMarkAllRead={async () => {
              await api.markNotificationsRead();
              setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
            }}
            onOpenNotification={async (n) => {
              if (!n.isRead) {
                await api.markNotificationsRead(n.id);
                setNotifications((prev) =>
                  prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item))
                );
              }
              if (n.conversationId) {
                await handleSelectConversation(n.conversationId);
              }
            }}
          />
        )}

        {activeTab === 'settings' && (
          <SettingsPanel
            profile={profile}
            settings={settings}
            themePreference={preference}
            onChangeTheme={setPreference}
            onProfileUpdated={setProfile}
            onSettingsUpdated={setSettings}
            onLogout={logout}
          />
        )}
        </main>
      </div>

      {allowGroupCreation && (
        <CreateGroupModal
          open={createGroupOpen}
          onClose={() => setCreateGroupOpen(false)}
          onCreateGroup={handleCreateGroup}
        />
      )}

      <UserProfileModal
        profile={viewedProfile}
        onClose={() => setViewedProfile(null)}
        onStartChat={handleStartDirectChat}
      />
    </div>
  );
}

function AdminRouteGuard() {
  const { profile, loading } = useAuth();
  useTheme();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-pulse">
            <LinkUpLogo size="md" />
          </div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Loading LinkUp...
          </p>
        </div>
      </div>
    );
  }

  if (!profile || !profile.isAdmin) {
    return <NotFoundScreen />;
  }

  return <AdminConsoleApp currentUser={profile} />;
}

export default function App() {
  const isAdminRoute =
    typeof window !== 'undefined' &&
    (window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/'));

  return (
    <AppErrorBoundary>
      <AuthProvider>
        {isAdminRoute ? <AdminRouteGuard /> : <LinkUpWorkspace />}
      </AuthProvider>
    </AppErrorBoundary>
  );
}
