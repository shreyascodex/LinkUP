import type { Request, Response, NextFunction } from 'express';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.ts';
import { profiles } from '../../db/schema.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { getOrCreateProfile, isAdminEmail } from '../services/profileService.ts';
import { verifyAdminToken, verifyLocalToken } from '../services/authService.ts';
import { getSiteConfig } from '../services/siteConfigService.ts';

export interface AuthRequest extends Request {
  firebaseUser?: DecodedIdToken;
  authProfile?: typeof profiles.$inferSelect;
  authMethod?: 'firebase' | 'local';
}

export async function verifyBearerToken(token: string) {
  if (token.startsWith('linkup.')) {
    const verified = verifyLocalToken(token);
    if (!verified) {
      throw new Error('Invalid or expired LinkUp session token');
    }
    const rows = await db
      .select()
      .from(profiles)
      .where(eq(profiles.id, verified.profileId))
      .limit(1);
    if (!rows[0]) {
      throw new Error('User profile not found');
    }
    if (rows[0].isBanned) {
      throw Object.assign(new Error('Account suspended by administrator'), { statusCode: 403 });
    }
    return { decoded: undefined, profile: rows[0], method: 'local' as const };
  }

  const decoded = await adminAuth.verifyIdToken(token);
  const profile = await getOrCreateProfile({
    uid: decoded.uid,
    email: decoded.email || '',
    displayName: decoded.name || null,
    photoURL: decoded.picture || null,
  });
  if (profile.isBanned) {
    throw Object.assign(new Error('Account suspended by administrator'), { statusCode: 403 });
  }
  return { decoded, profile, method: 'firebase' as const };
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing authentication token' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(401).json({ error: 'Unauthorized: Empty token' });
    return;
  }

  try {
    const { decoded, profile, method } = await verifyBearerToken(token);
    const isAdmin = Boolean(profile.isAdmin || isAdminEmail(profile.email));
    if (!isAdmin && req.path !== '/me') {
      const cfg = await getSiteConfig();
      if (cfg.maintenanceMode) {
        res.status(503).json({
          error: cfg.maintenanceMessage || 'Service temporarily unavailable for maintenance',
          maintenanceMode: true,
        });
        return;
      }
    }
    req.firebaseUser = decoded;
    req.authProfile = profile;
    req.authMethod = method;
    next();
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode;
    if (status === 403) {
      res.status(403).json({ error: (error as Error).message });
      return;
    }
    console.error('Token verification failed:', error);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired session' });
  }
}

export async function requireDesignatedAdmin(
  req: AuthRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  try {
    const { decoded, profile, method } = await verifyBearerToken(token);
    const hasAdminAccess = Boolean(profile.isAdmin || isAdminEmail(profile.email));
    if (!hasAdminAccess) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    req.firebaseUser = decoded;
    req.authProfile = profile;
    req.authMethod = method;
    next();
  } catch {
    res.status(404).json({ error: 'Not found' });
  }
}

export function requireAdminConsoleSession(req: AuthRequest, res: Response, next: NextFunction) {
  const profileId = req.authProfile?.id;
  if (!profileId) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  const adminTokenHeader = req.headers['x-admin-token'];
  const adminToken = typeof adminTokenHeader === 'string' ? adminTokenHeader.trim() : '';
  if (!adminToken || !verifyAdminToken(adminToken, profileId)) {
    res.status(401).json({ error: 'Admin console password required' });
    return;
  }

  next();
}
