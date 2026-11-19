import { eq, ilike, or, ne, and } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { profiles, userSettings } from '../../db/schema.ts';
import { getSiteConfig } from './siteConfigService.ts';
import type { MyProfile, PublicProfile, UserSettings } from '../../types/chat.ts';

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const raw = process.env.ADMIN_EMAILS || '';
  if (!raw.trim()) return false;
  const allowed = raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

function sanitizeBaseUsername(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (cleaned.length >= 3) return cleaned.slice(0, 24);
  return `user_${Math.random().toString(36).slice(2, 7)}`;
}

export function toPublicProfile(
  row: typeof profiles.$inferSelect,
  settings?: typeof userSettings.$inferSelect | null
): PublicProfile {
  const allowOnline = settings ? settings.showOnlineStatus : true;
  const allowLastSeen = settings ? settings.showLastSeen : true;

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    status: allowOnline && row.status === 'online' ? 'online' : 'offline',
    lastSeenAt: allowLastSeen ? row.lastSeenAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMyProfile(row: typeof profiles.$inferSelect): MyProfile {
  return {
    id: row.id,
    uid: row.uid,
    email: row.email,
    isAdmin: Boolean(row.isAdmin || isAdminEmail(row.email)),
    username: row.username,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    bio: row.bio,
    status: row.status === 'online' ? 'online' : 'offline',
    lastSeenAt: row.lastSeenAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

export function toUserSettingsDto(row: typeof userSettings.$inferSelect): UserSettings {
  return {
    userId: row.userId,
    theme: (row.theme as UserSettings['theme']) || 'system',
    showOnlineStatus: row.showOnlineStatus,
    showLastSeen: row.showLastSeen,
    sendReadReceipts: row.sendReadReceipts,
    inAppNotifications: row.inAppNotifications,
    browserNotifications: row.browserNotifications,
    soundEnabled: row.soundEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getOrCreateProfile(params: {
  uid: string;
  email: string;
  displayName?: string | null;
  photoURL?: string | null;
}): Promise<typeof profiles.$inferSelect> {
  try {
    const existing = await db.select().from(profiles).where(eq(profiles.uid, params.uid)).limit(1);
    if (existing.length > 0) {
      const current = existing[0];
      if (params.email && current.email !== params.email) {
        const [updated] = await db
          .update(profiles)
          .set({ email: params.email, updatedAt: new Date() })
          .where(eq(profiles.id, current.id))
          .returning();
        return updated;
      }
      return current;
    }

    const cfg = await getSiteConfig();
    if (!cfg.allowSignups && !isAdminEmail(params.email || '')) {
      throw Object.assign(
        new Error('New account registrations are currently disabled by the administrator.'),
        { statusCode: 403 }
      );
    }

    const emailPrefix = params.email ? params.email.split('@')[0] : 'member';
    const baseUsername = sanitizeBaseUsername(emailPrefix);
    let candidate = baseUsername;

    // Ensure unique username before insert
    for (let attempt = 0; attempt < 5; attempt++) {
      const taken = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.username, candidate))
        .limit(1);
      if (taken.length === 0) break;
      candidate = `${baseUsername.slice(0, 18)}_${Math.random().toString(36).slice(2, 6)}`;
    }

    const fallbackName =
      params.displayName?.trim() || (emailPrefix ? emailPrefix.replace(/[._-]+/g, ' ') : 'LinkUp User');

    const inserted = await db
      .insert(profiles)
      .values({
        uid: params.uid,
        email: params.email || '',
        username: candidate,
        displayName: fallbackName.slice(0, 60),
        avatarUrl: params.photoURL || null,
        bio: '',
        isAdmin: isAdminEmail(params.email || ''),
        status: 'online',
      })
      .onConflictDoNothing({ target: profiles.uid })
      .returning();

    let profileRow = inserted[0];
    if (!profileRow) {
      const fallback = await db.select().from(profiles).where(eq(profiles.uid, params.uid)).limit(1);
      if (!fallback[0]) {
        throw new Error('Profile creation race could not resolve user record');
      }
      profileRow = fallback[0];
    }

    await db
      .insert(userSettings)
      .values({ userId: profileRow.id })
      .onConflictDoNothing({ target: userSettings.userId });

    return profileRow;
  } catch (error) {
    console.error('getOrCreateProfile failed:', error);
    throw new Error('Failed to load or initialize user profile', { cause: error });
  }
}

export async function getProfileById(id: string) {
  try {
    const rows = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
    if (!rows[0]) return null;
    const settingsRows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, id))
      .limit(1);
    return toPublicProfile(rows[0], settingsRows[0]);
  } catch (error) {
    console.error('getProfileById failed:', error);
    throw new Error('Failed to fetch user profile', { cause: error });
  }
}

export async function updateMyProfile(
  profileId: string,
  updates: {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string | null;
  }
) {
  try {
    if (updates.username !== undefined) {
      const conflict = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(and(eq(profiles.username, updates.username), ne(profiles.id, profileId)))
        .limit(1);
      if (conflict.length > 0) {
        const err = new Error('Username is already taken');
        (err as Error & { statusCode?: number }).statusCode = 409;
        throw err;
      }
    }

    const [updated] = await db
      .update(profiles)
      .set({
        ...(updates.username !== undefined ? { username: updates.username } : {}),
        ...(updates.displayName !== undefined ? { displayName: updates.displayName } : {}),
        ...(updates.bio !== undefined ? { bio: updates.bio } : {}),
        ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
        updatedAt: new Date(),
      })
      .where(eq(profiles.id, profileId))
      .returning();

    return toMyProfile(updated);
  } catch (error) {
    if ((error as Error & { statusCode?: number }).statusCode === 409) {
      throw error;
    }
    console.error('updateMyProfile failed:', error);
    throw new Error('Failed to update user profile', { cause: error });
  }
}

export async function searchUsers(query: string, currentUserId: string): Promise<PublicProfile[]> {
  try {
    const q = query.trim();
    const rows = q
      ? await db
          .select({
            profile: profiles,
            settings: userSettings,
          })
          .from(profiles)
          .leftJoin(userSettings, eq(profiles.id, userSettings.userId))
          .where(
            and(
              ne(profiles.id, currentUserId),
              or(ilike(profiles.username, `%${q}%`), ilike(profiles.displayName, `%${q}%`))
            )
          )
          .limit(25)
      : await db
          .select({
            profile: profiles,
            settings: userSettings,
          })
          .from(profiles)
          .leftJoin(userSettings, eq(profiles.id, userSettings.userId))
          .where(ne(profiles.id, currentUserId))
          .limit(25);

    return rows.map((r) => toPublicProfile(r.profile, r.settings));
  } catch (error) {
    console.error('searchUsers failed:', error);
    throw new Error('Failed to search users', { cause: error });
  }
}

export async function getOrCreateSettings(profileId: string): Promise<UserSettings> {
  try {
    await db
      .insert(userSettings)
      .values({ userId: profileId })
      .onConflictDoNothing({ target: userSettings.userId });
    const rows = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, profileId))
      .limit(1);
    return toUserSettingsDto(rows[0]);
  } catch (error) {
    console.error('getOrCreateSettings failed:', error);
    throw new Error('Failed to fetch user settings', { cause: error });
  }
}

export async function updateUserSettings(
  profileId: string,
  patch: Partial<{
    theme: string;
    showOnlineStatus: boolean;
    showLastSeen: boolean;
    sendReadReceipts: boolean;
    inAppNotifications: boolean;
    browserNotifications: boolean;
    soundEnabled: boolean;
  }>
): Promise<UserSettings> {
  try {
    await getOrCreateSettings(profileId);
    const [updated] = await db
      .update(userSettings)
      .set({
        ...patch,
        updatedAt: new Date(),
      })
      .where(eq(userSettings.userId, profileId))
      .returning();
    return toUserSettingsDto(updated);
  } catch (error) {
    console.error('updateUserSettings failed:', error);
    throw new Error('Failed to update user settings', { cause: error });
  }
}
