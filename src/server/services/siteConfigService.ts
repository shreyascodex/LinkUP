import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { siteSettings } from '../../db/schema.ts';
import type { SiteConfig } from '../../types/chat.ts';

const DEFAULT_CONFIG: Omit<SiteConfig, 'updatedAt'> = {
  siteName: 'LinkUp',
  tagline: 'Stay connected. Chat together.',
  allowSignups: true,
  allowGroupCreation: true,
  allowFileUploads: true,
  maxAttachmentMb: 10,
  maintenanceMode: false,
  maintenanceMessage: 'LinkUp is undergoing scheduled maintenance. Please check back shortly.',
  announcementText: '',
  announcementTone: 'info',
};

let cachedConfig: SiteConfig | null = null;
let cacheExpiresAt = 0;

function toDto(row: typeof siteSettings.$inferSelect): SiteConfig {
  const tone =
    row.announcementTone === 'warning' || row.announcementTone === 'success'
      ? row.announcementTone
      : 'info';
  return {
    siteName: row.siteName,
    tagline: row.tagline,
    allowSignups: row.allowSignups,
    allowGroupCreation: row.allowGroupCreation,
    allowFileUploads: row.allowFileUploads,
    maxAttachmentMb: row.maxAttachmentMb,
    maintenanceMode: row.maintenanceMode,
    maintenanceMessage: row.maintenanceMessage,
    announcementText: row.announcementText,
    announcementTone: tone,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getSiteConfig(bypassCache = false): Promise<SiteConfig> {
  if (!bypassCache && cachedConfig && Date.now() < cacheExpiresAt) {
    return cachedConfig;
  }

  const rows = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, 'default'))
    .limit(1);

  if (rows[0]) {
    cachedConfig = toDto(rows[0]);
    cacheExpiresAt = Date.now() + 5000;
    return cachedConfig;
  }

  const inserted = await db
    .insert(siteSettings)
    .values({
      id: 'default',
      ...DEFAULT_CONFIG,
      updatedAt: new Date(),
    })
    .onConflictDoNothing({ target: siteSettings.id })
    .returning();

  if (inserted[0]) {
    cachedConfig = toDto(inserted[0]);
    cacheExpiresAt = Date.now() + 5000;
    return cachedConfig;
  }

  const fallback = await db
    .select()
    .from(siteSettings)
    .where(eq(siteSettings.id, 'default'))
    .limit(1);
  cachedConfig = fallback[0]
    ? toDto(fallback[0])
    : { ...DEFAULT_CONFIG, updatedAt: new Date().toISOString() };
  cacheExpiresAt = Date.now() + 5000;
  return cachedConfig;
}

export async function updateSiteConfig(
  patch: Partial<Omit<SiteConfig, 'updatedAt'>>
): Promise<SiteConfig> {
  await getSiteConfig(true);

  const updates: Partial<typeof siteSettings.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (patch.siteName !== undefined) {
    updates.siteName = patch.siteName.trim().slice(0, 40) || 'LinkUp';
  }
  if (patch.tagline !== undefined) {
    updates.tagline = patch.tagline.trim().slice(0, 120);
  }
  if (patch.allowSignups !== undefined) updates.allowSignups = patch.allowSignups;
  if (patch.allowGroupCreation !== undefined) {
    updates.allowGroupCreation = patch.allowGroupCreation;
  }
  if (patch.allowFileUploads !== undefined) updates.allowFileUploads = patch.allowFileUploads;
  if (patch.maxAttachmentMb !== undefined) {
    updates.maxAttachmentMb = Math.min(25, Math.max(1, Math.round(patch.maxAttachmentMb)));
  }
  if (patch.maintenanceMode !== undefined) updates.maintenanceMode = patch.maintenanceMode;
  if (patch.maintenanceMessage !== undefined) {
    updates.maintenanceMessage = patch.maintenanceMessage.trim().slice(0, 300);
  }
  if (patch.announcementText !== undefined) {
    updates.announcementText = patch.announcementText.trim().slice(0, 300);
  }
  if (patch.announcementTone !== undefined) {
    updates.announcementTone = patch.announcementTone;
  }

  const [updated] = await db
    .update(siteSettings)
    .set(updates)
    .where(eq(siteSettings.id, 'default'))
    .returning();

  cachedConfig = toDto(updated);
  cacheExpiresAt = Date.now() + 5000;
  return cachedConfig;
}
