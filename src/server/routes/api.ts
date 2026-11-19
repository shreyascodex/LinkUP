import { Router } from 'express';
import type { Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { messageAttachments } from '../../db/schema.ts';
import {
  addGroupMembersSchema,
  createDirectConversationSchema,
  createGroupConversationSchema,
  createMessageSchema,
  editMessageSchema,
  updateGroupConversationSchema,
  updateMemberRoleSchema,
  updateMembershipPreferencesSchema,
  updateProfileSchema,
  updateSettingsSchema,
} from '../../lib/validations/schemas.ts';
import { requireAuth, type AuthRequest } from '../middleware/auth.ts';
import {
  getOrCreateSettings,
  getProfileById,
  searchUsers,
  toMyProfile,
  updateMyProfile,
  updateUserSettings,
} from '../services/profileService.ts';
import {
  changeLocalPassword,
  loginWithEmail,
  registerWithEmail,
} from '../services/authService.ts';
import { getSiteConfig } from '../services/siteConfigService.ts';
import { adminRouter } from './admin.ts';
import {
  HttpError,
  addGroupMembers,
  createGroupConversation,
  createOrGetDirectConversation,
  deleteMessage,
  editMessage,
  getConversationMemberIds,
  getConversationMessages,
  listNotifications,
  listUserConversations,
  markConversationRead,
  markNotificationsRead,
  removeGroupMember,
  requireConversationMember,
  searchAuthorizedMessages,
  sendMessage,
  updateGroupConversation,
  updateGroupMemberRole,
  updateMembershipPreferences,
} from '../services/chatService.ts';
import { broadcastToConversation, broadcastToUsers } from '../realtime.ts';

const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const ATTACHMENTS_DIR = path.join(UPLOADS_ROOT, 'attachments');
const AVATARS_DIR = path.join(UPLOADS_ROOT, 'avatars');

fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
fs.mkdirSync(AVATARS_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
]);

const ALLOWED_ATTACHMENT_MIME = new Set([
  ...ALLOWED_IMAGE_MIME,
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/zip',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, AVATARS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '.png';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      cb(new Error('Only JPG, PNG, GIF, and WebP images are allowed for avatars'));
      return;
    }
    cb(null, true);
  },
});

const attachmentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, ATTACHMENTS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '') || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
      cb(new Error('Unsupported file type. Allowed: images, PDF, TXT, CSV, ZIP, Office docs.'));
      return;
    }
    cb(null, true);
  },
});

function handleError(res: Response, error: unknown) {
  if (error instanceof HttpError) {
    res.status(error.statusCode).json({ error: error.message });
    return;
  }
  const status = (error as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: (error as Error).message });
    return;
  }
  console.error('API Error:', error);
  res.status(500).json({ error: (error as Error)?.message || 'Internal server error' });
}

function isSafePublicUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.internal') ||
      host.endsWith('.local')
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'linkup-api' });
});

apiRouter.get('/site-config', async (_req, res) => {
  try {
    const config = await getSiteConfig();
    res.json({ config });
  } catch (error) {
    handleError(res, error);
  }
});

// Serve uploaded avatars safely
apiRouter.get('/avatars/:filename', (req, res) => {
  const safeName = path.basename(req.params.filename);
  const fullPath = path.join(AVATARS_DIR, safeName);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Avatar not found' });
    return;
  }
  res.sendFile(fullPath);
});

const registerSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  displayName: z.string().trim().min(1).max(60).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

apiRouter.post('/auth/register', async (req, res) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid registration data' });
      return;
    }
    const result = await registerWithEmail(parsed.data);
    res.status(201).json(result);
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/auth/login', async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid credentials' });
      return;
    }
    const result = await loginWithEmail(parsed.data);
    res.json(result);
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.use('/admin', adminRouter);

apiRouter.use(requireAuth);

