import { and, desc, eq, gt, ilike, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import {
  conversationMembers,
  conversations,
  messageAttachments,
  messageReads,
  messages,
  notifications,
  profiles,
  userSettings,
} from '../../db/schema.ts';
import type {
  AppNotification,
  ChatMessage,
  ConversationMemberInfo,
  ConversationSummary,
  MessageAttachment,
} from '../../types/chat.ts';
import { toPublicProfile } from './profileService.ts';

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function requireConversationMember(conversationId: string, userId: string) {
  const rows = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userId, userId)
      )
    )
    .limit(1);

  if (rows.length === 0) {
    throw new HttpError(403, 'You do not have access to this conversation');
  }
  return rows[0];
}

export async function requireConversationAdmin(conversationId: string, userId: string) {
  const convRows = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (convRows.length === 0) {
    throw new HttpError(404, 'Conversation not found');
  }
  if (convRows[0].type !== 'group') {
    throw new HttpError(400, 'Group administration is only available for group conversations');
  }
  const member = await requireConversationMember(conversationId, userId);
  if (member.role !== 'admin') {
    throw new HttpError(403, 'Only group administrators can perform this action');
  }
  return { conversation: convRows[0], member };
}

export async function getConversationMemberIds(conversationId: string): Promise<string[]> {
  try {
    const rows = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    return rows.map((r) => r.userId);
  } catch (error) {
    console.error('getConversationMemberIds failed:', error);
    throw new Error('Failed to load conversation members', { cause: error });
  }
}

export async function getConversationPeerIds(userId: string): Promise<string[]> {
  try {
    const myConvs = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId));

    if (myConvs.length === 0) return [];
    const convIds = myConvs.map((c) => c.conversationId);
    const members = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          inArray(conversationMembers.conversationId, convIds),
          ne(conversationMembers.userId, userId)
        )
      );
    return Array.from(new Set(members.map((m) => m.userId)));
  } catch (error) {
    console.error('getConversationPeerIds failed:', error);
    return [];
  }
}

export async function listUserConversations(userId: string): Promise<ConversationSummary[]> {
  try {
    const myMemberships = await db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId));

    if (myMemberships.length === 0) return [];

    const convIds = myMemberships.map((m) => m.conversationId);
    const membershipByConv = new Map(myMemberships.map((m) => [m.conversationId, m]));

    const convRows = await db
      .select()
      .from(conversations)
      .where(inArray(conversations.id, convIds));

    const allMembersRows = await db
      .select({
        member: conversationMembers,
        profile: profiles,
        settings: userSettings,
      })
      .from(conversationMembers)
      .innerJoin(profiles, eq(conversationMembers.userId, profiles.id))
      .leftJoin(userSettings, eq(profiles.id, userSettings.userId))
      .where(inArray(conversationMembers.conversationId, convIds));

    const membersByConv = new Map<string, ConversationMemberInfo[]>();
    for (const row of allMembersRows) {
      const list = membersByConv.get(row.member.conversationId) || [];
      list.push({
        id: row.member.id,
        userId: row.member.userId,
        role: (row.member.role as 'admin' | 'member') || 'member',
        joinedAt: row.member.joinedAt.toISOString(),
        profile: toPublicProfile(row.profile, row.settings),
      });
      membersByConv.set(row.member.conversationId, list);
    }

    // Fetch latest message and unread count per conversation
    const summaries: ConversationSummary[] = [];

    for (const conv of convRows) {
      const myMem = membershipByConv.get(conv.id)!;
      const members = membersByConv.get(conv.id) || [];

      const latestMsgRows = await db
        .select({
          msg: messages,
          senderName: profiles.displayName,
        })
        .from(messages)
        .innerJoin(profiles, eq(messages.senderId, profiles.id))
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      const unreadRows = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conv.id),
            gt(messages.createdAt, myMem.lastReadAt),
            ne(messages.senderId, userId),
            isNull(messages.deletedAt)
          )
        );

      const peerMember =
        conv.type === 'direct'
          ? members.find((m) => m.userId !== userId) || members[0] || null
          : null;

      const latest = latestMsgRows[0];

      summaries.push({
        id: conv.id,
        type: conv.type as 'direct' | 'group',
        name: conv.name,
        description: conv.description,
        avatarUrl: conv.avatarUrl,
        createdBy: conv.createdBy,
        lastMessageAt: conv.lastMessageAt.toISOString(),
        createdAt: conv.createdAt.toISOString(),
        myMembership: {
          role: (myMem.role as 'admin' | 'member') || 'member',
          isPinned: myMem.isPinned,
          isMuted: myMem.isMuted,
          isArchived: myMem.isArchived,
          lastReadAt: myMem.lastReadAt.toISOString(),
        },
        unreadCount: unreadRows[0]?.count ?? 0,
        lastMessage: latest
          ? {
              id: latest.msg.id,
              senderId: latest.msg.senderId,
              senderName: latest.senderName,
              content: latest.msg.deletedAt ? 'Message deleted' : latest.msg.content,
              messageType: latest.msg.messageType,
              deletedAt: latest.msg.deletedAt ? latest.msg.deletedAt.toISOString() : null,
              createdAt: latest.msg.createdAt.toISOString(),
            }
          : null,
        members,
        peer: peerMember ? peerMember.profile : null,
      });
    }

    summaries.sort((a, b) => {
      if (a.myMembership.isPinned !== b.myMembership.isPinned) {
        return a.myMembership.isPinned ? -1 : 1;
      }
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    return summaries;
  } catch (error) {
    console.error('listUserConversations failed:', error);
    throw new Error('Failed to load conversations', { cause: error });
  }
}

