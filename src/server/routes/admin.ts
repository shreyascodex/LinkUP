import { Router } from 'express';
import type { Response } from 'express';
import { z } from 'zod';
import { usernameSchema } from '../../lib/validations/schemas.ts';
import {
  requireAdminConsoleSession,
  requireDesignatedAdmin,
  type AuthRequest,
} from '../middleware/auth.ts';
import {
  addAdminConversationMember,
  broadcastAdminNotification,
  broadcastToAllConnected,
  changeAdminPassword,
  createAdminUser,
  deleteAdminAttachment,
  deleteAdminConversation,
  deleteAdminMessage,
  deleteAdminNotification,
  deleteAdminUser,
  getAdminAuthStatus,
  getAdminDatabaseOverview,
  getAdminTableDetail,
  listAdminAttachments,
  listAdminConversations,
  listAdminMessages,
  listAdminNotifications,
  listAdminUsers,
  loginAdmin,
  purgeReadNotifications,
  purgeSoftDeletedMessages,
  removeAdminConversationMember,
  sendAdminSystemMessage,
  setupAdminPassword,
  updateAdminGroupName,
  updateAdminUser,
} from '../services/adminService.ts';
import { getSiteConfig, updateSiteConfig } from '../services/siteConfigService.ts';

function handleAdminError(res: Response, error: unknown) {
  const status = (error as { statusCode?: number })?.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: (error as Error).message });
    return;
  }
  console.error('Admin API Error:', error);
  res.status(500).json({ error: (error as Error)?.message || 'Internal server error' });
}

const adminPasswordSchema = z
  .string()
  .min(8, 'Admin password must be at least 8 characters')
  .max(128, 'Admin password is too long');

const adminTableNameSchema = z.enum([
  'profiles',
  'user_settings',
  'conversations',
  'conversation_members',
  'messages',
  'message_reads',
  'message_attachments',
  'notifications',
  'admin_config',
  'site_settings',
]);

const createUserSchema = z.object({
  email: z.string().trim().email('Valid email is required'),
  password: z.string().min(6, 'Password must be at least 6 characters').max(128),
  displayName: z.string().trim().min(1, 'Display name is required').max(60),
  username: usernameSchema.optional(),
  isAdmin: z.boolean().optional(),
});

const updateUserSchema = z.object({
  displayName: z.string().trim().min(1).max(60).optional(),
  username: usernameSchema.optional(),
  bio: z.string().max(240).optional(),
  isAdmin: z.boolean().optional(),
  isBanned: z.boolean().optional(),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(128).optional(),
});

const siteConfigPatchSchema = z.object({
  siteName: z.string().trim().min(1).max(40).optional(),
  tagline: z.string().max(120).optional(),
  allowSignups: z.boolean().optional(),
  allowGroupCreation: z.boolean().optional(),
  allowFileUploads: z.boolean().optional(),
  maxAttachmentMb: z.number().int().min(1).max(25).optional(),
  maintenanceMode: z.boolean().optional(),
  maintenanceMessage: z.string().max(300).optional(),
  announcementText: z.string().max(300).optional(),
  announcementTone: z.enum(['info', 'warning', 'success']).optional(),
});

export const adminRouter = Router();

// Every /api/admin/* endpoint requires a signed-in LinkUp account that has admin access.
// Non-admins and unauthenticated requests receive HTTP 404.
adminRouter.use(requireDesignatedAdmin);

