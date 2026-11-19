import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import {
  Bell,
  Camera,
  Check,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  Shield,
  Sun,
  User,
} from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { api } from '../../lib/api';
import { auth, sendEmailVerification, updatePassword } from '../../lib/firebase';
import type { MyProfile, ThemePreference, UserSettings } from '../../types/chat';

interface SettingsPanelProps {
  profile: MyProfile;
  settings: UserSettings;
  themePreference: ThemePreference;
  onChangeTheme: (pref: ThemePreference) => void;
  onProfileUpdated: (p: MyProfile) => void;
  onSettingsUpdated: (s: UserSettings) => void;
  onLogout: () => Promise<void>;
}

export function SettingsPanel({
  profile,
  settings,
  themePreference,
  onChangeTheme,
  onProfileUpdated,
  onSettingsUpdated,
  onLogout,
}: SettingsPanelProps) {
  const [displayName, setDisplayName] = useState(profile.displayName);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const firebaseUser = auth.currentUser;
  const isLocalPasswordAccount = profile.uid.startsWith('local:');
  const isFirebasePasswordProvider =
    firebaseUser?.providerData.some((p) => p.providerId === 'password') ?? false;
  const canChangePassword = isLocalPasswordAccount || isFirebasePasswordProvider;

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const res = await api.updateMe({
        displayName: displayName.trim(),
        username: username.trim().toLowerCase(),
        bio: bio.trim(),
      });
      onProfileUpdated(res.profile);
      setProfileMsg({ type: 'ok', text: 'Profile updated successfully.' });
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Failed to update profile',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleAvatarUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingAvatar(true);
    setProfileMsg(null);
    try {
      const res = await api.uploadAvatar(file);
      onProfileUpdated(res.profile);
      setProfileMsg({ type: 'ok', text: 'Profile picture updated.' });
    } catch (err) {
      setProfileMsg({
        type: 'err',
        text: err instanceof Error ? err.message : 'Avatar upload failed',
      });
    } finally {
      setUploadingAvatar(false);
    }
  };

  const updateSettingField = async (
    patch: Partial<Omit<UserSettings, 'userId' | 'updatedAt'>>
  ) => {
    if (patch.theme) {
      onChangeTheme(patch.theme);
    }

    if (patch.browserNotifications === true && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm !== 'granted') {
          patch.browserNotifications = false;
        }
      } else if (Notification.permission === 'denied') {
        patch.browserNotifications = false;
      }
    }

    const res = await api.updateSettings(patch);
    onSettingsUpdated(res.settings);
  };

  const handlePasswordChange = async (e: FormEvent) => {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword.length < 6) {
      setPasswordMsg({ type: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'err', text: 'Passwords do not match.' });
      return;
    }
    setSavingPassword(true);
    try {
      if (isLocalPasswordAccount) {
        await api.changeLocalPassword(newPassword);
      } else if (firebaseUser) {
        await updatePassword(firebaseUser, newPassword);
      } else {
        throw new Error('Password updates are not supported for this sign-in method.');
      }
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMsg({ type: 'ok', text: 'Password updated successfully.' });
    } catch (err) {
      setPasswordMsg({
        type: 'err',
        text:
          err instanceof Error
            ? err.message
            : 'Please re-authenticate before changing your password.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleResendVerification = async () => {
    if (!firebaseUser) return;
    try {
      await sendEmailVerification(firebaseUser);
      setVerifyMsg('Verification email sent. Check your inbox.');
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : 'Unable to send verification email.');
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-slate-50/70 dark:bg-slate-950 p-6">
      <div className="max-w-3xl mx-auto space-y-6 pb-12">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage your LinkUp profile, privacy, notifications, and appearance preferences.
          </p>
        </div>

        {/* Profile Settings */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <User className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-display font-semibold text-base">Profile</h2>
          </div>

          <div className="flex items-center gap-4">
            <Avatar src={profile.avatarUrl} name={profile.displayName} size="xl" />
            <div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarUpload}
              />
              <button
                type="button"
                disabled={uploadingAvatar}
                onClick={() => avatarInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>{uploadingAvatar ? 'Uploading...' : 'Change avatar'}</span>
              </button>
              <p className="mt-1 text-[11px] text-slate-500">JPG, PNG, GIF or WebP up to 5MB.</p>
            </div>
          </div>

          {profileMsg && (
            <div
              className={`rounded-xl px-3.5 py-2.5 text-xs border ${
                profileMsg.type === 'ok'
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                  : 'border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300'
              }`}
            >
              {profileMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveProfile} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Display name
                </label>
                <input
                  type="text"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Unique username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Bio
              </label>
              <textarea
                rows={3}
                maxLength={240}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell teammates what you are working on..."
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 resize-none"
              />
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingProfile}
                className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="h-3.5 w-3.5" />
                <span>{savingProfile ? 'Saving...' : 'Save profile'}</span>
              </button>
            </div>
          </form>
        </section>

        {/* Appearance */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Sun className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-display font-semibold text-base">Appearance</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'light' as const, label: 'Light', Icon: Sun },
              { id: 'dark' as const, label: 'Dark', Icon: Moon },
              { id: 'system' as const, label: 'System', Icon: Monitor },
            ].map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => void updateSettingField({ theme: id })}
                className={`py-3 px-4 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer ${
                  themePreference === id
                    ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Privacy */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-display font-semibold text-base">Privacy</h2>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[
              {
                key: 'showOnlineStatus' as const,
                label: 'Show online status',
                desc: 'Let others see when you are actively connected to LinkUp.',
                val: settings.showOnlineStatus,
              },
              {
                key: 'showLastSeen' as const,
                label: 'Share last seen timestamp',
                desc: 'Display your most recent active time to conversation members.',
                val: settings.showLastSeen,
              },
              {
                key: 'sendReadReceipts' as const,
                label: 'Send read receipts',
                desc: 'Confirm when you have read incoming messages.',
                val: settings.sendReadReceipts,
              },
            ].map((item) => (
              <div key={item.key} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.val}
                  onClick={() => void updateSettingField({ [item.key]: !item.val })}
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
                    item.val ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                      item.val ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Notifications */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-display font-semibold text-base">Notifications</h2>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {[
              {
                key: 'inAppNotifications' as const,
                label: 'In-app notifications',
                desc: 'Record unread message and group invite notifications in your feed.',
                val: settings.inAppNotifications,
              },
              {
                key: 'browserNotifications' as const,
                label: 'Browser desktop notifications',
                desc: 'Show system alerts when LinkUp is in a background tab.',
                val: settings.browserNotifications,
              },
              {
                key: 'soundEnabled' as const,
                label: 'Notification sounds',
                desc: 'Play a subtle chime for incoming messages.',
                val: settings.soundEnabled,
              },
            ].map((item) => (
              <div key={item.key} className="py-3 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={item.val}
                  onClick={() => void updateSettingField({ [item.key]: !item.val })}
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 cursor-pointer ${
                    item.val ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <span
                    className={`block h-5 w-5 rounded-full bg-white transition-transform ${
                      item.val ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Account & Password */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4.5 w-4.5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="font-display font-semibold text-base">Account & Security</h2>
          </div>

          <div className="text-xs space-y-1.5 text-slate-600 dark:text-slate-400">
            <p>
              <span className="font-medium text-slate-800 dark:text-slate-200">Email:</span>{' '}
              {profile.email} ·{' '}
              {profile.uid.startsWith('local:')
                ? 'Email & Password'
                : firebaseUser?.emailVerified
                ? 'Verified'
                : 'Unverified'}
            </p>
            <p>
              <span className="font-medium text-slate-800 dark:text-slate-200">Member since:</span>{' '}
              {new Date(profile.createdAt).toLocaleDateString([], {
                month: 'long',
                day: 'numeric',
                year: 'numeric',
              })}
            </p>
            {firebaseUser && !firebaseUser.emailVerified && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => void handleResendVerification()}
                  className="text-indigo-600 dark:text-indigo-400 font-medium hover:underline cursor-pointer"
                >
                  Resend email verification link
                </button>
                {verifyMsg && <p className="mt-1 text-emerald-600">{verifyMsg}</p>}
              </div>
            )}
          </div>

          {canChangePassword && (
            <form onSubmit={handlePasswordChange} className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Change Password
              </p>
              {passwordMsg && (
                <p
                  className={`text-xs ${
                    passwordMsg.type === 'ok' ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {passwordMsg.text}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                  className="px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm new password"
                  className="px-3.5 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                />
              </div>
              <button
                type="submit"
                disabled={savingPassword}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {savingPassword ? 'Updating...' : 'Update password'}
              </button>
            </form>
          )}

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void onLogout()}
              className="px-4 py-2.5 rounded-xl border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-medium inline-flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign out of LinkUp</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