export async function getConversationSummary(
  conversationId: string,
  userId: string
): Promise<ConversationSummary> {
  await requireConversationMember(conversationId, userId);
  const all = await listUserConversations(userId);
  const found = all.find((c) => c.id === conversationId);
  if (!found) {
    throw new HttpError(404, 'Conversation not found');
  }
  return found;
}

export async function createOrGetDirectConversation(
  currentUserId: string,
  targetUserId: string
): Promise<ConversationSummary> {
  try {
    const targetRows = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.id, targetUserId))
      .limit(1);

    if (targetRows.length === 0) {
      throw new HttpError(404, 'Target user not found');
    }

    const sortedIds = [currentUserId, targetUserId].sort();
    const directKey = `${sortedIds[0]}:${sortedIds[1]}`;

    const existing = await db
      .select()
      .from(conversations)
      .where(eq(conversations.directKey, directKey))
      .limit(1);

    let convId: string;
    if (existing.length > 0) {
      convId = existing[0].id;
    } else {
      const inserted = await db
        .insert(conversations)
        .values({
          type: 'direct',
          directKey,
          createdBy: currentUserId,
          lastMessageAt: new Date(),
        })
        .onConflictDoNothing({ target: conversations.directKey })
        .returning();

      if (inserted[0]) {
        convId = inserted[0].id;
      } else {
        const refetch = await db
          .select()
          .from(conversations)
          .where(eq(conversations.directKey, directKey))
          .limit(1);
        convId = refetch[0].id;
      }

      const uniqueUsers = Array.from(new Set([currentUserId, targetUserId]));
      await db
        .insert(conversationMembers)
        .values(
          uniqueUsers.map((uid) => ({
            conversationId: convId,
            userId: uid,
            role: 'member',
          }))
        )
        .onConflictDoNothing();
    }

    return getConversationSummary(convId, currentUserId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('createOrGetDirectConversation failed:', error);
    throw new Error('Failed to create direct conversation', { cause: error });
  }
}