adminRouter.get('/auth/status', async (_req: AuthRequest, res) => {
  try {
    const status = await getAdminAuthStatus();
    res.json(status);
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/auth/setup', async (req: AuthRequest, res) => {
  try {
    const parsed = z.object({ password: adminPasswordSchema }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid password' });
      return;
    }
    const result = await setupAdminPassword(req.authProfile!.id, parsed.data.password);
    res.status(201).json(result);
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/auth/login', async (req: AuthRequest, res) => {
  try {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password) {
      res.status(400).json({ error: 'Password is required' });
      return;
    }
    const result = await loginAdmin(req.authProfile!.id, password);
    res.json(result);
  } catch (error) {
    handleAdminError(res, error);
  }
});

// Management routes below additionally require the unlocked Master Admin Password session token
adminRouter.use(requireAdminConsoleSession);

adminRouter.post('/auth/change-password', async (req: AuthRequest, res) => {
  try {
    const parsed = z
      .object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: adminPasswordSchema,
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid input' });
      return;
    }
    await changeAdminPassword(parsed.data.currentPassword, parsed.data.newPassword);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

// Global Website Controls (branding, signups, maintenance mode, uploads, announcements)
adminRouter.get('/site-config', async (_req, res) => {
  try {
    const config = await getSiteConfig(true);
    res.json({ config });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.patch('/site-config', async (req, res) => {
  try {
    const parsed = siteConfigPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid site settings' });
      return;
    }
    const config = await updateSiteConfig(parsed.data);
    broadcastToAllConnected({ type: 'site:config', config });
    res.json({ config });
  } catch (error) {
    handleAdminError(res, error);
  }
});

// Live Database Tables & Maintenance
adminRouter.get('/tables', async (_req, res) => {
  try {
    const tables = await getAdminDatabaseOverview();
    res.json({ tables, fetchedAt: new Date().toISOString() });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.get('/tables/:tableName', async (req, res) => {
  try {
    const parsed = adminTableNameSchema.safeParse(req.params.tableName);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid database table name' });
      return;
    }
    const detail = await getAdminTableDetail(parsed.data);
    res.json(detail);
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/maintenance/purge-deleted-messages', async (_req, res) => {
  try {
    const removed = await purgeSoftDeletedMessages();
    res.json({ ok: true, removed });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/maintenance/purge-read-notifications', async (_req, res) => {
  try {
    const removed = await purgeReadNotifications();
    res.json({ ok: true, removed });
  } catch (error) {
    handleAdminError(res, error);
  }
});

// User Creation, Banning & Access Management
adminRouter.get('/users', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const users = await listAdminUsers(q);
    res.json({ users });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/users', async (req, res) => {
  try {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user data' });
      return;
    }
    const user = await createAdminUser(parsed.data);
    res.status(201).json({ user });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.patch('/users/:userId', async (req: AuthRequest, res) => {
  try {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid user data' });
      return;
    }
    const user = await updateAdminUser(req.params.userId, parsed.data, req.authProfile!.id);
    res.json({ user });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.delete('/users/:userId', async (req: AuthRequest, res) => {
  try {
    await deleteAdminUser(req.params.userId, req.authProfile!.id);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

// Conversations & Messages Management
adminRouter.get('/conversations', async (_req, res) => {
  try {
    const conversations = await listAdminConversations();
    res.json({ conversations });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.patch('/conversations/:id', async (req, res) => {
  try {
    const parsed = z
      .object({ name: z.string().trim().min(1, 'Name cannot be empty').max(80) })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid name' });
      return;
    }
    await updateAdminGroupName(req.params.id, parsed.data.name);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/conversations/:id/members', async (req, res) => {
  try {
    const parsed = z.object({ userId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Valid userId is required' });
      return;
    }
    await addAdminConversationMember(req.params.id, parsed.data.userId);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.delete('/conversations/:id/members/:userId', async (req, res) => {
  try {
    await removeAdminConversationMember(req.params.id, req.params.userId);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/conversations/:id/system-message', async (req: AuthRequest, res) => {
  try {
    const parsed = z.object({ content: z.string().trim().min(1).max(2000) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Message content is required' });
      return;
    }
    await sendAdminSystemMessage(req.params.id, req.authProfile!.id, parsed.data.content);
    res.status(201).json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.delete('/conversations/:id', async (req, res) => {
  try {
    await deleteAdminConversation(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.get('/messages', async (req, res) => {
  try {
    const conversationId =
      typeof req.query.conversationId === 'string' && req.query.conversationId
        ? req.query.conversationId
        : undefined;
    const messages = await listAdminMessages(conversationId);
    res.json({ messages });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.delete('/messages/:id', async (req, res) => {
  try {
    await deleteAdminMessage(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

// Attachments & Notifications Management
adminRouter.get('/attachments', async (_req, res) => {
  try {
    const attachments = await listAdminAttachments();
    res.json({ attachments });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.delete('/attachments/:id', async (req, res) => {
  try {
    await deleteAdminAttachment(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.get('/notifications', async (_req, res) => {
  try {
    const notifications = await listAdminNotifications();
    res.json({ notifications });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.post('/notifications/broadcast', async (req: AuthRequest, res) => {
  try {
    const parsed = z
      .object({
        title: z.string().trim().min(1, 'Title is required').max(120),
        body: z.string().trim().min(1, 'Message is required').max(300),
        targetUserId: z.string().uuid().optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message || 'Invalid notification' });
      return;
    }
    const sentCount = await broadcastAdminNotification({
      title: parsed.data.title,
      body: parsed.data.body,
      actorId: req.authProfile!.id,
      targetUserId: parsed.data.targetUserId,
    });
    res.status(201).json({ ok: true, sentCount });
  } catch (error) {
    handleAdminError(res, error);
  }
});

adminRouter.delete('/notifications/:id', async (req, res) => {
  try {
    await deleteAdminNotification(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    handleAdminError(res, error);
  }
});
