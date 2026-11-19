import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { and, desc, eq, ilike, inArray, isNotNull, max, or, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  adminConfig,
  conversationMembers,
  conversations,
  messageAttachments,
  messageReads,
  messages,
  notifications,
  profiles,
  siteSettings,
  userSettings,
} from '../../db/schema.ts';
import { hashPassword, signAdminToken, verifyPassword } from './authService.ts';
import { getOrCreateSettings, isAdminEmail } from './profileService.ts';
import {
  broadcastToAllConnected,
  broadcastToConversation,
  broadcastToUsers,
  disconnectUserSockets,
} from '../realtime.ts';
import type {
  AdminAttachmentItem,
  AdminAuthStatus,
  AdminManagedConversation,
  AdminManagedMessage,
  AdminManagedUser,
  AdminNotificationItem,
  AdminTableDetail,
  AdminTableName,
  AdminTableSummary,
} from '../../types/chat.ts';

function toIso(val: Date | null | undefined): string | null {
  return val ? val.toISOString() : null;
}

function timingSafeTextEqual(a: string, b: string): boolean {
  const hashA = crypto.createHash('sha256').update(a).digest();
  const hashB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

function getEnvAdminPassword(): string | null {
  const raw = process.env.ADMIN_PASSWORD?.trim();
  return raw ? raw : null;
}

export async function getAdminAuthStatus(): Promise<AdminAuthStatus> {
  if (getEnvAdminPassword()) {
    return { configured: true, envOverride: true };
  }
  const rows = await db
    .select({ id: adminConfig.id })
    .from(adminConfig)
    .where(eq(adminConfig.id, 'default'))
    .limit(1);
  return {
    configured: rows.length > 0,
    envOverride: false,
  };
}

export async function setupAdminPassword(
  profileId: string,
  password: string
): Promise<{ token: string }> {
  if (getEnvAdminPassword()) {
    throw Object.assign(
      new Error('Admin password is already managed by the ADMIN_PASSWORD environment variable'),
      { statusCode: 409 }
    );
  }
  const existing = await db
    .select({ id: adminConfig.id })
    .from(adminConfig)
    .where(eq(adminConfig.id, 'default'))
    .limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('Admin password is already configured. Please sign in.'), {
      statusCode: 409,
    });
  }

  await db
    .insert(adminConfig)
    .values({
      id: 'default',
      passwordHash: hashPassword(password),
      updatedAt: new Date(),
    })
    .onConflictDoNothing();

  return { token: signAdminToken(profileId) };
}

export async function loginAdmin(profileId: string, password: string): Promise<{ token: string }> {
  const envPass = getEnvAdminPassword();
  if (envPass) {
    if (!timingSafeTextEqual(password, envPass)) {
      throw Object.assign(new Error('Invalid admin password'), { statusCode: 401 });
    }
    return { token: signAdminToken(profileId) };
  }

  const rows = await db
    .select()
    .from(adminConfig)
    .where(eq(adminConfig.id, 'default'))
    .limit(1);

  const row = rows[0];
  if (!row) {
    throw Object.assign(new Error('Admin password is not configured yet'), { statusCode: 400 });
  }

  if (!verifyPassword(password, row.passwordHash)) {
    throw Object.assign(new Error('Invalid admin password'), { statusCode: 401 });
  }

  return { token: signAdminToken(profileId) };
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (getEnvAdminPassword()) {
    throw Object.assign(
      new Error('Cannot change password in UI while ADMIN_PASSWORD env override is active'),
      { statusCode: 409 }
    );
  }

  const rows = await db
    .select()
    .from(adminConfig)
    .where(eq(adminConfig.id, 'default'))
    .limit(1);

  const row = rows[0];
  if (!row || !verifyPassword(currentPassword, row.passwordHash)) {
    throw Object.assign(new Error('Current admin password is incorrect'), { statusCode: 401 });
  }

  await db
    .update(adminConfig)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(adminConfig.id, 'default'));
}

