import { getAuthToken } from './api';
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
  SiteConfig,
} from '../types/chat';

const ADMIN_TOKEN_KEY = 'linkup_admin_token';
let inMemoryAdminToken: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem(ADMIN_TOKEN_KEY) : null;

export function getAdminToken(): string | null {
  return inMemoryAdminToken;
}

export function setAdminToken(token: string | null) {
  inMemoryAdminToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    }
  }
}

export class AdminAuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function adminRequest<T>(
  path: string,
  init: RequestInit = {},
  requireAdminSessionToken = true
): Promise<T> {
  const userToken = await getAuthToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${userToken}`);

  if (requireAdminSessionToken) {
    if (!inMemoryAdminToken) {
      throw new AdminAuthError('Admin session locked', 401);
    }
    headers.set('X-Admin-Token', inMemoryAdminToken);
  }
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    if (res.status === 401 && requireAdminSessionToken) {
      setAdminToken(null);
    }
    throw new AdminAuthError(data.error || `Request failed (${res.status})`, res.status);
  }
  return data as T;
}

export const adminApi = {
  getAuthStatus: () => adminRequest<AdminAuthStatus>('/api/admin/auth/status', {}, false),

  setupPassword: async (password: string) => {
    const res = await adminRequest<{ token: string }>(
      '/api/admin/auth/setup',
      { method: 'POST', body: JSON.stringify({ password }) },
      false
    );
    setAdminToken(res.token);
    return res;
  },

  login: async (password: string) => {
    const res = await adminRequest<{ token: string }>(
      '/api/admin/auth/login',
      { method: 'POST', body: JSON.stringify({ password }) },
      false
    );
    setAdminToken(res.token);
    return res;
  },

  changePassword: (currentPassword: string, newPassword: string) =>
    adminRequest<{ ok: boolean }>('/api/admin/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  getSiteConfig: () => adminRequest<{ config: SiteConfig }>('/api/admin/site-config'),

  updateSiteConfig: (patch: Partial<Omit<SiteConfig, 'updatedAt'>>) =>
    adminRequest<{ config: SiteConfig }>('/api/admin/site-config', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  getTables: () =>
    adminRequest<{ tables: AdminTableSummary[]; fetchedAt: string }>('/api/admin/tables'),

  getTableDetail: (tableName: AdminTableName) =>
    adminRequest<AdminTableDetail>(`/api/admin/tables/${encodeURIComponent(tableName)}`),

  purgeDeletedMessages: () =>
    adminRequest<{ ok: boolean; removed: number }>('/api/admin/maintenance/purge-deleted-messages', {
      method: 'POST',
    }),

  purgeReadNotifications: () =>
    adminRequest<{ ok: boolean; removed: number }>(
      '/api/admin/maintenance/purge-read-notifications',
      { method: 'POST' }
    ),

  listUsers: (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    return adminRequest<{ users: AdminManagedUser[] }>(`/api/admin/users${qs}`);
  },

  createUser: (payload: {
    email: string;
    password: string;
    displayName: string;
    username?: string;
    isAdmin?: boolean;
  }) =>
    adminRequest<{ user: AdminManagedUser }>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateUser: (
    userId: string,
    patch: {
      displayName?: string;
      username?: string;
      bio?: string;
      isAdmin?: boolean;
      isBanned?: boolean;
      newPassword?: string;
    }
  ) =>
    adminRequest<{ user: AdminManagedUser }>(
      `/api/admin/users/${encodeURIComponent(userId)}`,
      { method: 'PATCH', body: JSON.stringify(patch) }
    ),

  deleteUser: (userId: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
    }),

  listConversations: () =>
    adminRequest<{ conversations: AdminManagedConversation[] }>('/api/admin/conversations'),

  renameConversation: (conversationId: string, name: string) =>
    adminRequest<{ ok: boolean }>(
      `/api/admin/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'PATCH', body: JSON.stringify({ name }) }
    ),

  addConversationMember: (conversationId: string, userId: string) =>
    adminRequest<{ ok: boolean }>(
      `/api/admin/conversations/${encodeURIComponent(conversationId)}/members`,
      { method: 'POST', body: JSON.stringify({ userId }) }
    ),

  removeConversationMember: (conversationId: string, userId: string) =>
    adminRequest<{ ok: boolean }>(
      `/api/admin/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(
        userId
      )}`,
      { method: 'DELETE' }
    ),

  sendSystemMessage: (conversationId: string, content: string) =>
    adminRequest<{ ok: boolean }>(
      `/api/admin/conversations/${encodeURIComponent(conversationId)}/system-message`,
      { method: 'POST', body: JSON.stringify({ content }) }
    ),

  deleteConversation: (conversationId: string) =>
    adminRequest<{ ok: boolean }>(
      `/api/admin/conversations/${encodeURIComponent(conversationId)}`,
      { method: 'DELETE' }
    ),

  listMessages: (conversationId?: string) => {
    const qs = conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : '';
    return adminRequest<{ messages: AdminManagedMessage[] }>(`/api/admin/messages${qs}`);
  },

  deleteMessage: (messageId: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    }),

  listAttachments: () =>
    adminRequest<{ attachments: AdminAttachmentItem[] }>('/api/admin/attachments'),

  deleteAttachment: (attachmentId: string) =>
    adminRequest<{ ok: boolean }>(`/api/admin/attachments/${encodeURIComponent(attachmentId)}`, {
      method: 'DELETE',
    }),

  listNotifications: () =>
    adminRequest<{ notifications: AdminNotificationItem[] }>('/api/admin/notifications'),

  broadcastNotification: (payload: { title: string; body: string; targetUserId?: string }) =>
    adminRequest<{ ok: boolean; sentCount: number }>('/api/admin/notifications/broadcast', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteNotification: (notificationId: string) =>
    adminRequest<{ ok: boolean }>(
      `/api/admin/notifications/${encodeURIComponent(notificationId)}`,
      { method: 'DELETE' }
    ),
};
