import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { profiles } from '../../db/schema.ts';
import { getOrCreateSettings, isAdminEmail, toMyProfile } from './profileService.ts';
import { getSiteConfig } from './siteConfigService.ts';

function getTokenSecret(): string {
  const material =
    process.env.SESSION_SECRET ||
    process.env.SQL_PASSWORD ||
    `linkup-local-${process.cwd()}`;
  return crypto.createHash('sha256').update(material).digest('hex');
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, expectedHex] = stored.split(':');
  if (!salt || !expectedHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(expectedHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signLocalToken(profileId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      pid: profileId,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(payload)
    .digest('base64url');
  return `linkup.${payload}.${sig}`;
}

export function verifyLocalToken(token: string): { profileId: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'linkup') return null;
  const [, payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(payload)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      pid?: string;
      exp?: number;
    };
    if (!decoded.pid || !decoded.exp || decoded.exp < Date.now()) {
      return null;
    }
    return { profileId: decoded.pid };
  } catch {
    return null;
  }
}

export function signAdminToken(profileId: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      role: 'superadmin',
      pid: profileId,
      nonce: crypto.randomBytes(8).toString('hex'),
      exp: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
    })
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(`admin:${payload}`)
    .digest('base64url');
  return `linkup_admin.${payload}.${sig}`;
}

export function verifyAdminToken(token: string, expectedProfileId?: string): boolean {
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'linkup_admin') return false;
  const [, payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getTokenSecret())
    .update(`admin:${payload}`)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      role?: string;
      pid?: string;
      exp?: number;
    };
    if (decoded.role !== 'superadmin' || !decoded.pid || !decoded.exp || decoded.exp <= Date.now()) {
      return false;
    }
    if (expectedProfileId && decoded.pid !== expectedProfileId) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function registerWithEmail(input: {
  email: string;
  password: string;
  displayName?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const cfg = await getSiteConfig();
  if (!cfg.allowSignups && !isAdminEmail(email)) {
    throw Object.assign(
      new Error('New account registrations are currently disabled by the administrator.'),
      { statusCode: 403 }
    );
  }
  const existing = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.email, email))
    .limit(1);

  if (existing.length > 0) {
    throw Object.assign(new Error('An account with this email already exists'), {
      statusCode: 409,
    });
  }

  const prefix = email.split('@')[0].replace(/[^a-z0-9_]/g, '_').slice(0, 20) || 'user';
  let username = prefix.length >= 3 ? prefix : `${prefix}_user`;

  for (let i = 0; i < 5; i++) {
    const taken = await db
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.username, username))
      .limit(1);
    if (taken.length === 0) break;
    username = `${prefix.slice(0, 16)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  const displayName =
    input.displayName?.trim() ||
    prefix
      .split('_')
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .join(' ') ||
    'LinkUp User';

  const [created] = await db
    .insert(profiles)
    .values({
      uid: `local:${crypto.randomUUID()}`,
      email,
      passwordHash: hashPassword(input.password),
      username,
      displayName: displayName.slice(0, 60),
      bio: '',
      isAdmin: isAdminEmail(email),
      status: 'online',
    })
    .returning();

  const settings = await getOrCreateSettings(created.id);

  return {
    token: signLocalToken(created.id),
    profile: toMyProfile(created),
    settings,
  };
}

export async function loginWithEmail(input: { email: string; password: string }) {
  const email = input.email.trim().toLowerCase();
  const rows = await db.select().from(profiles).where(eq(profiles.email, email)).limit(1);
  const user = rows[0];

  if (!user || !user.passwordHash || !verifyPassword(input.password, user.passwordHash)) {
    throw Object.assign(new Error('Invalid email or password'), { statusCode: 401 });
  }
  if (user.isBanned) {
    throw Object.assign(new Error('This account has been suspended by an administrator.'), {
      statusCode: 403,
    });
  }

  const settings = await getOrCreateSettings(user.id);
  return {
    token: signLocalToken(user.id),
    profile: toMyProfile(user),
    settings,
  };
}

export async function changeLocalPassword(profileId: string, newPassword: string) {
  await db
    .update(profiles)
    .set({ passwordHash: hashPassword(newPassword), updatedAt: new Date() })
    .where(eq(profiles.id, profileId));
}