export async function getAdminDatabaseOverview(): Promise<AdminTableSummary[]> {
  try {
    const [
      profilesStat,
      settingsStat,
      convsStat,
      membersStat,
      messagesStat,
      readsStat,
      attachmentsStat,
      notificationsStat,
      adminStat,
      siteStat,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(profiles.updatedAt) })
        .from(profiles),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(userSettings.updatedAt) })
        .from(userSettings),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(conversations.updatedAt) })
        .from(conversations),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(conversationMembers.joinedAt) })
        .from(conversationMembers),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(messages.createdAt) })
        .from(messages),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(messageReads.readAt) })
        .from(messageReads),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(messageAttachments.createdAt) })
        .from(messageAttachments),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(notifications.createdAt) })
        .from(notifications),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(adminConfig.updatedAt) })
        .from(adminConfig),
      db
        .select({ count: sql<number>`count(*)::int`, latest: max(siteSettings.updatedAt) })
        .from(siteSettings),
    ]);

    return [
      {
        name: 'profiles',
        description: 'Registered user identities, usernames, and presence status',
        rowCount: profilesStat[0]?.count ?? 0,
        lastActivityAt: toIso(profilesStat[0]?.latest),
      },
      {
        name: 'user_settings',
        description: 'Per-user theme, privacy, and notification preferences',
        rowCount: settingsStat[0]?.count ?? 0,
        lastActivityAt: toIso(settingsStat[0]?.latest),
      },
      {
        name: 'conversations',
        description: 'Direct 1-to-1 and group chat rooms',
        rowCount: convsStat[0]?.count ?? 0,
        lastActivityAt: toIso(convsStat[0]?.latest),
      },
      {
        name: 'conversation_members',
        description: 'Room memberships, roles, pin/mute/archive states, and read cursors',
        rowCount: membersStat[0]?.count ?? 0,
        lastActivityAt: toIso(membersStat[0]?.latest),
      },
      {
        name: 'messages',
        description: 'Persisted chat messages, replies, edits, and soft deletions',
        rowCount: messagesStat[0]?.count ?? 0,
        lastActivityAt: toIso(messagesStat[0]?.latest),
      },
      {
        name: 'message_reads',
        description: 'Individual message read receipt timestamps',
        rowCount: readsStat[0]?.count ?? 0,
        lastActivityAt: toIso(readsStat[0]?.latest),
      },
      {
        name: 'message_attachments',
        description: 'Private file and image attachment metadata',
        rowCount: attachmentsStat[0]?.count ?? 0,
        lastActivityAt: toIso(attachmentsStat[0]?.latest),
      },
      {
        name: 'notifications',
        description: 'In-app message and group invitation notifications',
        rowCount: notificationsStat[0]?.count ?? 0,
        lastActivityAt: toIso(notificationsStat[0]?.latest),
      },
      {
        name: 'admin_config',
        description: 'Master admin console credential store (hashes redacted)',
        rowCount: adminStat[0]?.count ?? 0,
        lastActivityAt: toIso(adminStat[0]?.latest),
      },
      {
        name: 'site_settings',
        description: 'Global website branding, feature flags, maintenance mode, and banners',
        rowCount: siteStat[0]?.count ?? 0,
        lastActivityAt: toIso(siteStat[0]?.latest),
      },
    ];
  } catch (error) {
    console.error('getAdminDatabaseOverview failed:', error);
    throw new Error('Failed to query database table counts', { cause: error });
  }
}

