import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  signAdminToken,
  signLocalToken,
  verifyAdminToken,
  verifyLocalToken,
  verifyPassword,
} from '../server/services/authService';
import {
  createGroupConversationSchema,
  createMessageSchema,
  updateProfileSchema,
  updateSettingsSchema,
  usernameSchema,
} from '../lib/validations/schemas';
import {
  extractFirstUrl,
  formatFileSize,
  getInitials,
} from '../lib/utils/format';

describe('LinkUp Validation Schemas', () => {
  it('accepts valid lowercase alphanumeric usernames with underscores', () => {
    expect(usernameSchema.safeParse('alex_dev_24').success).toBe(true);
    expect(usernameSchema.safeParse('ab').success).toBe(false);
    expect(usernameSchema.safeParse('Invalid Name!').success).toBe(false);
  });

  it('validates group creation requirements', () => {
    const valid = createGroupConversationSchema.safeParse({
      name: 'Engineering Core',
      description: 'Daily sync',
      memberIds: ['550e8400-e29b-41d4-a716-446655440000'],
    });
    expect(valid.success).toBe(true);

    const noMembers = createGroupConversationSchema.safeParse({
      name: 'Empty Group',
      memberIds: [],
    });
    expect(noMembers.success).toBe(false);
  });

  it('validates message payload limits and profile bio length', () => {
    expect(
      createMessageSchema.safeParse({
        content: 'Hello LinkUp!',
        clientMessageId: 'client-123',
      }).success
    ).toBe(true);

    expect(
      updateProfileSchema.safeParse({
        bio: 'x'.repeat(241),
      }).success
    ).toBe(false);

    expect(
      updateSettingsSchema.safeParse({
        theme: 'dark',
        showOnlineStatus: false,
      }).success
    ).toBe(true);
  });
});

describe('LinkUp Formatting & Utility Helpers', () => {
  it('extracts first valid HTTP/HTTPS URL from message text', () => {
    expect(extractFirstUrl('Check out https://example.com/docs for details.')).toBe(
      'https://example.com/docs'
    );
    expect(extractFirstUrl('No links in this message')).toBeNull();
  });

  it('formats file sizes cleanly', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(2048)).toBe('2.0 KB');
    expect(formatFileSize(3 * 1024 * 1024)).toBe('3.0 MB');
  });

  it('computes user initials cleanly', () => {
    expect(getInitials('Ada Lovelace')).toBe('AL');
    expect(getInitials('Linus')).toBe('LI');
  });
});

describe('LinkUp Password Hashing & Session Tokens', () => {
  it('hashes and verifies passwords with scrypt timing-safe comparison', () => {
    const hash = hashPassword('StrongPass123!');
    expect(hash).toContain(':');
    expect(verifyPassword('StrongPass123!', hash)).toBe(true);
    expect(verifyPassword('WrongPass', hash)).toBe(false);
  });

  it('signs and verifies local HMAC session tokens and rejects tampering', () => {
    const token = signLocalToken('550e8400-e29b-41d4-a716-446655440000');
    expect(token.startsWith('linkup.')).toBe(true);
    expect(verifyLocalToken(token)).toEqual({
      profileId: '550e8400-e29b-41d4-a716-446655440000',
    });

    const tampered = `${token.slice(0, -4)}xxxx`;
    expect(verifyLocalToken(tampered)).toBeNull();
  });

  it('isolates admin tokens from regular user tokens and binds to profileId', () => {
    const profileA = '550e8400-e29b-41d4-a716-446655440000';
    const profileB = '660e8400-e29b-41d4-a716-446655440001';
    const adminToken = signAdminToken(profileA);
    const userToken = signLocalToken(profileA);

    expect(adminToken.startsWith('linkup_admin.')).toBe(true);
    expect(verifyAdminToken(adminToken, profileA)).toBe(true);
    expect(verifyAdminToken(adminToken, profileB)).toBe(false);
    expect(verifyAdminToken(userToken, profileA)).toBe(false);
    expect(verifyLocalToken(adminToken)).toBeNull();
    expect(verifyAdminToken(`${adminToken.slice(0, -4)}xxxx`, profileA)).toBe(false);
  });
});

