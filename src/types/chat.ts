export type ThemePreference = 'light' | 'dark' | 'system';

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  status: 'online' | 'offline';
  lastSeenAt: string | null;
  createdAt: string;
}

export interface MyProfile extends PublicProfile {
  uid: string;
  email: string;
  isAdmin: boolean;
}

export interface UserSettings {
  userId: string;
  theme: ThemePreference;
  showOnlineStatus: boolean;
  showLastSeen: boolean;
  sendReadReceipts: boolean;
  inAppNotifications: boolean;
  browserNotifications: boolean;
  soundEnabled: boolean;
  updatedAt: string;
}

export interface MessageAttachment {
  id: string;
  messageId: string | null;
  conversationId: string;
  uploaderId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isImage: boolean;
  url: string;
  createdAt: string;
}

export interface MessageReplyPreview {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  deletedAt: string | null;
}

export interface MessageReadReceipt {
  userId: string;
  readAt: string;
}

export interface ChatMessage {
  id: string;
  clientMessageId?: string | null;
  conversationId: string;
  senderId: string;
  sender: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
  replyToId: string | null;
  replyTo: MessageReplyPreview | null;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  isEdited: boolean;
  deletedAt: string | null;
  attachments: MessageAttachment[];
  reads: MessageReadReceipt[];
  createdAt: string;
  updatedAt: string;
  pending?: boolean;
  failed?: boolean;
}

export interface ConversationMemberInfo {
  id: string;
  userId: string;
  role: 'admin' | 'member';
  joinedAt: string;
  profile: PublicProfile;
}

export interface ConversationSummary {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  description: string;
  avatarUrl: string | null;
  createdBy: string | null;
  lastMessageAt: string;
  createdAt: string;
  myMembership: {
    role: 'admin' | 'member';
    isPinned: boolean;
    isMuted: boolean;
    isArchived: boolean;
    lastReadAt: string;
  };
  unreadCount: number;
  lastMessage: {
    id: string;
    senderId: string;
    senderName: string;
    content: string;
    messageType: string;
    deletedAt: string | null;
    createdAt: string;
  } | null;
  members: ConversationMemberInfo[];
  peer: PublicProfile | null;
}

export interface AppNotification {
  id: string;
  userId: string;
  conversationId: string | null;
  actorId: string | null;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}

export interface LinkPreviewData {
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
}

export interface SiteConfig {
  siteName: string;
  tagline: string;
  allowSignups: boolean;
  allowGroupCreation: boolean;
  allowFileUploads: boolean;
  maxAttachmentMb: number;
  maintenanceMode: boolean;
  maintenanceMessage: string;
  announcementText: string;
  announcementTone: 'info' | 'warning' | 'success';
  updatedAt: string;
}

export type RealtimeEvent =
  | { type: 'connected'; userId: string }
  | { type: 'message:created'; message: ChatMessage }
  | { type: 'message:updated'; message: ChatMessage }
  | { type: 'message:deleted'; conversationId: string; messageId: string; deletedAt: string }
  | { type: 'message:read'; conversationId: string; userId: string; messageIds: string[]; readAt: string }
  | { type: 'conversation:updated'; conversationId: string }
  | { type: 'typing:update'; conversationId: string; userId: string; displayName: string; isTyping: boolean }
  | { type: 'presence:update'; userId: string; status: 'online' | 'offline'; lastSeenAt: string }
  | { type: 'notification:created'; notification: AppNotification }
  | { type: 'site:config'; config: SiteConfig };

export type AdminTableName =
  | 'profiles'
  | 'user_settings'
  | 'conversations'
  | 'conversation_members'
  | 'messages'
  | 'message_reads'
  | 'message_attachments'
  | 'notifications'
  | 'admin_config'
  | 'site_settings';

export interface AdminTableSummary {
  name: AdminTableName;
  description: string;
  rowCount: number;
  lastActivityAt: string | null;
}

export interface AdminTableDetail {
  name: AdminTableName;
  rowCount: number;
  columns: string[];
  rows: Record<string, string | number | boolean | null>[];
}

export interface AdminAuthStatus {
  configured: boolean;
  envOverride: boolean;
}

export interface AdminManagedUser {
  id: string;
  uid: string;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  status: string;
  isAdmin: boolean;
  isBanned: boolean;
  hasLocalPassword: boolean;
  conversationCount: number;
  messageCount: number;
  lastSeenAt: string;
  createdAt: string;
}

export interface AdminManagedConversation {
  id: string;
  type: 'direct' | 'group';
  name: string | null;
  description: string;
  memberCount: number;
  messageCount: number;
  members: {
    userId: string;
    username: string;
    displayName: string;
    role: string;
  }[];
  lastMessageAt: string;
  createdAt: string;
}

export interface AdminManagedMessage {
  id: string;
  conversationId: string;
  conversationLabel: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  content: string;
  messageType: string;
  isEdited: boolean;
  deletedAt: string | null;
  createdAt: string;
}

export interface AdminAttachmentItem {
  id: string;
  conversationId: string;
  uploaderId: string;
  uploaderUsername: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  isImage: boolean;
  createdAt: string;
}

export interface AdminNotificationItem {
  id: string;
  userId: string;
  recipientUsername: string;
  type: string;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: string;
}