export async function getAdminTableDetail(tableName: AdminTableName): Promise<AdminTableDetail> {
  try {
    switch (tableName) {
      case 'profiles': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(profiles);
        const rows = await db
          .select({
            id: profiles.id,
            username: profiles.username,
            displayName: profiles.displayName,
            email: profiles.email,
            isAdmin: profiles.isAdmin,
            status: profiles.status,
            lastSeenAt: profiles.lastSeenAt,
            createdAt: profiles.createdAt,
          })
          .from(profiles)
          .orderBy(desc(profiles.createdAt))
          .limit(25);
        return {
          name: 'profiles',
          rowCount: count,
          columns: [
            'id',
            'username',
            'displayName',
            'email',
            'isAdmin',
            'status',
            'lastSeenAt',
            'createdAt',
          ],
          rows: rows.map((r) => ({
            ...r,
            lastSeenAt: r.lastSeenAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
          })),
        };
      }
      case 'user_settings': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(userSettings);
        const rows = await db
          .select()
          .from(userSettings)
          .orderBy(desc(userSettings.updatedAt))
          .limit(25);
        return {
          name: 'user_settings',
          rowCount: count,
          columns: [
            'userId',
            'theme',
            'showOnlineStatus',
            'showLastSeen',
            'sendReadReceipts',
            'inAppNotifications',
            'browserNotifications',
            'updatedAt',
          ],
          rows: rows.map((r) => ({
            userId: r.userId,
            theme: r.theme,
            showOnlineStatus: r.showOnlineStatus,
            showLastSeen: r.showLastSeen,
            sendReadReceipts: r.sendReadReceipts,
            inAppNotifications: r.inAppNotifications,
            browserNotifications: r.browserNotifications,
            updatedAt: r.updatedAt.toISOString(),
          })),
        };
      }
      case 'conversations': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversations);
        const rows = await db
          .select({
            id: conversations.id,
            type: conversations.type,
            name: conversations.name,
            lastMessageAt: conversations.lastMessageAt,
            createdAt: conversations.createdAt,
          })
          .from(conversations)
          .orderBy(desc(conversations.lastMessageAt))
          .limit(25);
        return {
          name: 'conversations',
          rowCount: count,
          columns: ['id', 'type', 'name', 'lastMessageAt', 'createdAt'],
          rows: rows.map((r) => ({
            ...r,
            lastMessageAt: r.lastMessageAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
          })),
        };
      }
      case 'conversation_members': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversationMembers);
        const rows = await db
          .select({
            id: conversationMembers.id,
            conversationId: conversationMembers.conversationId,
            userId: conversationMembers.userId,
            role: conversationMembers.role,
            isPinned: conversationMembers.isPinned,
            isMuted: conversationMembers.isMuted,
            isArchived: conversationMembers.isArchived,
            joinedAt: conversationMembers.joinedAt,
          })
          .from(conversationMembers)
          .orderBy(desc(conversationMembers.joinedAt))
          .limit(25);
        return {
          name: 'conversation_members',
          rowCount: count,
          columns: [
            'id',
            'conversationId',
            'userId',
            'role',
            'isPinned',
            'isMuted',
            'isArchived',
            'joinedAt',
          ],
          rows: rows.map((r) => ({
            ...r,
            joinedAt: r.joinedAt.toISOString(),
          })),
        };
      }
      case 'messages': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messages);
        const rows = await db
          .select({
            id: messages.id,
            conversationId: messages.conversationId,
            senderId: messages.senderId,
            messageType: messages.messageType,
            isEdited: messages.isEdited,
            deletedAt: messages.deletedAt,
            createdAt: messages.createdAt,
          })
          .from(messages)
          .orderBy(desc(messages.createdAt))
          .limit(25);
        return {
          name: 'messages',
          rowCount: count,
          columns: [
            'id',
            'conversationId',
            'senderId',
            'messageType',
            'isEdited',
            'deletedAt',
            'createdAt',
          ],
          rows: rows.map((r) => ({
            ...r,
            deletedAt: toIso(r.deletedAt),
            createdAt: r.createdAt.toISOString(),
          })),
        };
      }
      case 'message_reads': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messageReads);
        const rows = await db
          .select({
            id: messageReads.id,
            messageId: messageReads.messageId,
            userId: messageReads.userId,
            readAt: messageReads.readAt,
          })
          .from(messageReads)
          .orderBy(desc(messageReads.readAt))
          .limit(25);
        return {
          name: 'message_reads',
          rowCount: count,
          columns: ['id', 'messageId', 'userId', 'readAt'],
          rows: rows.map((r) => ({
            ...r,
            readAt: r.readAt.toISOString(),
          })),
        };
      }
      case 'message_attachments': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(messageAttachments);
        const rows = await db
          .select({
            id: messageAttachments.id,
            conversationId: messageAttachments.conversationId,
            fileName: messageAttachments.fileName,
            mimeType: messageAttachments.mimeType,
            fileSize: messageAttachments.fileSize,
            isImage: messageAttachments.isImage,
            createdAt: messageAttachments.createdAt,
          })
          .from(messageAttachments)
          .orderBy(desc(messageAttachments.createdAt))
          .limit(25);
        return {
          name: 'message_attachments',
          rowCount: count,
          columns: [
            'id',
            'conversationId',
            'fileName',
            'mimeType',
            'fileSize',
            'isImage',
            'createdAt',
          ],
          rows: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          })),
        };
      }
      case 'notifications': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(notifications);
        const rows = await db
          .select({
            id: notifications.id,
            userId: notifications.userId,
            type: notifications.type,
            title: notifications.title,
            isRead: notifications.isRead,
            createdAt: notifications.createdAt,
          })
          .from(notifications)
          .orderBy(desc(notifications.createdAt))
          .limit(25);
        return {
          name: 'notifications',
          rowCount: count,
          columns: ['id', 'userId', 'type', 'title', 'isRead', 'createdAt'],
          rows: rows.map((r) => ({
            ...r,
            createdAt: r.createdAt.toISOString(),
          })),
        };
      }
      case 'admin_config': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(adminConfig);
        const rows = await db
          .select({
            id: adminConfig.id,
            updatedAt: adminConfig.updatedAt,
          })
          .from(adminConfig)
          .limit(10);
        return {
          name: 'admin_config',
          rowCount: count,
          columns: ['id', 'passwordHash', 'updatedAt'],
          rows: rows.map((r) => ({
            id: r.id,
            passwordHash: '[REDACTED]',
            updatedAt: r.updatedAt.toISOString(),
          })),
        };
      }
      case 'site_settings': {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(siteSettings);
        const rows = await db.select().from(siteSettings).limit(10);
        return {
          name: 'site_settings',
          rowCount: count,
          columns: [
            'id',
            'siteName',
            'allowSignups',
            'allowGroupCreation',
            'allowFileUploads',
            'maxAttachmentMb',
            'maintenanceMode',
            'updatedAt',
          ],
          rows: rows.map((r) => ({
            id: r.id,
            siteName: r.siteName,
            allowSignups: r.allowSignups,
            allowGroupCreation: r.allowGroupCreation,
            allowFileUploads: r.allowFileUploads,
            maxAttachmentMb: r.maxAttachmentMb,
            maintenanceMode: r.maintenanceMode,
            updatedAt: r.updatedAt.toISOString(),
          })),
        };
      }
    }
  } catch (error) {
    console.error('getAdminTableDetail failed:', error);
    throw new Error('Failed to load table rows', { cause: error });
  }
}