export async function createGroupConversation(
  creatorId: string,
  input: { name: string; description: string; memberIds: string[] }
): Promise<ConversationSummary> {
  try {
    const uniqueOtherIds = Array.from(
      new Set(input.memberIds.filter((id) => id !== creatorId))
    );

    if (uniqueOtherIds.length > 0) {
      const validUsers = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(inArray(profiles.id, uniqueOtherIds));
      if (validUsers.length !== uniqueOtherIds.length) {
        throw new HttpError(400, 'One or more selected users do not exist');
      }
    }

    const [conv] = await db
      .insert(conversations)
      .values({
        type: 'group',
        name: input.name,
        description: input.description || '',
        createdBy: creatorId,
        lastMessageAt: new Date(),
      })
      .returning();

    await db.insert(conversationMembers).values([
      {
        conversationId: conv.id,
        userId: creatorId,
        role: 'admin',
      },
      ...uniqueOtherIds.map((uid) => ({
        conversationId: conv.id,
        userId: uid,
        role: 'member',
      })),
    ]);

    await db.insert(messages).values({
      conversationId: conv.id,
      senderId: creatorId,
      content: `created the group "${input.name}"`,
      messageType: 'system',
    });

    if (uniqueOtherIds.length > 0) {
      const [creator] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.id, creatorId))
        .limit(1);

      await db.insert(notifications).values(
        uniqueOtherIds.map((uid) => ({
          userId: uid,
          conversationId: conv.id,
          actorId: creatorId,
          type: 'group_invite',
          title: `Added to ${input.name}`,
          body: `${creator?.displayName || 'Someone'} added you to ${input.name}`,
        }))
      );
    }

    return getConversationSummary(conv.id, creatorId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('createGroupConversation failed:', error);
    throw new Error('Failed to create group conversation', { cause: error });
  }
}

export async function updateGroupConversation(
  conversationId: string,
  actorId: string,
  patch: { name?: string; description?: string; avatarUrl?: string | null }
): Promise<ConversationSummary> {
  try {
    await requireConversationAdmin(conversationId, actorId);
    await db
      .update(conversations)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId));

    return getConversationSummary(conversationId, actorId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('updateGroupConversation failed:', error);
    throw new Error('Failed to update group settings', { cause: error });
  }
}

export async function addGroupMembers(
  conversationId: string,
  actorId: string,
  memberIds: string[]
): Promise<ConversationSummary> {
  try {
    const { conversation } = await requireConversationAdmin(conversationId, actorId);
    const uniqueIds = Array.from(new Set(memberIds));

    const validUsers = await db
      .select({ id: profiles.id, displayName: profiles.displayName })
      .from(profiles)
      .where(inArray(profiles.id, uniqueIds));

    if (validUsers.length === 0) {
      throw new HttpError(400, 'No valid users selected');
    }

    const existing = await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          inArray(
            conversationMembers.userId,
            validUsers.map((u) => u.id)
          )
        )
      );
    const existingSet = new Set(existing.map((e) => e.userId));
    const toAdd = validUsers.filter((u) => !existingSet.has(u.id));

    if (toAdd.length > 0) {
      await db.insert(conversationMembers).values(
        toAdd.map((u) => ({
          conversationId,
          userId: u.id,
          role: 'member',
        }))
      );

      const names = toAdd.map((u) => u.displayName).join(', ');
      await db.insert(messages).values({
        conversationId,
        senderId: actorId,
        content: `added ${names} to the group`,
        messageType: 'system',
      });

      await db
        .update(conversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));

      await db.insert(notifications).values(
        toAdd.map((u) => ({
          userId: u.id,
          conversationId,
          actorId,
          type: 'group_invite',
          title: `Added to ${conversation.name || 'a group'}`,
          body: `You were added to ${conversation.name || 'this group conversation'}`,
        }))
      );
    }

    return getConversationSummary(conversationId, actorId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('addGroupMembers failed:', error);
    throw new Error('Failed to add group members', { cause: error });
  }
}