apiRouter.post('/auth/change-password', async (req: AuthRequest, res) => {
  try {
    const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';
    if (newPassword.length < 6) {
      res.status(400).json({ error: 'New password must be at least 6 characters' });
      return;
    }
    if (!req.authProfile!.uid.startsWith('local:')) {
      res.status(400).json({ error: 'Password changes are only supported for email accounts' });
      return;
    }
    await changeLocalPassword(req.authProfile!.id, newPassword);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

// Current User Profile
apiRouter.get('/me', async (req: AuthRequest, res) => {
  try {
    const profile = toMyProfile(req.authProfile!);
    const settings = await getOrCreateSettings(profile.id);
    res.json({ profile, settings });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.patch('/me', async (req: AuthRequest, res) => {
  try {
    const parsed = updateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid profile data' });
      return;
    }
    const updated = await updateMyProfile(req.authProfile!.id, parsed.data);
    res.json({ profile: updated });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/me/avatar', avatarUpload.single('file'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No image file provided' });
      return;
    }
    const avatarUrl = `/api/avatars/${req.file.filename}`;
    const updated = await updateMyProfile(req.authProfile!.id, { avatarUrl });
    res.json({ profile: updated, avatarUrl });
  } catch (error) {
    handleError(res, error);
  }
});

// User Discovery & Profiles
apiRouter.get('/users/search', async (req: AuthRequest, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const users = await searchUsers(q, req.authProfile!.id);
    res.json({ users });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.get('/users/:id', async (req: AuthRequest, res) => {
  try {
    const user = await getProfileById(req.params.id);
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user });
  } catch (error) {
    handleError(res, error);
  }
});

// Settings
apiRouter.get('/settings', async (req: AuthRequest, res) => {
  try {
    const settings = await getOrCreateSettings(req.authProfile!.id);
    res.json({ settings });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.patch('/settings', async (req: AuthRequest, res) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid settings' });
      return;
    }
    const settings = await updateUserSettings(req.authProfile!.id, parsed.data);
    res.json({ settings });
  } catch (error) {
    handleError(res, error);
  }
});

// Conversations
apiRouter.get('/conversations', async (req: AuthRequest, res) => {
  try {
    const conversations = await listUserConversations(req.authProfile!.id);
    res.json({ conversations });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/conversations/direct', async (req: AuthRequest, res) => {
  try {
    const parsed = createDirectConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid target user' });
      return;
    }
    const conversation = await createOrGetDirectConversation(
      req.authProfile!.id,
      parsed.data.targetUserId
    );
    await broadcastToConversation(conversation.id, {
      type: 'conversation:updated',
      conversationId: conversation.id,
    });
    res.status(201).json({ conversation });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/conversations/group', async (req: AuthRequest, res) => {
  try {
    const cfg = await getSiteConfig();
    if (!cfg.allowGroupCreation && !req.authProfile!.isAdmin) {
      res.status(403).json({ error: 'Group creation is currently disabled by the administrator.' });
      return;
    }
    const parsed = createGroupConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid group payload' });
      return;
    }
    const conversation = await createGroupConversation(req.authProfile!.id, parsed.data);
    await broadcastToConversation(conversation.id, {
      type: 'conversation:updated',
      conversationId: conversation.id,
    });
    res.status(201).json({ conversation });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.patch('/conversations/:id', async (req: AuthRequest, res) => {
  try {
    const parsed = updateGroupConversationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid group update' });
      return;
    }
    const conversation = await updateGroupConversation(
      req.params.id,
      req.authProfile!.id,
      parsed.data
    );
    await broadcastToConversation(conversation.id, {
      type: 'conversation:updated',
      conversationId: conversation.id,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.patch('/conversations/:id/preferences', async (req: AuthRequest, res) => {
  try {
    const parsed = updateMembershipPreferencesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid preferences' });
      return;
    }
    const conversation = await updateMembershipPreferences(
      req.params.id,
      req.authProfile!.id,
      parsed.data
    );
    res.json({ conversation });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/conversations/:id/members', async (req: AuthRequest, res) => {
  try {
    const parsed = addGroupMembersSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid member list' });
      return;
    }
    const conversation = await addGroupMembers(
      req.params.id,
      req.authProfile!.id,
      parsed.data.memberIds
    );
    await broadcastToConversation(conversation.id, {
      type: 'conversation:updated',
      conversationId: conversation.id,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.patch('/conversations/:id/members/:userId', async (req: AuthRequest, res) => {
  try {
    const parsed = updateMemberRoleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid role' });
      return;
    }
    const conversation = await updateGroupMemberRole(
      req.params.id,
      req.authProfile!.id,
      req.params.userId,
      parsed.data.role
    );
    await broadcastToConversation(conversation.id, {
      type: 'conversation:updated',
      conversationId: conversation.id,
    });
    res.json({ conversation });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.delete('/conversations/:id/members/:userId', async (req: AuthRequest, res) => {
  try {
    const targetUserId = req.params.userId;
    const result = await removeGroupMember(req.params.id, req.authProfile!.id, targetUserId);
    broadcastToUsers([...result.remainingUserIds, targetUserId], {
      type: 'conversation:updated',
      conversationId: req.params.id,
    });
    res.json({ ok: true, left: result.left });
  } catch (error) {
    handleError(res, error);
  }
});

// Messages & Read Receipts
apiRouter.get('/conversations/:id/messages', async (req: AuthRequest, res) => {
  try {
    const before = typeof req.query.before === 'string' ? req.query.before : undefined;
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : 40;
    const data = await getConversationMessages(req.params.id, req.authProfile!.id, {
      before,
      limit: Number.isFinite(limit) ? limit : 40,
    });
    res.json(data);
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/conversations/:id/messages', async (req: AuthRequest, res) => {
  try {
    const parsed = createMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid message payload' });
      return;
    }
    const { message, createdNotifications } = await sendMessage(
      req.params.id,
      req.authProfile!.id,
      parsed.data
    );

    await broadcastToConversation(req.params.id, {
      type: 'message:created',
      message,
    });

    for (const notif of createdNotifications) {
      broadcastToUsers([notif.userId], {
        type: 'notification:created',
        notification: notif,
      });
    }

    res.status(201).json({ message });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/conversations/:id/read', async (req: AuthRequest, res) => {
  try {
    const receipt = await markConversationRead(req.params.id, req.authProfile!.id);
    if (receipt.messageIds.length > 0) {
      await broadcastToConversation(
        req.params.id,
        {
          type: 'message:read',
          conversationId: receipt.conversationId,
          userId: receipt.userId,
          messageIds: receipt.messageIds,
          readAt: receipt.readAt,
        },
        req.authProfile!.id
      );
    }
    res.json({ ok: true, ...receipt });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.patch('/messages/:id', async (req: AuthRequest, res) => {
  try {
    const parsed = editMessageSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid message content' });
      return;
    }
    const message = await editMessage(req.params.id, req.authProfile!.id, parsed.data.content);
    await broadcastToConversation(message.conversationId, {
      type: 'message:updated',
      message,
    });
    res.json({ message });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.delete('/messages/:id', async (req: AuthRequest, res) => {
  try {
    const deleted = await deleteMessage(req.params.id, req.authProfile!.id);
    await broadcastToConversation(deleted.conversationId, {
      type: 'message:deleted',
      conversationId: deleted.conversationId,
      messageId: deleted.messageId,
      deletedAt: deleted.deletedAt,
    });
    res.json({ ok: true, ...deleted });
  } catch (error) {
    handleError(res, error);
  }
});

// Secure Attachments (Authorized membership required for both upload & retrieval)
apiRouter.post(
  '/conversations/:id/attachments',
  attachmentUpload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      await requireConversationMember(req.params.id, req.authProfile!.id);
      if (!req.file) {
        res.status(400).json({ error: 'No attachment file provided' });
        return;
      }

      const cfg = await getSiteConfig();
      const maxBytes = cfg.maxAttachmentMb * 1024 * 1024;
      if (!cfg.allowFileUploads || req.file.size > maxBytes) {
        try {
          fs.unlinkSync(req.file.path);
        } catch {
          // ignore cleanup failure
        }
        if (!cfg.allowFileUploads) {
          res.status(403).json({ error: 'File uploads are currently disabled by the administrator.' });
        } else {
          res.status(413).json({ error: `File exceeds the ${cfg.maxAttachmentMb} MB upload limit.` });
        }
        return;
      }

      const isImage = ALLOWED_IMAGE_MIME.has(req.file.mimetype);
      const [inserted] = await db
        .insert(messageAttachments)
        .values({
          conversationId: req.params.id,
          uploaderId: req.authProfile!.id,
          fileName: path.basename(req.file.originalname).slice(0, 180),
          mimeType: req.file.mimetype,
          fileSize: req.file.size,
          storageKey: req.file.filename,
          isImage,
        })
        .returning();

      res.status(201).json({
        attachment: {
          id: inserted.id,
          messageId: inserted.messageId,
          conversationId: inserted.conversationId,
          uploaderId: inserted.uploaderId,
          fileName: inserted.fileName,
          mimeType: inserted.mimeType,
          fileSize: inserted.fileSize,
          isImage: inserted.isImage,
          url: `/api/attachments/${inserted.id}`,
          createdAt: inserted.createdAt.toISOString(),
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  }
);

apiRouter.get('/attachments/:id', async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.id, req.params.id))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }
    const att = rows[0];
    await requireConversationMember(att.conversationId, req.authProfile!.id);

    const safeStorageKey = path.basename(att.storageKey);
    const fullPath = path.join(ATTACHMENTS_DIR, safeStorageKey);
    if (!fs.existsSync(fullPath)) {
      res.status(404).json({ error: 'Attachment file missing from storage' });
      return;
    }

    res.setHeader('Content-Type', att.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${att.isImage ? 'inline' : 'attachment'}; filename="${att.fileName.replace(/"/g, '')}"`
    );
    res.sendFile(fullPath);
  } catch (error) {
    handleError(res, error);
  }
});

// Search
apiRouter.get('/search', async (req: AuthRequest, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const conversationId =
      typeof req.query.conversationId === 'string' && req.query.conversationId
        ? req.query.conversationId
        : undefined;
    const results = await searchAuthorizedMessages(req.authProfile!.id, q, conversationId);
    res.json({ messages: results });
  } catch (error) {
    handleError(res, error);
  }
});

// Notifications
apiRouter.get('/notifications', async (req: AuthRequest, res) => {
  try {
    const items = await listNotifications(req.authProfile!.id);
    res.json({ notifications: items });
  } catch (error) {
    handleError(res, error);
  }
});

apiRouter.post('/notifications/read', async (req: AuthRequest, res) => {
  try {
    const id = typeof req.body?.id === 'string' ? req.body.id : undefined;
    await markNotificationsRead(req.authProfile!.id, id);
    res.json({ ok: true });
  } catch (error) {
    handleError(res, error);
  }
});

// Link Preview (SSRF-safe)
apiRouter.get('/link-preview', async (req: AuthRequest, res) => {
  try {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url : '';
    const parsed = isSafePublicUrl(rawUrl);
    if (!parsed) {
      res.status(400).json({ error: 'Invalid or disallowed URL' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const response = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { 'User-Agent': 'LinkUpPreviewBot/1.0' },
    }).finally(() => clearTimeout(timer));

    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('text/html')) {
      res.json({ preview: { url: parsed.toString(), title: null, description: null, siteName: parsed.hostname } });
      return;
    }

    const html = (await response.text()).slice(0, 80_000);
    const titleMatch =
      html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const descMatch =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    const siteMatch = html.match(
      /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i
    );

    res.json({
      preview: {
        url: parsed.toString(),
        title: titleMatch?.[1]?.trim() || null,
        description: descMatch?.[1]?.trim() || null,
        siteName: siteMatch?.[1]?.trim() || parsed.hostname,
      },
    });
  } catch {
    res.json({ preview: null });
  }
});

// Group member sync helper export check
export { getConversationMemberIds };