export async function listAdminUsers(search?: string): Promise<AdminManagedUser[]> {
  const q = search?.trim();
  const userRows = q
    ? await db
        .select()
        .from(profiles)
        .where(
          or(
            ilike(profiles.username, `%${q}%`),
            ilike(profiles.displayName, `%${q}%`),
            ilike(profiles.email, `%${q}%`)
          )
        )
        .orderBy(desc(profiles.createdAt))
        .limit(100)
    : await db.select().from(profiles).orderBy(desc(profiles.createdAt)).limit(100);

  if (userRows.length === 0) return [];

  const userIds = userRows.map((u) => u.id);
  const [convCounts, msgCounts] = await Promise.all([
    db
      .select({
        userId: conversationMembers.userId,
        count: sql<number>`count(*)::int`,
      })
      .from(conversationMembers)
      .where(inArray(conversationMembers.userId, userIds))
      .groupBy(conversationMembers.userId),
    db
      .select({
        senderId: messages.senderId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(inArray(messages.senderId, userIds))
      .groupBy(messages.senderId),
  ]);

  const convMap = new Map(convCounts.map((c) => [c.userId, c.count]));
  const msgMap = new Map(msgCounts.map((m) => [m.senderId, m.count]));

  return userRows.map((u) => ({
    id: u.id,
    uid: u.uid,
    username: u.username,
    displayName: u.displayName,
    email: u.email,
    bio: u.bio,
    avatarUrl: u.avatarUrl,
    status: u.status,
    isAdmin: Boolean(u.isAdmin || isAdminEmail(u.email)),
    isBanned: Boolean(u.isBanned),
    hasLocalPassword: Boolean(u.passwordHash),
    conversationCount: convMap.get(u.id) ?? 0,
    messageCount: msgMap.get(u.id) ?? 0,
    lastSeenAt: u.lastSeenAt.toISOString(),
    createdAt: u.createdAt.toISOString(),
  }));
}

export async function createAdminUser(input: {
  email: string;
  password: string;
  displayName: string;
  username?: string;
  isAdmin?: boolean;
}): Promise<AdminManagedUser> {
  const email = input.email.trim().toLowerCase();
  const existingEmail = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);
  if (existingEmail[0]) {
    throw Object.assign(new Error('An account with this email already exists'), {
      statusCode: 409,
    });
  }

  let username = (
    input.username?.trim().toLowerCase() ||
    email.split('@')[0].replace(/[^a-z0-9_]/g, '_').slice(0, 20) ||
    'user'
  ).slice(0, 24);
  if (username.length < 3) username = `${username}_user`;

  const existingUsername = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.username, username))
    .limit(1);
  if (existingUsername[0]) {
    throw Object.assign(new Error('Username is already taken'), { statusCode: 409 });
  }

  const [created] = await db
    .insert(profiles)
    .values({
      uid: `local:${crypto.randomUUID()}`,
      email,
      passwordHash: hashPassword(input.password),
      username,
      displayName: input.displayName.trim().slice(0, 60),
      bio: '',
      isAdmin: Boolean(input.isAdmin),
      isBanned: false,
      status: 'offline',
    })
    .returning();

  await getOrCreateSettings(created.id);
  const all = await listAdminUsers();
  return all.find((u) => u.id === created.id)!;
}