export async function removeGroupMember(
  conversationId: string,
  actorId: string,
  targetUserId: string
) {
  try {
    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    if (!convRows[0]) throw new HttpError(404, 'Conversation not found');
    if (convRows[0].type !== 'group') {
      throw new HttpError(400, 'Cannot remove members from a direct conversation');
    }

    const actorMem = await requireConversationMember(conversationId, actorId);
    const isSelfLeave = actorId === targetUserId;

    if (!isSelfLeave && actorMem.role !== 'admin') {
      throw new HttpError(403, 'Only administrators can remove other members');
    }

    const targetRows = await db
      .select({
        member: conversationMembers,
        displayName: profiles.displayName,
      })
      .from(conversationMembers)
      .innerJoin(profiles, eq(conversationMembers.userId, profiles.id))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, targetUserId)
        )
      )
      .limit(1);

    if (!targetRows[0]) {
      throw new HttpError(404, 'Member not found in conversation');
    }

    await db
      .delete(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, targetUserId)
        )
      );

    // Ensure at least one admin remains if other members exist
    const remaining = await db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));

    if (remaining.length > 0 && !remaining.some((m) => m.role === 'admin')) {
      await db
        .update(conversationMembers)
        .set({ role: 'admin' })
        .where(eq(conversationMembers.id, remaining[0].id));
    }

    if (remaining.length > 0) {
      await db.insert(messages).values({
        conversationId,
        senderId: actorId,
        content: isSelfLeave
          ? 'left the group'
          : `removed ${targetRows[0].displayName} from the group`,
        messageType: 'system',
      });
      await db
        .update(conversations)
        .set({ lastMessageAt: new Date(), updatedAt: new Date() })
        .where(eq(conversations.id, conversationId));
    }

    return { left: isSelfLeave, remainingUserIds: remaining.map((r) => r.userId) };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('removeGroupMember failed:', error);
    throw new Error('Failed to remove member', { cause: error });
  }
}

export async function updateGroupMemberRole(
  conversationId: string,
  actorId: string,
  targetUserId: string,
  role: 'admin' | 'member'
): Promise<ConversationSummary> {
  try {
    await requireConversationAdmin(conversationId, actorId);
    const target = await requireConversationMember(conversationId, targetUserId);

    if (target.userId === actorId && role !== 'admin') {
      const admins = await db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            eq(conversationMembers.role, 'admin')
          )
        );
      if (admins.length <= 1) {
        throw new HttpError(400, 'Assign another admin before stepping down');
      }
    }

    await db
      .update(conversationMembers)
      .set({ role })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, targetUserId)
        )
      );

    return getConversationSummary(conversationId, actorId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('updateGroupMemberRole failed:', error);
    throw new Error('Failed to update member role', { cause: error });
  }
}

export async function updateMembershipPreferences(
  conversationId: string,
  userId: string,
  patch: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean }
): Promise<ConversationSummary> {
  try {
    await requireConversationMember(conversationId, userId);
    await db
      .update(conversationMembers)
      .set(patch)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      );
    return getConversationSummary(conversationId, userId);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('updateMembershipPreferences failed:', error);
    throw new Error('Failed to update conversation preferences', { cause: error });
  }
}

