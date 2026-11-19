import { useState } from 'react';
import {
  Archive,
  BellOff,
  CheckCheck,
  MessageSquarePlus,
  MoreVertical,
  Pin,
  Search,
  Users,
  X,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { formatConversationTimestamp } from '../../lib/utils/format';
import type { ChatMessage, ConversationSummary } from '../../types/chat';

interface ConversationListPanelProps {
  conversations: ConversationSummary[];
  loading: boolean;
  activeId: string | null;
  currentUserId: string;
  onSelectConversation: (id: string) => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onUpdatePreferences: (
    conversationId: string,
    patch: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean }
  ) => Promise<void>;
  onMarkRead: (conversationId: string) => Promise<void>;
  messageSearchQuery: string;
  onMessageSearchChange: (q: string) => void;
  messageSearchResults: ChatMessage[];
  searchingMessages: boolean;
  onJumpToMessage: (conversationId: string, messageId: string) => void;
  allowGroupCreation?: boolean;
}

type ListFilter = 'all' | 'unread' | 'archived';

export function ConversationListPanel({
  conversations,
  loading,
  activeId,
  currentUserId,
  onSelectConversation,
  onOpenNewChat,
  onOpenNewGroup,
  onUpdatePreferences,
  onMarkRead,
  messageSearchQuery,
  onMessageSearchChange,
  messageSearchResults,
  searchingMessages,
  onJumpToMessage,
  allowGroupCreation = true,
}: ConversationListPanelProps) {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const normalizedQuery = messageSearchQuery.trim().toLowerCase();

  const filteredConversations = conversations.filter((c) => {
    if (filter === 'archived') {
      if (!c.myMembership.isArchived) return false;
    } else {
      if (c.myMembership.isArchived) return false;
      if (filter === 'unread' && c.unreadCount === 0) return false;
    }

    if (!normalizedQuery) return true;
    const title =
      c.type === 'group'
        ? c.name || 'Group'
        : c.peer?.id === currentUserId
        ? 'Personal Notes'
        : c.peer?.displayName || 'Direct Chat';
    const preview = c.lastMessage?.content || '';
    const username = c.peer?.username || '';
    return (
      title.toLowerCase().includes(normalizedQuery) ||
      preview.toLowerCase().includes(normalizedQuery) ||
      username.toLowerCase().includes(normalizedQuery)
    );
  });

  const getConversationTitle = (c: ConversationSummary) => {
    if (c.type === 'group') return c.name || 'Untitled Group';
    if (c.peer?.id === currentUserId) return 'Personal Notes';
    return c.peer?.displayName || 'Conversation';
  };

  return (
    <aside className="w-full md:w-[320px] lg:w-[340px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-200/80 dark:border-slate-800/80 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold tracking-tight">Messages</h2>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onOpenNewChat}
              title="New direct message"
              aria-label="New direct message"
              className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <MessageSquarePlus className="h-4.5 w-4.5" />
            </button>
            {allowGroupCreation && (
              <button
                type="button"
                onClick={onOpenNewGroup}
                title="New group chat"
                aria-label="New group chat"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <Users className="h-4.5 w-4.5" />
              </button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={messageSearchQuery}
            onChange={(e) => onMessageSearchChange(e.target.value)}
            placeholder="Search chats or messages..."
            className="w-full h-9 pl-9 pr-8 text-sm rounded-xl border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {messageSearchQuery && (
            <button
              type="button"
              onClick={() => onMessageSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Filter Segmented Control */}
        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/70 rounded-lg">
          {(['all', 'unread', 'archived'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setFilter(tab)}
              className={`flex-1 py-1 text-xs font-medium rounded-md capitalize transition-colors whitespace-nowrap cursor-pointer ${
                filter === tab
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* List Body */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
        {loading ? (
          <div className="p-3 space-y-2.5">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 p-2 rounded-xl animate-pulse">
                <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
                  <div className="h-3 w-3/4 bg-slate-100 dark:bg-slate-800/60 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredConversations.length === 0 && !normalizedQuery ? (
          <div className="p-8 text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {filter === 'archived'
                ? 'No archived conversations'
                : filter === 'unread'
                ? 'All caught up'
                : 'No conversations yet'}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {filter === 'all'
                ? 'Start a direct message or create a group workspace to begin chatting.'
                : 'Switch filters or start a new conversation.'}
            </p>
            {filter === 'all' && (
              <button
                type="button"
                onClick={onOpenNewChat}
                className="mt-4 px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Start a conversation
              </button>
            )}
          </div>
        ) : (
          <>
            {filteredConversations.map((conv) => {
              const title = getConversationTitle(conv);
              const isSelected = conv.id === activeId;
              const isGroup = conv.type === 'group';
              const onlineStatus =
                !isGroup && conv.peer?.id !== currentUserId ? conv.peer?.status : undefined;

              const previewText = conv.lastMessage
                ? conv.lastMessage.deletedAt
                  ? 'Message deleted'
                  : conv.lastMessage.messageType === 'system'
                  ? `${conv.lastMessage.senderName} ${conv.lastMessage.content}`
                  : conv.lastMessage.senderId === currentUserId
                  ? `You: ${conv.lastMessage.content || 'Attachment'}`
                  : isGroup
                  ? `${conv.lastMessage.senderName.split(' ')[0]}: ${
                      conv.lastMessage.content || 'Attachment'
                    }`
                  : conv.lastMessage.content || 'Attachment'
                : 'No messages yet';

              return (
                <div
                  key={conv.id}
                  className={`relative group flex items-center gap-3 px-3.5 py-3 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/90 dark:bg-indigo-950/35'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectConversation(conv.id)}
                    className="flex-1 min-w-0 flex items-center gap-3 text-left cursor-pointer"
                  >
                    <Avatar
                      src={isGroup ? conv.avatarUrl : conv.peer?.avatarUrl}
                      name={title}
                      size="md"
                      isGroup={isGroup}
                      status={onlineStatus}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate flex items-center gap-1.5">
                          {conv.myMembership.isPinned && (
                            <Pin className="h-3 w-3 text-indigo-500 shrink-0" />
                          )}
                          <span className="truncate">{title}</span>
                          {conv.myMembership.isMuted && (
                            <BellOff className="h-3 w-3 text-slate-400 shrink-0" />
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                          {formatConversationTimestamp(conv.lastMessageAt)}
                        </span>
                      </div>

                      <div className="mt-0.5 flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {previewText}
                        </p>
                        {conv.unreadCount > 0 && (
                          <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-indigo-600 text-white text-[11px] font-semibold tabular-nums flex items-center justify-center shrink-0">
                            {conv.unreadCount > 99 ? '99+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Context menu trigger */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === conv.id ? null : conv.id);
                      }}
                      aria-label={`Conversation actions for ${title}`}
                      className="h-7 w-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 opacity-70 group-hover:opacity-100 cursor-pointer"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </button>

                    {menuOpenId === conv.id && (
                      <div
                        onMouseLeave={() => setMenuOpenId(null)}
                        className="absolute right-0 top-8 z-30 w-44 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1 text-xs"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            void onUpdatePreferences(conv.id, {
                              isPinned: !conv.myMembership.isPinned,
                            });
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <Pin className="h-3.5 w-3.5" />
                          <span>{conv.myMembership.isPinned ? 'Unpin chat' : 'Pin chat'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            void onUpdatePreferences(conv.id, {
                              isMuted: !conv.myMembership.isMuted,
                            });
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <BellOff className="h-3.5 w-3.5" />
                          <span>{conv.myMembership.isMuted ? 'Unmute alerts' : 'Mute alerts'}</span>
                        </button>
                        {conv.unreadCount > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setMenuOpenId(null);
                              void onMarkRead(conv.id);
                            }}
                            className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                          >
                            <CheckCheck className="h-3.5 w-3.5" />
                            <span>Mark as read</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setMenuOpenId(null);
                            void onUpdatePreferences(conv.id, {
                              isArchived: !conv.myMembership.isArchived,
                            });
                          }}
                          className="w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          <Archive className="h-3.5 w-3.5" />
                          <span>
                            {conv.myMembership.isArchived ? 'Unarchive chat' : 'Archive chat'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Message content search results */}
            {normalizedQuery.length >= 2 && (
              <div className="p-3 bg-slate-50/70 dark:bg-slate-950/40">
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-2">
                  {searchingMessages
                    ? 'Searching messages...'
                    : `Matching messages (${messageSearchResults.length})`}
                </p>
                {messageSearchResults.length === 0 && !searchingMessages ? (
                  <p className="text-xs text-slate-400">No messages match "{messageSearchQuery}"</p>
                ) : (
                  <div className="space-y-1.5">
                    {messageSearchResults.map((msg) => (
                      <button
                        key={msg.id}
                        type="button"
                        onClick={() => onJumpToMessage(msg.conversationId, msg.id)}
                        className="w-full text-left p-2 rounded-lg border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-400 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {msg.sender.displayName}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                            {formatConversationTimestamp(msg.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 mt-0.5">
                          {msg.content}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}
