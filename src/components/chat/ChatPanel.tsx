import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronUp,
  Info,
  Paperclip,
  Pencil,
  Reply,
  RotateCcw,
  Search,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { SecureAttachment } from './SecureAttachment';
import { LinkPreviewCard } from './LinkPreviewCard';
import { api } from '../../lib/api';
import {
  extractFirstUrl,
  formatDayDivider,
  formatFileSize,
  formatLastSeen,
  formatMessageTime,
} from '../../lib/utils/format';
import type {
  ChatMessage,
  ConversationSummary,
  MessageAttachment,
  PublicProfile,
} from '../../types/chat';

interface ChatPanelProps {
  conversation: ConversationSummary | null;
  messages: ChatMessage[];
  loadingMessages: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  currentUserId: string;
  typingUsers: { userId: string; displayName: string }[];
  highlightedMessageId: string | null;
  showDetails: boolean;
  onBackMobile: () => void;
  onToggleDetails: () => void;
  onLoadMore: () => Promise<void>;
  onSendMessage: (payload: {
    content: string;
    replyToId?: string | null;
    attachments: MessageAttachment[];
  }) => Promise<void>;
  onRetryMessage: (message: ChatMessage) => Promise<void>;
  onEditMessage: (messageId: string, content: string) => Promise<void>;
  onDeleteMessage: (messageId: string) => Promise<void>;
  onTypingChange: (isTyping: boolean) => void;
  onOpenUserProfile: (profile: PublicProfile) => void;
  onOpenNewChat: () => void;
  onOpenNewGroup: () => void;
  onStartSelfNotes: () => void;
  allowGroupCreation?: boolean;
  allowFileUploads?: boolean;
  maxAttachmentMb?: number;
}