async function hydrateMessages(rawRows: (typeof messages.$inferSelect)[]): Promise<ChatMessage[]> {
  if (rawRows.length === 0) return [];

  const msgIds = rawRows.map((m) => m.id);
  const senderIds = Array.from(new Set(rawRows.map((m) => m.senderId)));
  const replyIds = Array.from(
    new Set(rawRows.map((m) => m.replyToId).filter((id): id is string => Boolean(id)))
  );

  const [senderRows, attachmentRows, readRows, replyRows] = await Promise.all([
    db.select().from(profiles).where(inArray(profiles.id, senderIds)),
    db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, msgIds)),
    db.select().from(messageReads).where(inArray(messageReads.messageId, msgIds)),
    replyIds.length > 0
      ? db
          .select({
            msg: messages,
            senderName: profiles.displayName,
          })
          .from(messages)
          .innerJoin(profiles, eq(messages.senderId, profiles.id))
          .where(inArray(messages.id, replyIds))
      : Promise.resolve([]),
  ]);

  const senderMap = new Map(senderRows.map((s) => [s.id, s]));
  const replyMap = new Map(replyRows.map((r) => [r.msg.id, r]));

  const attachmentsByMsg = new Map<string, MessageAttachment[]>();
  for (const att of attachmentRows) {
    if (!att.messageId) continue;
    const list = attachmentsByMsg.get(att.messageId) || [];
    list.push({
      id: att.id,
      messageId: att.messageId,
      conversationId: att.conversationId,
      uploaderId: att.uploaderId,
      fileName: att.fileName,
      mimeType: att.mimeType,
      fileSize: att.fileSize,
      isImage: att.isImage,
      url: `/api/attachments/${att.id}`,
      createdAt: att.createdAt.toISOString(),
    });
    attachmentsByMsg.set(att.messageId, list);
  }

  const readsByMsg = new Map<string, { userId: string; readAt: string }[]>();
  for (const read of readRows) {
    const list = readsByMsg.get(read.messageId) || [];
    list.push({ userId: read.userId, readAt: read.readAt.toISOString() });
    readsByMsg.set(read.messageId, list);
  }

  return rawRows.map((m) => {
    const sender = senderMap.get(m.senderId);
    const reply = m.replyToId ? replyMap.get(m.replyToId) : undefined;
    const isDeleted = Boolean(m.deletedAt);

    return {
      id: m.id,
      clientMessageId: m.clientMessageId,
      conversationId: m.conversationId,
      senderId: m.senderId,
      sender: {
        id: m.senderId,
        username: sender?.username || 'unknown',
        displayName: sender?.displayName || 'Unknown User',
        avatarUrl: sender?.avatarUrl || null,
      },
      replyToId: m.replyToId,
      replyTo: reply
        ? {
            id: reply.msg.id,
            senderId: reply.msg.senderId,
            senderName: reply.senderName,
            content: reply.msg.deletedAt ? 'Message deleted' : reply.msg.content,
            deletedAt: reply.msg.deletedAt ? reply.msg.deletedAt.toISOString() : null,
          }
        : null,
      content: isDeleted ? '' : m.content,
      messageType: m.messageType as ChatMessage['messageType'],
      isEdited: m.isEdited,
      deletedAt: m.deletedAt ? m.deletedAt.toISOString() : null,
      attachments: isDeleted ? [] : attachmentsByMsg.get(m.id) || [],
      reads: readsByMsg.get(m.id) || [],
      createdAt: m.createdAt.toISOString(),
      updatedAt: m.updatedAt.toISOString(),
    };
  });
}