export async function updateAdminUser(
  userId: string,
  patch: {
    displayName?: string;
    username?: string;
    bio?: string;
    newPassword?: string;
    isAdmin?: boolean;
    isBanned?: boolean;
  },
  actorProfileId?: string
): Promise<AdminManagedUser> {
  const existing = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!existing[0]) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  if (patch.isAdmin === false && actorProfileId && actorProfileId === userId) {
    throw Object.assign(new Error('You cannot revoke your own admin access'), {
      statusCode: 400,
    });
  }
  if (patch.isBanned === true && actorProfileId && actorProfileId === userId) {
    throw Object.assign(new Error('You cannot suspend your own active admin account'), {
      statusCode: 400,
    });
  }

  const updates: Partial<typeof profiles.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.displayName !== undefined) {
    updates.displayName = patch.displayName.trim().slice(0, 60);
  }
  if (patch.bio !== undefined) {
    updates.bio = patch.bio.trim().slice(0, 240);
  }
  if (patch.username !== undefined) {
    const normalized = patch.username.trim().toLowerCase();
    const conflict = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.username, normalized))
      .limit(1);
    if (conflict[0] && conflict[0].id !== userId) {
      throw Object.assign(new Error('Username is already taken by another user'), {
        statusCode: 409,
      });
    }
    updates.username = normalized;
  }
  if (patch.newPassword) {
    updates.passwordHash = hashPassword(patch.newPassword);
  }
  if (patch.isAdmin !== undefined) {
    updates.isAdmin = patch.isAdmin;
  }
  if (patch.isBanned !== undefined) {
    updates.isBanned = patch.isBanned;
    if (patch.isBanned) {
      updates.status = 'offline';
    }
  }

  await db.update(profiles).set(updates).where(eq(profiles.id, userId));

  if (patch.isBanned) {
    disconnectUserSockets(userId, 'Account suspended by administrator');
  }

  const refreshed = await listAdminUsers();
  const match = refreshed.find((u) => u.id === userId);
  if (!match) {
    throw Object.assign(new Error('User not found after update'), { statusCode: 404 });
  }
  return match;
}

export async function deleteAdminUser(userId: string, actorProfileId?: string): Promise<void> {
  if (actorProfileId && actorProfileId === userId) {
    throw Object.assign(new Error('You cannot delete your own active admin account'), {
      statusCode: 400,
    });
  }
  const existing = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!existing[0]) {
    throw Object.assign(new Error('User not found'), { statusCode: 404 });
  }

  const memberships = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId));

  await db.delete(profiles).where(eq(profiles.id, userId));

  // Clean up orphaned direct conversations with <= 1 remaining member
  const convIds = memberships.map((m) => m.conversationId);
  if (convIds.length > 0) {
    const convRows = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds));

    for (const conv of convRows) {
      if (conv.type === 'direct') {
        const [{ count }] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, conv.id));
        if (count <= 1) {
          await db.delete(conversations).where(eq(conversations.id, conv.id));
        }
      }
    }
  }
}

