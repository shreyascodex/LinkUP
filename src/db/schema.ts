import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    uid: text('uid').notNull().unique(),
    email: text('email').notNull(),
    passwordHash: text('password_hash'),
    username: text('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio').notNull().default(''),
    isAdmin: boolean('is_admin').notNull().default(false),
    isBanned: boolean('is_banned').notNull().default(false),
    status: text('status').notNull().default('offline'),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('profiles_username_idx').on(table.username),
    index('profiles_display_name_idx').on(table.displayName),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: text('type').notNull(), // 'direct' | 'group'
    name: text('name'),
    description: text('description').notNull().default(''),
    avatarUrl: text('avatar_url'),
    directKey: text('direct_key').unique(),
    createdBy: uuid('created_by').references(() => profiles.id, { onDelete: 'set null' }),
    lastMessageAt: timestamp('last_message_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [index('conversations_last_message_idx').on(table.lastMessageAt)]
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    role: text('role').notNull().default('member'), // 'admin' | 'member'
    isPinned: boolean('is_pinned').notNull().default(false),
    isMuted: boolean('is_muted').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('conversation_members_conv_user_uidx').on(table.conversationId, table.userId),
    index('conversation_members_user_idx').on(table.userId),
  ]
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    clientMessageId: text('client_message_id'),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    senderId: uuid('sender_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    replyToId: uuid('reply_to_id'),
    content: text('content').notNull().default(''),
    messageType: text('message_type').notNull().default('text'), // 'text' | 'image' | 'file' | 'system'
    isEdited: boolean('is_edited').notNull().default(false),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('messages_conv_created_idx').on(table.conversationId, table.createdAt),
    uniqueIndex('messages_conv_client_msg_uidx').on(table.conversationId, table.clientMessageId),
  ]
);

export const messageReads = pgTable(
  'message_reads',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    readAt: timestamp('read_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('message_reads_msg_user_uidx').on(table.messageId, table.userId),
    index('message_reads_user_idx').on(table.userId),
  ]
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    uploaderId: uuid('uploader_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    fileName: text('file_name').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSize: integer('file_size').notNull(),
    storageKey: text('storage_key').notNull(),
    isImage: boolean('is_image').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('message_attachments_msg_idx').on(table.messageId)]
);

export const userSettings = pgTable('user_settings', {
  userId: uuid('user_id')
    .primaryKey()
    .references(() => profiles.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('system'), // 'light' | 'dark' | 'system'
  showOnlineStatus: boolean('show_online_status').notNull().default(true),
  showLastSeen: boolean('show_last_seen').notNull().default(true),
  sendReadReceipts: boolean('send_read_receipts').notNull().default(true),
  inAppNotifications: boolean('in_app_notifications').notNull().default(true),
  browserNotifications: boolean('browser_notifications').notNull().default(false),
  soundEnabled: boolean('sound_enabled').notNull().default(true),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => profiles.id, { onDelete: 'cascade' })
      .notNull(),
    conversationId: uuid('conversation_id').references(() => conversations.id, {
      onDelete: 'cascade',
    }),
    actorId: uuid('actor_id').references(() => profiles.id, { onDelete: 'set null' }),
    type: text('type').notNull(), // 'message' | 'mention' | 'group_invite' | 'role_change'
    title: text('title').notNull(),
    body: text('body').notNull(),
    isRead: boolean('is_read').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('notifications_user_created_idx').on(table.userId, table.createdAt)]
);

export const adminConfig = pgTable('admin_config', {
  id: text('id').primaryKey(), // 'default'
  passwordHash: text('password_hash').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const siteSettings = pgTable('site_settings', {
  id: text('id').primaryKey(), // 'default'
  siteName: text('site_name').notNull().default('LinkUp'),
  tagline: text('tagline').notNull().default('Stay connected. Chat together.'),
  allowSignups: boolean('allow_signups').notNull().default(true),
  allowGroupCreation: boolean('allow_group_creation').notNull().default(true),
  allowFileUploads: boolean('allow_file_uploads').notNull().default(true),
  maxAttachmentMb: integer('max_attachment_mb').notNull().default(10),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  maintenanceMessage: text('maintenance_message')
    .notNull()
    .default('LinkUp is undergoing scheduled maintenance. Please check back shortly.'),
  announcementText: text('announcement_text').notNull().default(''),
  announcementTone: text('announcement_tone').notNull().default('info'), // 'info' | 'warning' | 'success'
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Relations
export const profilesRelations = relations(profiles, ({ one, many }) => ({
  settings: one(userSettings, {
    fields: [profiles.id],
    references: [userSettings.userId],
  }),
  memberships: many(conversationMembers),
  sentMessages: many(messages),
  notifications: many(notifications),
}));

export const conversationsRelations = relations(conversations, ({ many }) => ({
  members: many(conversationMembers),
  messages: many(messages),
}));

export const conversationMembersRelations = relations(conversationMembers, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMembers.conversationId],
    references: [conversations.id],
  }),
  user: one(profiles, {
    fields: [conversationMembers.userId],
    references: [profiles.id],
  }),
}));

export const messagesRelations = relations(messages, ({ one, many }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
  sender: one(profiles, {
    fields: [messages.senderId],
    references: [profiles.id],
  }),
  reads: many(messageReads),
  attachments: many(messageAttachments),
}));

export const messageReadsRelations = relations(messageReads, ({ one }) => ({
  message: one(messages, {
    fields: [messageReads.messageId],
    references: [messages.id],
  }),
  user: one(profiles, {
    fields: [messageReads.userId],
    references: [profiles.id],
  }),
}));

export const messageAttachmentsRelations = relations(messageAttachments, ({ one }) => ({
  message: one(messages, {
    fields: [messageAttachments.messageId],
    references: [messages.id],
  }),
}));