export async function getConversationMessages(
  conversationId: string,
  userId: string,
  options: { before?: string; limit?: number } = {}
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  try {
    await requireConversationMember(conversationId, userId);
    const limit = Math.min(Math.max(options.limit || 40, 1), 100);

    const conditions = [eq(messages.conversationId, conversationId)];
    if (options.before) {
      const beforeDate = new Date(options.before);
      if (!Number.isNaN(beforeDate.getTime())) {
        conditions.push(lt(messages.createdAt, beforeDate));
      }
    }

    const rows = await db
      .select()
      .from(messages)
      .where(and(...conditions))
      .orderBy(desc(messages.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const sliced = rows.slice(0, limit).reverse();
    const hydrated = await hydrateMessages(sliced);

    return { messages: hydrated, hasMore };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('getConversationMessages failed:', error);
    throw new Error('Failed to load messages', { cause: error });
  }
}

export async function sendMessage(
  conversationId: string,
  senderId: string,
  input: {
    content: string;
    replyToId?: string | null;
    clientMessageId?: string;
    attachmentIds?: string[];
  }
): Promise<{ message: ChatMessage; createdNotifications: AppNotification[] }> {
  try {
    await requireConversationMember(conversationId, senderId);
    const trimmedContent = input.content.trim();
    const attIds = input.attachmentIds || [];

    if (!trimmedContent && attIds.length === 0) {
      throw new HttpError(400, 'Message cannot be empty');
    }

    // Idempotent duplicate check using clientMessageId
    if (input.clientMessageId) {
      const existing = await db
        .select()
        .from(messages)
        .where(
          and(
            eq(messages.conversationId, conversationId),
            eq(messages.clientMessageId, input.clientMessageId)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        const [hydrated] = await hydrateMessages([existing[0]]);
        return { message: hydrated, createdNotifications: [] };
      }
    }

    if (input.replyToId) {
      const replyTarget = await db
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(eq(messages.id, input.replyToId), eq(messages.conversationId, conversationId))
        )
        .limit(1);
      if (replyTarget.length === 0) {
        throw new HttpError(400, 'Reply target message not found in this conversation');
      }
    }

    let attachedRows: (typeof messageAttachments.$inferSelect)[] = [];
    if (attIds.length > 0) {
      attachedRows = await db
        .select()
        .from(messageAttachments)
        .where(
          and(
            inArray(messageAttachments.id, attIds),
            eq(messageAttachments.conversationId, conversationId),
            eq(messageAttachments.uploaderId, senderId),
            isNull(messageAttachments.messageId)
          )
        );
      if (attachedRows.length !== attIds.length) {
        throw new HttpError(400, 'One or more attachments are invalid or already linked');
      }
    }

    let messageType: 'text' | 'image' | 'file' = 'text';
    if (attachedRows.length > 0) {
      messageType = attachedRows.every((a) => a.isImage) ? 'image' : 'file';
    }

    const now = new Date();
    const [inserted] = await db
      .insert(messages)
      .values({
        conversationId,
        senderId,
        replyToId: input.replyToId || null,
        clientMessageId: input.clientMessageId || null,
        content: trimmedContent,
        messageType,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (attachedRows.length > 0) {
      await db
        .update(messageAttachments)
        .set({ messageId: inserted.id })
        .where(
          inArray(
            messageAttachments.id,
            attachedRows.map((a) => a.id)
          )
        );
    }

    await db
      .update(conversations)
      .set({ lastMessageAt: now, updatedAt: now })
      .where(eq(conversations.id, conversationId));

    // Mark sender's own lastReadAt up to this message
    await db
      .update(conversationMembers)
      .set({ lastReadAt: now })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, senderId)
        )
      );

    // Create notifications for other non-muted members
    const convRows = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    const conv = convRows[0];

    const [senderProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, senderId))
      .limit(1);

    const otherMembers = await db
      .select({
        member: conversationMembers,
        settings: userSettings,
      })
      .from(conversationMembers)
      .leftJoin(userSettings, eq(conversationMembers.userId, userSettings.userId))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          ne(conversationMembers.userId, senderId)
        )
      );

    let createdNotifications: AppNotification[] = [];
    const notifyTargets = otherMembers.filter(
      (m) => !m.member.isMuted && (m.settings ? m.settings.inAppNotifications : true)
    );

    if (notifyTargets.length > 0) {
      const preview =
        trimmedContent ||
        (attachedRows.length > 0 ? `Sent ${attachedRows[0].fileName}` : 'New message');
      const title =
        conv?.type === 'group'
          ? `${senderProfile?.displayName || 'Someone'} in ${conv.name || 'Group'}`
          : senderProfile?.displayName || 'New message';

      const notifRows = await db
        .insert(notifications)
        .values(
          notifyTargets.map((m) => ({
            userId: m.member.userId,
            conversationId,
            actorId: senderId,
            type: 'message',
            title,
            body: preview.slice(0, 140),
          }))
        )
        .returning();

      createdNotifications = notifRows.map((n) => ({
        id: n.id,
        userId: n.userId,
        conversationId: n.conversationId,
        actorId: n.actorId,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        createdAt: n.createdAt.toISOString(),
      }));
    }

    const [hydrated] = await hydrateMessages([inserted]);
    return { message: hydrated, createdNotifications };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('sendMessage failed:', error);
    throw new Error('Failed to send message', { cause: error });
  }
}