export async function listAdminConversations(): Promise<AdminManagedConversation[]> {
  const convRows = await db
    .select()
    .from(conversations)
    .orderBy(desc(conversations.lastMessageAt))
    .limit(100);

  if (convRows.length === 0) return [];
  const convIds = convRows.map((c) => c.id);

  const [memberRows, msgCounts] = await Promise.all([
    db
      .select({
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        role: conversationMembers.role,
        username: profiles.username,
        displayName: profiles.displayName,
      })
      .from(conversationMembers)
      .innerJoin(profiles, eq(conversationMembers.userId, profiles.id))
      .where(inArray(conversationMembers.conversationId, convIds)),
    db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`count(*)::int`,
      })
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .groupBy(messages.conversationId),
  ]);

  const msgMap = new Map(msgCounts.map((m) => [m.conversationId, m.count]));
  const membersMap = new Map<string, AdminManagedConversation['members']>();
  for (const m of memberRows) {
    const arr = membersMap.get(m.conversationId) || [];
    arr.push({
      userId: m.userId,
      username: m.username,
      displayName: m.displayName,
      role: m.role,
    });
    membersMap.set(m.conversationId, arr);
  }

  return convRows.map((c) => {
    const members = membersMap.get(c.id) || [];
    return {
      id: c.id,
      type: c.type as 'direct' | 'group',
      name: c.name,
      description: c.description,
      memberCount: members.length,
      messageCount: msgMap.get(c.id) ?? 0,
      members,
      lastMessageAt: c.lastMessageAt.toISOString(),
      createdAt: c.createdAt.toISOString(),
    };
  });
}

export async function updateAdminGroupName(
  conversationId: string,
  name: string
): Promise<void> {
  const existing = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!existing[0]) {
    throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  }
  await db
    .update(conversations)
    .set({ name: name.trim().slice(0, 80), updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));
}

export async function deleteAdminConversation(conversationId: string): Promise<void> {
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!existing[0]) {
    throw Object.assign(new Error('Conversation not found'), { statusCode: 404 });
  }
  await db.delete(conversations).where(eq(conversations.id, conversationId));
}

export async function listAdminMessages(conversationId?: string): Promise<AdminManagedMessage[]> {
  const query = db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      convType: conversations.type,
      convName: conversations.name,
      senderId: messages.senderId,
      senderUsername: profiles.username,
      senderDisplayName: profiles.displayName,
      content: messages.content,
      messageType: messages.messageType,
      isEdited: messages.isEdited,
      deletedAt: messages.deletedAt,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(profiles, eq(messages.senderId, profiles.id));

  const rows = conversationId
    ? await query
        .where(eq(messages.conversationId, conversationId))
        .orderBy(desc(messages.createdAt))
        .limit(80)
    : await query.orderBy(desc(messages.createdAt)).limit(80);

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversationId,
    conversationLabel:
      r.convType === 'group' ? r.convName || 'Unnamed Group' : `Direct (${r.conversationId.slice(0, 8)})`,
    senderId: r.senderId,
    senderUsername: r.senderUsername,
    senderDisplayName: r.senderDisplayName,
    content: r.content,
    messageType: r.messageType,
    isEdited: r.isEdited,
    deletedAt: toIso(r.deletedAt),
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function deleteAdminMessage(messageId: string): Promise<void> {
  const existing = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.id, messageId))
    .limit(1);
  if (!existing[0]) {
    throw Object.assign(new Error('Message not found'), { statusCode: 404 });
  }
  await db.delete(messages).where(eq(messages.id, messageId));
}

export async function addAdminConversationMember(
  conversationId: string,
  userId: string
): Promise<void> {
  const conv = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv[0] || conv[0].type !== 'group') {
    throw Object.assign(new Error('Group conversation not found'), { statusCode: 404 });
  }
  await db
    .insert(conversationMembers)
    .values({ conversationId, userId, role: 'member' })
    .onConflictDoNothing();
  await broadcastToConversation(conversationId, {
    type: 'conversation:updated',
    conversationId,
  });
}

export async function removeAdminConversationMember(
  conversationId: string,
  userId: string
): Promise<void> {
  await db
    .delete(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId)
      )
    );
  await broadcastToConversation(conversationId, {
    type: 'conversation:updated',
    conversationId,
  });
}

