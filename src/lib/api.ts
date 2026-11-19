import { auth } from './firebase';
import type {
  AppNotification,
  ChatMessage,
  ConversationSummary,
  LinkPreviewData,
  MessageAttachment,
  MyProfile,
  PublicProfile,
  SiteConfig,
  UserSettings,
} from '../types/chat';

const LOCAL_TOKEN_KEY = 'linkup_local_token';
let inMemoryLocalToken: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem(LOCAL_TOKEN_KEY) : null;

export function setLocalAuthToken(token: string | null) {
  inMemoryLocalToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem(LOCAL_TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(LOCAL_TOKEN_KEY);
    }
  }
}

export function getLocalAuthToken(): string | null {
  return inMemoryLocalToken;
}

export async function getAuthToken(): Promise<string> {
  if (inMemoryLocalToken) {
    return inMemoryLocalToken;
  }
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Not authenticated');
  }
  return user.getIdToken();
}

async function publicRequest<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAuthToken();
  const headers = new Headers(init.headers || {});
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(path, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getSiteConfig: async (): Promise<{ config: SiteConfig }> => {
    const res = await fetch('/api/site-config');
    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data as { config: SiteConfig };
  },

  authRegister: (payload: { email: string; password: string; displayName?: string }) =>
    publicRequest<{ token: string; profile: MyProfile; settings: UserSettings }>(
      '/api/auth/register',
      payload
    ),

  authLogin: (payload: { email: string; password: string }) =>
    publicRequest<{ token: string; profile: MyProfile; settings: UserSettings }>(
      '/api/auth/login',
      payload
    ),

  changeLocalPassword: (newPassword: string) =>
    apiRequest<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ newPassword }),
    }),

  getMe: () => apiRequest<{ profile: MyProfile; settings: UserSettings }>('/api/me'),

  updateMe: (payload: Partial<Pick<MyProfile, 'username' | 'displayName' | 'bio' | 'avatarUrl'>>) =>
    apiRequest<{ profile: MyProfile }>('/api/me', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),

  uploadAvatar: async (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return apiRequest<{ profile: MyProfile; avatarUrl: string }>('/api/me/avatar', {
      method: 'POST',
      body: form,
    });
  },

  searchUsers: (q: string) =>
    apiRequest<{ users: PublicProfile[] }>(`/api/users/search?q=${encodeURIComponent(q)}`),

  getUserProfile: (id: string) =>
    apiRequest<{ user: PublicProfile }>(`/api/users/${encodeURIComponent(id)}`),

  getSettings: () => apiRequest<{ settings: UserSettings }>('/api/settings'),

  updateSettings: (patch: Partial<Omit<UserSettings, 'userId' | 'updatedAt'>>) =>
    apiRequest<{ settings: UserSettings }>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  listConversations: () =>
    apiRequest<{ conversations: ConversationSummary[] }>('/api/conversations'),

  createDirectConversation: (targetUserId: string) =>
    apiRequest<{ conversation: ConversationSummary }>('/api/conversations/direct', {
      method: 'POST',
      body: JSON.stringify({ targetUserId }),
    }),

  createGroupConversation: (payload: {
    name: string;
    description?: string;
    memberIds: string[];
  }) =>
    apiRequest<{ conversation: ConversationSummary }>('/api/conversations/group', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateGroupConversation: (
    conversationId: string,
    payload: { name?: string; description?: string; avatarUrl?: string | null }
  ) =>
    apiRequest<{ conversation: ConversationSummary }>(
      `/api/conversations/${encodeURIComponent(conversationId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  updatePreferences: (
    conversationId: string,
    patch: { isPinned?: boolean; isMuted?: boolean; isArchived?: boolean }
  ) =>
    apiRequest<{ conversation: ConversationSummary }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/preferences`,
      {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }
    ),

  addGroupMembers: (conversationId: string, memberIds: string[]) =>
    apiRequest<{ conversation: ConversationSummary }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/members`,
      {
        method: 'POST',
        body: JSON.stringify({ memberIds }),
      }
    ),

  updateMemberRole: (conversationId: string, userId: string, role: 'admin' | 'member') =>
    apiRequest<{ conversation: ConversationSummary }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }
    ),

  removeGroupMember: (conversationId: string, userId: string) =>
    apiRequest<{ ok: boolean; left: boolean }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/members/${encodeURIComponent(userId)}`,
      {
        method: 'DELETE',
      }
    ),

  getMessages: (conversationId: string, opts?: { before?: string; limit?: number }) => {
    const params = new URLSearchParams();
    if (opts?.before) params.set('before', opts.before);
    if (opts?.limit) params.set('limit', String(opts.limit));
    const qs = params.toString();
    return apiRequest<{ messages: ChatMessage[]; hasMore: boolean }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages${qs ? `?${qs}` : ''}`
    );
  },

  sendMessage: (
    conversationId: string,
    payload: {
      content: string;
      replyToId?: string | null;
      clientMessageId?: string;
      attachmentIds?: string[];
    }
  ) =>
    apiRequest<{ message: ChatMessage }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  editMessage: (messageId: string, content: string) =>
    apiRequest<{ message: ChatMessage }>(`/api/messages/${encodeURIComponent(messageId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ content }),
    }),

  deleteMessage: (messageId: string) =>
    apiRequest<{ ok: boolean }>(`/api/messages/${encodeURIComponent(messageId)}`, {
      method: 'DELETE',
    }),

  markConversationRead: (conversationId: string) =>
    apiRequest<{ ok: boolean }>(
      `/api/conversations/${encodeURIComponent(conversationId)}/read`,
      { method: 'POST' }
    ),

  uploadAttachmentWithProgress: async (
    conversationId: string,
    file: File,
    onProgress: (pct: number) => void
  ): Promise<MessageAttachment> => {
    const token = await getAuthToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/conversations/${encodeURIComponent(conversationId)}/attachments`);
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);

      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable) {
          onProgress(Math.round((ev.loaded / ev.total) * 100));
        }
      };

      xhr.onload = () => {
        try {
          const parsed = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(parsed.attachment);
          } else {
            reject(new Error(parsed.error || 'Attachment upload failed'));
          }
        } catch {
          reject(new Error('Attachment upload failed'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error while uploading attachment'));

      const form = new FormData();
      form.append('file', file);
      xhr.send(form);
    });
  },

  fetchAuthorizedBlobUrl: async (url: string): Promise<string> => {
    const token = await getAuthToken();
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Unable to access attachment');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  },

  downloadAttachment: async (url: string, fileName: string) => {
    const blobUrl = await api.fetchAuthorizedBlobUrl(url);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
  },

  searchMessages: (q: string, conversationId?: string) => {
    const params = new URLSearchParams({ q });
    if (conversationId) params.set('conversationId', conversationId);
    return apiRequest<{ messages: ChatMessage[] }>(`/api/search?${params.toString()}`);
  },

  listNotifications: () =>
    apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),

  markNotificationsRead: (id?: string) =>
    apiRequest<{ ok: boolean }>('/api/notifications/read', {
      method: 'POST',
      body: JSON.stringify(id ? { id } : {}),
    }),

  getLinkPreview: (url: string) =>
    apiRequest<{ preview: LinkPreviewData | null }>(
      `/api/link-preview?url=${encodeURIComponent(url)}`
    ),
};