function renderMessageText(text: string, isOwn: boolean) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const parts = text.split(urlRegex);
  return parts.map((part, idx) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={idx}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className={`underline underline-offset-2 break-all ${
            isOwn ? 'text-indigo-100 hover:text-white' : 'text-indigo-600 dark:text-indigo-400'
          }`}
        >
          {part}
        </a>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

export function ChatPanel({
  conversation,
  messages,
  loadingMessages,
  hasMore,
  loadingMore,
  currentUserId,
  typingUsers,
  highlightedMessageId,
  showDetails,
  onBackMobile,
  onToggleDetails,
  onLoadMore,
  onSendMessage,
  onRetryMessage,
  onEditMessage,
  onDeleteMessage,
  onTypingChange,
  onOpenUserProfile,
  onOpenNewChat,
  onOpenNewGroup,
  onStartSelfNotes,
  allowGroupCreation = true,
  allowFileUploads = true,
  maxAttachmentMb = 10,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<MessageAttachment[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const [inChatSearchOpen, setInChatSearchOpen] = useState(false);
  const [inChatQuery, setInChatQuery] = useState('');
  const [inChatResults, setInChatResults] = useState<ChatMessage[]>([]);
  const [localHighlightId, setLocalHighlightId] = useState<string | null>(null);
  const [emptyArtFailed, setEmptyArtFailed] = useState(false);

  const timelineEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<number | null>(null);
  const prevConvIdRef = useRef<string | null>(null);
  const prevMsgCountRef = useRef(0);

  // Reset composer state on conversation switch
  useEffect(() => {
    if (conversation?.id !== prevConvIdRef.current) {
      prevConvIdRef.current = conversation?.id ?? null;
      setReplyTo(null);
      setEditingMessage(null);
      setPendingAttachments([]);
      setUploadProgress(null);
      setUploadError(null);
      setInChatSearchOpen(false);
      setInChatQuery('');
      setInChatResults([]);
      prevMsgCountRef.current = 0;
    }
  }, [conversation?.id]);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevMsgCountRef.current) {
      timelineEndRef.current?.scrollIntoView({ behavior: prevMsgCountRef.current === 0 ? 'auto' : 'smooth' });
    }
    prevMsgCountRef.current = messages.length;
  }, [messages.length]);

  // Scroll to highlighted message
  useEffect(() => {
    const targetId = highlightedMessageId || localHighlightId;
    if (!targetId) return;
    const el = document.getElementById(`msg-${targetId}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightedMessageId, localHighlightId, messages]);

  // In-conversation search
  useEffect(() => {
    if (!inChatSearchOpen || !conversation || inChatQuery.trim().length < 2) {
      setInChatResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      api
        .searchMessages(inChatQuery.trim(), conversation.id)
        .then((res) => setInChatResults(res.messages))
        .catch(() => setInChatResults([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [inChatSearchOpen, inChatQuery, conversation]);

  if (!conversation) {
    return (
      <section className="flex-1 flex flex-col items-center justify-center p-8 bg-slate-50/60 dark:bg-slate-950 text-center">
        <div className="max-w-md w-full flex flex-col items-center">
          <div className="h-36 w-36 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-6 flex items-center justify-center">
            {!emptyArtFailed ? (
              <img
                src="/src/assets/images/empty_chat_illustration_1795097775028.jpg"
                alt="LinkUp conversation emblem"
                referrerPolicy="no-referrer"
                onError={() => setEmptyArtFailed(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="font-display text-3xl font-bold text-indigo-600">LU</span>
            )}
          </div>
          <h2 className="font-display text-xl font-semibold text-slate-900 dark:text-slate-100">
            Select a conversation
          </h2>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Choose an existing thread from the list, discover teammates, or launch a new group workspace.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onOpenNewChat}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors cursor-pointer"
            >
              Find people
            </button>
            {allowGroupCreation && (
              <button
                type="button"
                onClick={onOpenNewGroup}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
              >
                Create group
              </button>
            )}
            <button
              type="button"
              onClick={onStartSelfNotes}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium transition-colors cursor-pointer"
            >
              Personal Notes
            </button>
          </div>
        </div>
      </section>
    );
  }

  const isGroup = conversation.type === 'group';
  const isSelfNotes = !isGroup && conversation.peer?.id === currentUserId;
  const title = isGroup
    ? conversation.name || 'Group Chat'
    : isSelfNotes
    ? 'Personal Notes'
    : conversation.peer?.displayName || 'Direct Message';

  const onlineMembersCount = conversation.members.filter(
    (m) => m.profile.status === 'online'
  ).length;

  const subtitle =
    typingUsers.length > 0
      ? `${typingUsers.map((t) => t.displayName.split(' ')[0]).join(', ')} typing...`
      : isGroup
      ? `${conversation.members.length} members${
          onlineMembersCount > 0 ? ` · ${onlineMembersCount} online` : ''
        }`
      : isSelfNotes
      ? 'Private space for your notes and files'
      : conversation.peer?.status === 'online'
      ? 'Online'
      : formatLastSeen(conversation.peer?.lastSeenAt ?? null);

  const myRole = conversation.myMembership.role;

  const handleDraftChange = (val: string) => {
    setDraft(val);
    if (!editingMessage) {
      onTypingChange(true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = window.setTimeout(() => {
        onTypingChange(false);
      }, 2200);
    }
  };

  const handleSubmit = async () => {
    const trimmed = draft.trim();
    if (sending) return;

    if (editingMessage) {
      if (!trimmed) return;
      setSending(true);
      try {
        await onEditMessage(editingMessage.id, trimmed);
        setEditingMessage(null);
        setDraft('');
      } finally {
        setSending(false);
      }
      return;
    }

    if (!trimmed && pendingAttachments.length === 0) return;

    const currentAttachments = [...pendingAttachments];
    const currentReply = replyTo?.id ?? null;

    setDraft('');
    setReplyTo(null);
    setPendingAttachments([]);
    onTypingChange(false);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    setSending(true);
    try {
      await onSendMessage({
        content: trimmed,
        replyToId: currentReply,
        attachments: currentAttachments,
      });
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const handleFilePick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !conversation) return;
    if (!allowFileUploads) {
      setUploadError('File uploads are disabled by the site administrator.');
      return;
    }
    if (file.size > maxAttachmentMb * 1024 * 1024) {
      setUploadError(`File exceeds the ${maxAttachmentMb} MB upload limit.`);
      return;
    }

    setUploadError(null);
    setUploadProgress(0);
    try {
      const uploaded = await api.uploadAttachmentWithProgress(conversation.id, file, (pct) => {
        setUploadProgress(pct);
      });
      setPendingAttachments((prev) => [...prev, uploaded]);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'File upload failed');
    } finally {
      setUploadProgress(null);
    }
  };

  return (
    <section className="flex-1 flex flex-col min-w-0 h-full bg-slate-50/70 dark:bg-slate-950">
      {/* Header */}
      <header className="h-16 px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBackMobile}
            aria-label="Back to conversations"
            className="md:hidden h-10 w-10 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!isGroup && conversation.peer) {
                onOpenUserProfile(conversation.peer);
              } else {
                onToggleDetails();
              }
            }}
            className="flex items-center gap-3 min-w-0 text-left cursor-pointer"
          >
            <Avatar
              src={isGroup ? conversation.avatarUrl : conversation.peer?.avatarUrl}
              name={title}
              size="md"
              isGroup={isGroup}
              status={!isGroup && !isSelfNotes ? conversation.peer?.status : undefined}
            />
            <div className="min-w-0">
              <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                {title}
              </h2>
              <p
                className={`text-xs truncate ${
                  typingUsers.length > 0
                    ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                {subtitle}
              </p>
            </div>
          </button>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setInChatSearchOpen(!inChatSearchOpen);
              setInChatQuery('');
            }}
            aria-label="Search in conversation"
            title="Search in conversation"
            className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              inChatSearchOpen
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Search className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={onToggleDetails}
            aria-label="Toggle conversation details"
            title="Conversation details"
            className={`h-9 w-9 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
              showDetails
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Info className="h-4.5 w-4.5" />
          </button>
        </div>
      </header>

      {/* In-Conversation Search Strip */}
      {inChatSearchOpen && (
        <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={inChatQuery}
              onChange={(e) => setInChatQuery(e.target.value)}
              placeholder="Search messages in this conversation..."
              className="flex-1 text-sm bg-transparent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setInChatSearchOpen(false)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {inChatResults.length > 0 && (
            <div className="max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800 pt-1">
              {inChatResults.map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => setLocalHighlightId(res.id)}
                  className="w-full py-1.5 px-1 text-left flex items-center justify-between gap-3 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 rounded"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    <strong className="font-medium">{res.sender.displayName}:</strong> {res.content}
                  </span>
                  <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                    {formatMessageTime(res.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message Timeline */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
        {hasMore && (
          <div className="flex justify-center pb-2">
            <button
              type="button"
              disabled={loadingMore}
              onClick={onLoadMore}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-50 cursor-pointer"
            >
              <ChevronUp className="h-3.5 w-3.5" />
              <span>{loadingMore ? 'Loading...' : 'Load older messages'}</span>
            </button>
          </div>
        )}

        {loadingMessages ? (
          <div className="space-y-4 py-4">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? 'justify-end' : 'justify-start'} animate-pulse`}
              >
                <div className="h-12 w-56 rounded-2xl bg-slate-200 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center py-12">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              No messages here yet
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Say hello or share an attachment to start the conversation.
            </p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const prev = idx > 0 ? messages[idx - 1] : null;
            const showDateDivider =
              !prev ||
              new Date(prev.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

            if (msg.messageType === 'system') {
              return (
                <div key={msg.id}>
                  {showDateDivider && (
                    <div className="flex items-center justify-center my-4">
                      <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-2">
                        {formatDayDivider(msg.createdAt)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-center my-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 text-center">
                      {msg.sender.displayName} {msg.content}
                    </span>
                  </div>
                </div>
              );
            }

            const isOwn = msg.senderId === currentUserId;
            const isDeleted = Boolean(msg.deletedAt);
            const isHighlighted =
              highlightedMessageId === msg.id || localHighlightId === msg.id;
            const firstUrl = !isDeleted && msg.content ? extractFirstUrl(msg.content) : null;
            const readByOthers = msg.reads.some((r) => r.userId !== currentUserId);

            return (
              <div key={msg.id} id={`msg-${msg.id}`}>
                {showDateDivider && (
                  <div className="flex items-center justify-center my-4">
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 px-2">
                      {formatDayDivider(msg.createdAt)}
                    </span>
                  </div>
                )}

                <div
                  className={`group flex items-end gap-2 ${
                    isOwn ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {!isOwn && isGroup && (
                    <Avatar
                      src={msg.sender.avatarUrl}
                      name={msg.sender.displayName}
                      size="xs"
                    />
                  )}

                  {/* Message Actions (left of own bubble) */}
                  {isOwn && !isDeleted && !msg.pending && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setReplyTo(msg)}
                        title="Reply"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      {msg.content && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingMessage(msg);
                            setDraft(msg.content);
                            setReplyTo(null);
                          }}
                          title="Edit"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void onDeleteMessage(msg.id)}
                        title="Delete"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <div
                    className={`max-w-[78%] sm:max-w-[65%] rounded-2xl px-3.5 py-2.5 transition-colors ${
                      isHighlighted ? 'ring-2 ring-amber-400' : ''
                    } ${
                      isDeleted
                        ? 'border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900 text-slate-500 italic'
                        : isOwn
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {!isOwn && isGroup && !isDeleted && (
                      <p className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 mb-0.5">
                        {msg.sender.displayName}
                      </p>
                    )}

                    {/* Reply Preview */}
                    {msg.replyTo && !isDeleted && (
                      <button
                        type="button"
                        onClick={() => setLocalHighlightId(msg.replyTo!.id)}
                        className={`mb-2 w-full text-left rounded-lg px-2.5 py-1.5 text-xs border cursor-pointer ${
                          isOwn
                            ? 'bg-indigo-700/50 border-indigo-400/40 text-indigo-100'
                            : 'bg-slate-50 dark:bg-slate-800/70 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <p className="font-semibold text-[11px] truncate">
                          {msg.replyTo.senderName}
                        </p>
                        <p className="truncate opacity-85">
                          {msg.replyTo.deletedAt ? 'Message deleted' : msg.replyTo.content || 'Attachment'}
                        </p>
                      </button>
                    )}

                    {isDeleted ? (
                      <p className="text-xs">This message was deleted</p>
                    ) : (
                      <>
                        {msg.content && (
                          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {renderMessageText(msg.content, isOwn)}
                          </p>
                        )}
                        {msg.attachments.map((att) => (
                          <SecureAttachment key={att.id} attachment={att} isOwn={isOwn} />
                        ))}
                        {firstUrl && <LinkPreviewCard url={firstUrl} isOwn={isOwn} />}
                      </>
                    )}

                    <div
                      className={`mt-1 flex items-center justify-end gap-1.5 text-[10px] tabular-nums ${
                        isDeleted
                          ? 'text-slate-400'
                          : isOwn
                          ? 'text-indigo-100/90'
                          : 'text-slate-400 dark:text-slate-500'
                      }`}
                    >
                      {msg.isEdited && !isDeleted && <span>Edited</span>}
                      <span>{formatMessageTime(msg.createdAt)}</span>
                      {isOwn && !isDeleted && (
                        msg.failed ? (
                          <button
                            type="button"
                            onClick={() => void onRetryMessage(msg)}
                            className="inline-flex items-center gap-0.5 text-red-200 hover:text-white underline cursor-pointer"
                          >
                            <RotateCcw className="h-3 w-3" />
                            <span>Retry</span>
                          </button>
                        ) : msg.pending ? (
                          <span>Sending</span>
                        ) : readByOthers ? (
                          <CheckCheck className="h-3.5 w-3.5 text-white" />
                        ) : (
                          <Check className="h-3.5 w-3.5 opacity-80" />
                        )
                      )}
                    </div>
                  </div>

                  {/* Message Actions (right of peer bubble) */}
                  {!isOwn && !isDeleted && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        onClick={() => setReplyTo(msg)}
                        title="Reply"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/70 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Reply className="h-3.5 w-3.5" />
                      </button>
                      {isGroup && myRole === 'admin' && (
                        <button
                          type="button"
                          onClick={() => void onDeleteMessage(msg.id)}
                          title="Delete as admin"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={timelineEndRef} />
      </div>

      {/* Composer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 shrink-0">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">
            <div className="min-w-0">
              <p className="font-semibold text-indigo-600 dark:text-indigo-400">
                Replying to {replyTo.sender.displayName}
              </p>
              <p className="truncate text-slate-600 dark:text-slate-400">
                {replyTo.content || 'Attachment'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setReplyTo(null)}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {editingMessage && (
          <div className="mb-2 flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-xs">
            <span className="font-medium text-amber-800 dark:text-amber-200">
              Editing message
            </span>
            <button
              type="button"
              onClick={() => {
                setEditingMessage(null);
                setDraft('');
              }}
              className="p-1 text-amber-700 dark:text-amber-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {uploadError && (
          <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/40 text-xs text-red-700 dark:text-red-300">
            <span>{uploadError}</span>
            <button type="button" onClick={() => setUploadError(null)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {uploadProgress !== null && (
          <div className="mb-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 space-y-1">
            <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
              <span>Uploading attachment...</span>
              <span className="tabular-nums font-mono">{uploadProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div
                className="h-full bg-indigo-600 transition-all"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {pendingAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pendingAttachments.map((att) => (
              <div
                key={att.id}
                className="inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              >
                <span className="truncate max-w-[160px] font-medium">{att.fileName}</span>
                <span className="text-slate-400 tabular-nums">{formatFileSize(att.fileSize)}</span>
                <button
                  type="button"
                  onClick={() =>
                    setPendingAttachments((prev) => prev.filter((p) => p.id !== att.id))
                  }
                  className="text-slate-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFilePick}
          />
          {!editingMessage && allowFileUploads && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadProgress !== null}
              title={`Attach image or file (max ${maxAttachmentMb} MB)`}
              aria-label="Attach file"
              className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 shrink-0 cursor-pointer"
            >
              <Paperclip className="h-4.5 w-4.5" />
            </button>
          )}

          <textarea
            rows={1}
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              editingMessage
                ? 'Edit your message...'
                : `Message ${title}...`
            }
            className="flex-1 min-h-[42px] max-h-36 px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          />

          <button
            type="button"
            disabled={sending || (!draft.trim() && pendingAttachments.length === 0)}
            onClick={() => void handleSubmit()}
            aria-label="Send message"
            className="h-10 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-medium inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors cursor-pointer"
          >
            <Send className="h-4 w-4" />
            <span className="hidden sm:inline">{editingMessage ? 'Save' : 'Send'}</span>
          </button>
        </div>
      </footer>
    </section>
  );
}