export async function sendAdminSystemMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<void> {
  const [sender] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, senderId))
    .limit(1);
  if (!sender) {
    throw Object.assign(new Error('Sender profile not found'), { statusCode: 404 });
  }

  const now = new Date();
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId,
      senderId,
      content: content.trim().slice(0, 2000),
      messageType: 'system',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db
    .update(conversations)
    .set({ lastMessageAt: now, updatedAt: now })
    .where(eq(conversations.id, conversationId));

  await broadcastToConversation(conversationId, {
    type: 'message:created',
    message: {
      id: inserted.id,
      clientMessageId: null,
      conversationId: inserted.conversationId,
      senderId: inserted.senderId,
      sender: {
        id: sender.id,
        username: sender.username,
        displayName: sender.displayName,
        avatarUrl: sender.avatarUrl,
      },
      replyToId: null,
      replyTo: null,
      content: inserted.content,
      messageType: 'system',
      isEdited: false,
      deletedAt: null,
      attachments: [],
      reads: [],
      createdAt: inserted.createdAt.toISOString(),
      updatedAt: inserted.updatedAt.toISOString(),
    },
  });
}

export async function listAdminAttachments(): Promise<AdminAttachmentItem[]> {
  const rows = await db
    .select({
      id: messageAttachments.id,
      conversationId: messageAttachments.conversationId,
      uploaderId: messageAttachments.uploaderId,
      uploaderUsername: profiles.username,
      fileName: messageAttachments.fileName,
      mimeType: messageAttachments.mimeType,
      fileSize: messageAttachments.fileSize,
      isImage: messageAttachments.isImage,
      createdAt: messageAttachments.createdAt,
    })
    .from(messageAttachments)
    .innerJoin(profiles, eq(messageAttachments.uploaderId, profiles.id))
    .orderBy(desc(messageAttachments.createdAt))
    .limit(100);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function deleteAdminAttachment(attachmentId: string): Promise<void> {
  const rows = await db
    .select()
    .from(messageAttachments)
    .where(eq(messageAttachments.id, attachmentId))
    .limit(1);
  if (!rows[0]) {
    throw Object.assign(new Error('Attachment not found'), { statusCode: 404 });
  }
  const safeKey = path.basename(rows[0].storageKey);
  const fullPath = path.join(process.cwd(), 'uploads', 'attachments', safeKey);
  await db.delete(messageAttachments).where(eq(messageAttachments.id, attachmentId));
  try {
    if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
  } catch {
    // ignore file unlink failure
  }
}

export async function listAdminNotifications(): Promise<AdminNotificationItem[]> {
  const rows = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      recipientUsername: profiles.username,
      type: notifications.type,
      title: notifications.title,
      body: notifications.body,
      isRead: notifications.isRead,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(profiles, eq(notifications.userId, profiles.id))
    .orderBy(desc(notifications.createdAt))
    .limit(100);

  return rows.map((r) => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function broadcastAdminNotification(input: {
  title: string;
  body: string;
  actorId: string;
  targetUserId?: string;
}): Promise<number> {
  const targets = input.targetUserId
    ? await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, input.targetUserId))
    : await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.isBanned, false));

  if (targets.length === 0) return 0;

  const inserted = await db
    .insert(notifications)
    .values(
      targets.map((t) => ({
        userId: t.id,
        actorId: input.actorId,
        type: 'system_broadcast',
        title: input.title.trim().slice(0, 120),
        body: input.body.trim().slice(0, 300),
      }))
    )
    .returning();

  for (const row of inserted) {
    broadcastToUsers([row.userId], {
      type: 'notification:created',
      notification: {
        id: row.id,
        userId: row.userId,
        conversationId: row.conversationId,
        actorId: row.actorId,
        type: row.type,
        title: row.title,
        body: row.body,
        isRead: row.isRead,
        createdAt: row.createdAt.toISOString(),
      },
    });
  }

  return inserted.length;
}

export async function deleteAdminNotification(notificationId: string): Promise<void> {
  await db.delete(notifications).where(eq(notifications.id, notificationId));
}

export async function purgeSoftDeletedMessages(): Promise<number> {
  const deleted = await db
    .delete(messages)
    .where(isNotNull(messages.deletedAt))
    .returning({ id: messages.id });
  return deleted.length;
}

export async function purgeReadNotifications(): Promise<number> {
  const deleted = await db
    .delete(notifications)
    .where(eq(notifications.isRead, true))
    .returning({ id: notifications.id });
  return deleted.length;
}

export { broadcastToAllConnected };

