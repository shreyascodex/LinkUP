import { z } from 'zod';

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-z0-9_]+$/, 'Username can only contain lowercase letters, numbers, and underscores');

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  displayName: z.string().trim().min(1, 'Display name is required').max(60).optional(),
  bio: z.string().trim().max(240, 'Bio cannot exceed 240 characters').optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

export const createDirectConversationSchema = z.object({
  targetUserId: z.string().uuid('Invalid user ID'),
});

export const createGroupConversationSchema = z.object({
  name: z.string().trim().min(2, 'Group name must be at least 2 characters').max(80),
  description: z.string().trim().max(240).optional().default(''),
  memberIds: z.array(z.string().uuid()).min(1, 'Select at least one member').max(50),
});

export const updateGroupConversationSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  description: z.string().trim().max(240).optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

export const updateMembershipPreferencesSchema = z.object({
  isPinned: z.boolean().optional(),
  isMuted: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const addGroupMembersSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(30),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export const createMessageSchema = z.object({
  content: z.string().max(4000).default(''),
  replyToId: z.string().uuid().nullable().optional(),
  clientMessageId: z.string().max(100).optional(),
  attachmentIds: z.array(z.string().uuid()).max(5).optional(),
});

export const editMessageSchema = z.object({
  content: z.string().trim().min(1, 'Message cannot be empty').max(4000),
});

export const updateSettingsSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  showOnlineStatus: z.boolean().optional(),
  showLastSeen: z.boolean().optional(),
  sendReadReceipts: z.boolean().optional(),
  inAppNotifications: z.boolean().optional(),
  browserNotifications: z.boolean().optional(),
  soundEnabled: z.boolean().optional(),
});