export async function editMessage(
  messageId: string,
  userId: string,
  content: string
): Promise<ChatMessage> {
  try {
    const rows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Message not found');
    const msg = rows[0];

    await requireConversationMember(msg.conversationId, userId);

    if (msg.senderId !== userId) {
      throw new HttpError(403, 'You can only edit your own messages');
    }
    if (msg.deletedAt) {
      throw new HttpError(400, 'Cannot edit a deleted message');
    }
    if (msg.messageType === 'system') {
      throw new HttpError(400, 'System messages cannot be edited');
    }

    const [updated] = await db
      .update(messages)
      .set({
        content: content.trim(),
        isEdited: true,
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    const [hydrated] = await hydrateMessages([updated]);
    return hydrated;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('editMessage failed:', error);
    throw new Error('Failed to edit message', { cause: error });
  }
}

export async function deleteMessage(messageId: string, userId: string) {
  try {
    const rows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
    if (!rows[0]) throw new HttpError(404, 'Message not found');
    const msg = rows[0];

    const membership = await requireConversationMember(msg.conversationId, userId);
    const isOwner = msg.senderId === userId;
    const isGroupAdmin = membership.role === 'admin';

    if (!isOwner && !isGroupAdmin) {
      throw new HttpError(403, 'You do not have permission to delete this message');
    }
    if (msg.deletedAt) {
      return { conversationId: msg.conversationId, messageId: msg.id, deletedAt: msg.deletedAt.toISOString() };
    }

    const now = new Date();
    await db
      .update(messages)
      .set({
        deletedAt: now,
        content: '',
        updatedAt: now,
      })
      .where(eq(messages.id, messageId));

    return {
      conversationId: msg.conversationId,
      messageId: msg.id,
      deletedAt: now.toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('deleteMessage failed:', error);
    throw new Error('Failed to delete message', { cause: error });
  }
}

export async function markConversationRead(conversationId: string, userId: string) {
  try {
    const member = await requireConversationMember(conversationId, userId);
    const now = new Date();

    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);
    const sendReceipts = settingsRows[0] ? settingsRows[0].sendReadReceipts : true;

    const unreadMessages = await db
      .select({ id: messages.id })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          gt(messages.createdAt, member.lastReadAt),
          ne(messages.senderId, userId),
          isNull(messages.deletedAt)
        )
      );

    await db
      .update(conversationMembers)
      .set({ lastReadAt: now })
      .where(eq(conversationMembers.id, member.id));

    // Mark conversation notifications as read
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.conversationId, conversationId),
          eq(notifications.isRead, false)
        )
      );

    let readMessageIds: string[] = [];
    if (sendReceipts && unreadMessages.length > 0) {
      readMessageIds = unreadMessages.map((m) => m.id);
      await db
        .insert(messageReads)
        .values(
          readMessageIds.map((mid) => ({
            messageId: mid,
            userId,
            readAt: now,
          }))
        )
        .onConflictDoNothing();
    }

    return {
      conversationId,
      userId,
      messageIds: readMessageIds,
      readAt: now.toISOString(),
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('markConversationRead failed:', error);
    throw new Error('Failed to mark conversation as read', { cause: error });
  }
}

export async function searchAuthorizedMessages(
  userId: string,
  query: string,
  conversationId?: string
): Promise<ChatMessage[]> {
  try {
    const q = query.trim();
    if (!q) return [];

    const myMemberships = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId));

    const allowedIds = myMemberships.map((m) => m.conversationId);
    if (allowedIds.length === 0) return [];

    if (conversationId && !allowedIds.includes(conversationId)) {
      throw new HttpError(403, 'You do not have access to this conversation');
    }

    const targetConvIds = conversationId ? [conversationId] : allowedIds;

    const matched = await db
      .select()
      .from(messages)
      .where(
        and(
          inArray(messages.conversationId, targetConvIds),
          isNull(messages.deletedAt),
          ilike(messages.content, `%${q}%`)
        )
      )
      .orderBy(desc(messages.createdAt))
      .limit(30);

    return hydrateMessages(matched);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error('searchAuthorizedMessages failed:', error);
    throw new Error('Failed to search messages', { cause: error });
  }
}

export async function listNotifications(userId: string): Promise<AppNotification[]> {
  try {
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(40);

    return rows.map((n) => ({
      id: n.id,
      userId: n.userId,
      conversationId: n.conversationId,
      actorId: n.actorId,
      type: n.type,
      title: n.title,
      body: n.body,
      isRead: n.isRead,
      createdAt: n.createdAt.toISOString(),
    }));
  } catch (error) {
    console.error('listNotifications failed:', error);
    throw new Error('Failed to load notifications', { cause: error });
  }
}

export async function markNotificationsRead(userId: string, notificationId?: string) {
  try {
    if (notificationId) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
    }
  } catch (error) {
    console.error('markNotificationsRead failed:', error);
    throw new Error('Failed to update notifications', { cause: error });
  }
}
