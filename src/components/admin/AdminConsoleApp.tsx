import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Ban,
  Bell,
  Check,
  CheckCircle2,
  Database,
  Edit3,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  LogOut,
  Megaphone,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  Shield,
  Table as TableIcon,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { AdminAuthError, adminApi, getAdminToken, setAdminToken } from '../../lib/adminApi';
import { formatConversationTimestamp, formatFileSize } from '../../lib/utils/format';
import { useTheme } from '../../hooks/useTheme';
import { LinkUpLogo } from '../ui/LinkUpLogo';
import { NotFoundScreen } from '../ui/NotFoundScreen';
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
  MyProfile,
  SiteConfig,
} from '../../types/chat';

type AdminSection = 'site' | 'database' | 'users' | 'chats' | 'files' | 'security';

export function AdminConsoleApp({ currentUser }: { currentUser: MyProfile }) {
  useTheme();

  const [notFound, setNotFound] = useState(false);
  const [authStatus, setAuthStatus] = useState<AdminAuthStatus | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [unlocked, setUnlocked] = useState(Boolean(getAdminToken()));

  // Gate form state
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  // Dashboard state
  const [section, setSection] = useState<AdminSection>('site');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const [bannerSuccess, setBannerSuccess] = useState<string | null>(null);

  // Site Config state
  const [siteConfig, setSiteConfig] = useState<SiteConfig | null>(null);
  const [siteForm, setSiteForm] = useState<Omit<SiteConfig, 'updatedAt'> | null>(null);
  const [siteFormDirty, setSiteFormDirty] = useState(false);
  const [savingSiteConfig, setSavingSiteConfig] = useState(false);

  // Data state
  const [tables, setTables] = useState<AdminTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState<AdminTableName | null>(null);
  const [tableDetail, setTableDetail] = useState<AdminTableDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const [users, setUsers] = useState<AdminManagedUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [editingUser, setEditingUser] = useState<AdminManagedUser | null>(null);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editUsername, setEditUsername] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editNewPassword, setEditNewPassword] = useState('');
  const [savingUser, setSavingUser] = useState(false);

  // Create user modal state
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserDisplayName, setNewUserDisplayName] = useState('');
  const [newUserUsername, setNewUserUsername] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserIsAdmin, setNewUserIsAdmin] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);

  const [conversations, setConversations] = useState<AdminManagedConversation[]>([]);
  const [messages, setMessages] = useState<AdminManagedMessage[]>([]);
  const [selectedConvFilter, setSelectedConvFilter] = useState<string | undefined>(undefined);
  const [renamingConv, setRenamingConv] = useState<AdminManagedConversation | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [managingMembersConvId, setManagingMembersConvId] = useState<string | null>(null);
  const [addMemberUserId, setAddMemberUserId] = useState('');
  const [memberBusy, setMemberBusy] = useState(false);
  const [systemMsgConv, setSystemMsgConv] = useState<AdminManagedConversation | null>(null);
  const [systemMsgText, setSystemMsgText] = useState('');
  const [sendingSystemMsg, setSendingSystemMsg] = useState(false);

  // Files & Notifications state
  const [attachments, setAttachments] = useState<AdminAttachmentItem[]>([]);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>([]);
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastTargetUserId, setBroadcastTargetUserId] = useState('');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);

  // Confirmation modal state (replaces window.confirm)
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Security password change state
  const [currAdminPass, setCurrAdminPass] = useState('');
  const [newAdminPass, setNewAdminPass] = useState('');
  const [confirmNewAdminPass, setConfirmNewAdminPass] = useState('');
  const [changingAdminPass, setChangingAdminPass] = useState(false);

  const handleSessionLock = useCallback(() => {
    setAdminToken(null);
    setUnlocked(false);
    setPassword('');
    setConfirmPassword('');
    setAuthError(null);
  }, []);

  const loadAuthStatus = useCallback(async () => {
    setCheckingAuth(true);
    try {
      const status = await adminApi.getAuthStatus();
      setAuthStatus(status);
      if (getAdminToken()) {
        // Verify existing token is still valid
        try {
          const tblRes = await adminApi.getTables();
          setTables(tblRes.tables);
          setLastUpdated(tblRes.fetchedAt);
          setUnlocked(true);
        } catch {
          setAdminToken(null);
          setUnlocked(false);
        }
      }
    } catch (err) {
      if (err instanceof AdminAuthError && err.status === 404) {
        setNotFound(true);
        return;
      }
      setAuthError(err instanceof Error ? err.message : 'Unable to reach admin service');
    } finally {
      setCheckingAuth(false);
    }
  }, []);

  useEffect(() => {
    void loadAuthStatus();
  }, [loadAuthStatus]);

  const refreshAllData = useCallback(
    async (isManual = false) => {
      if (!unlocked) return;
      if (isManual) setRefreshing(true);
      try {
        setBannerError(null);
        const [tblRes, usrRes, convRes, msgRes, siteRes, attRes, notifRes] = await Promise.all([
          adminApi.getTables(),
          adminApi.listUsers(userSearch),
          adminApi.listConversations(),
          adminApi.listMessages(selectedConvFilter),
          adminApi.getSiteConfig(),
          adminApi.listAttachments(),
          adminApi.listNotifications(),
        ]);
        setTables(tblRes.tables);
        setLastUpdated(tblRes.fetchedAt);
        setUsers(usrRes.users);
        setConversations(convRes.conversations);
        setMessages(msgRes.messages);
        setAttachments(attRes.attachments);
        setNotifications(notifRes.notifications);
        setSiteConfig(siteRes.config);
        if (!siteFormDirty) {
          const { updatedAt: _omit, ...formFields } = siteRes.config;
          setSiteForm(formFields);
        }
        if (selectedTable) {
          const detail = await adminApi.getTableDetail(selectedTable);
          setTableDetail(detail);
        }
      } catch (err) {
        if (err instanceof AdminAuthError) {
          if (err.status === 404) {
            setNotFound(true);
            return;
          }
          if (err.status === 401) {
            handleSessionLock();
            return;
          }
        }
        setBannerError(err instanceof Error ? err.message : 'Failed to refresh admin data');
      } finally {
        setRefreshing(false);
      }
    },
    [unlocked, userSearch, selectedConvFilter, selectedTable, siteFormDirty, handleSessionLock]
  );

  useEffect(() => {
    if (unlocked) {
      void refreshAllData();
    }
  }, [unlocked, refreshAllData]);

  useEffect(() => {
    if (!unlocked || !autoRefresh) return;
    const timer = window.setInterval(() => {
      void refreshAllData();
    }, 5000);
    return () => clearInterval(timer);
  }, [unlocked, autoRefresh, refreshAllData]);

  const handleInspectTable = async (name: AdminTableName) => {
    setSelectedTable(name);
    setLoadingDetail(true);
    try {
      const detail = await adminApi.getTableDetail(name);
      setTableDetail(detail);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to load table rows');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleGateSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!authStatus) return;

    if (!authStatus.configured) {
      if (password.length < 8) {
        setAuthError('Admin password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        setAuthError('Passwords do not match');
        return;
      }
      setSubmittingAuth(true);
      try {
        await adminApi.setupPassword(password);
        setAuthStatus({ configured: true, envOverride: false });
        setUnlocked(true);
        setPassword('');
        setConfirmPassword('');
      } catch (err) {
        setAuthError(err instanceof Error ? err.message : 'Failed to set admin password');
      } finally {
        setSubmittingAuth(false);
      }
      return;
    }

    setSubmittingAuth(true);
    try {
      await adminApi.login(password);
      setUnlocked(true);
      setPassword('');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Invalid admin password');
    } finally {
      setSubmittingAuth(false);
    }
  };

  const openEditUser = (u: AdminManagedUser) => {
    setEditingUser(u);
    setEditDisplayName(u.displayName);
    setEditUsername(u.username);
    setEditBio(u.bio);
    setEditNewPassword('');
  };

  const handleSaveUser = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSavingUser(true);
    setBannerError(null);
    try {
      await adminApi.updateUser(editingUser.id, {
        displayName: editDisplayName,
        username: editUsername,
        bio: editBio,
        newPassword: editNewPassword.trim() ? editNewPassword.trim() : undefined,
      });
      setEditingUser(null);
      setBannerSuccess(`Updated user @${editUsername}`);
      await refreshAllData(true);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setSavingUser(false);
    }
  };

  const handleRenameGroup = async (e: FormEvent) => {
    e.preventDefault();
    if (!renamingConv || !renameValue.trim()) return;
    try {
      await adminApi.renameConversation(renamingConv.id, renameValue.trim());
      setRenamingConv(null);
      setBannerSuccess('Updated conversation name');
      await refreshAllData(true);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to rename conversation');
    }
  };

  const handleSaveSiteConfig = async (e: FormEvent) => {
    e.preventDefault();
    if (!siteForm) return;
    setSavingSiteConfig(true);
    setBannerError(null);
    setBannerSuccess(null);
    try {
      const res = await adminApi.updateSiteConfig(siteForm);
      setSiteConfig(res.config);
      const { updatedAt: _omit, ...formFields } = res.config;
      setSiteForm(formFields);
      setSiteFormDirty(false);
      setBannerSuccess('Website controls saved and pushed live to connected users.');
      await refreshAllData(true);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to update website settings');
    } finally {
      setSavingSiteConfig(false);
    }
  };

  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    setBannerError(null);
    try {
      const res = await adminApi.createUser({
        email: newUserEmail.trim(),
        displayName: newUserDisplayName.trim(),
        username: newUserUsername.trim() || undefined,
        password: newUserPassword,
        isAdmin: newUserIsAdmin,
      });
      setCreateUserOpen(false);
      setNewUserEmail('');
      setNewUserDisplayName('');
      setNewUserUsername('');
      setNewUserPassword('');
      setNewUserIsAdmin(false);
      setBannerSuccess(`Created user @${res.user.username}`);
      await refreshAllData(true);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleSendSystemMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!systemMsgConv || !systemMsgText.trim()) return;
    setSendingSystemMsg(true);
    setBannerError(null);
    try {
      await adminApi.sendSystemMessage(systemMsgConv.id, systemMsgText.trim());
      setSystemMsgConv(null);
      setSystemMsgText('');
      setBannerSuccess('System announcement delivered to conversation.');
      await refreshAllData(true);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to send system message');
    } finally {
      setSendingSystemMsg(false);
    }
  };

  const handleBroadcastNotification = async (e: FormEvent) => {
    e.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim()) return;
    setSendingBroadcast(true);
    setBannerError(null);
    try {
      const res = await adminApi.broadcastNotification({
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        targetUserId: broadcastTargetUserId || undefined,
      });
      setBroadcastTitle('');
      setBroadcastBody('');
      setBannerSuccess(`Sent notification to ${res.sentCount} user(s).`);
      await refreshAllData(true);
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setSendingBroadcast(false);
    }
  };

  const handleChangeAdminPassword = async (e: FormEvent) => {
    e.preventDefault();
    setBannerError(null);
    setBannerSuccess(null);
    if (newAdminPass.length < 8) {
      setBannerError('New admin password must be at least 8 characters');
      return;
    }
    if (newAdminPass !== confirmNewAdminPass) {
      setBannerError('New admin passwords do not match');
      return;
    }
    setChangingAdminPass(true);
    try {
      await adminApi.changePassword(currAdminPass, newAdminPass);
      setCurrAdminPass('');
      setNewAdminPass('');
      setConfirmNewAdminPass('');
      setBannerSuccess('Master admin password updated successfully');
    } catch (err) {
      setBannerError(err instanceof Error ? err.message : 'Failed to change admin password');
    } finally {
      setChangingAdminPass(false);
    }
  };

  if (notFound) {
    return <NotFoundScreen />;
  }

  // Render Lock / Setup Screen
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-6">
        <div className="flex flex-col items-center gap-3">
          <LinkUpLogo size="md" />
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Verifying Admin Console...
          </p>
        </div>
      </div>
    );
  }

  if (!unlocked) {
    const needsSetup = authStatus && !authStatus.configured;

    return (
      <div className="min-h-screen flex flex-col justify-center items-center bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 px-4 py-10">
        <div className="w-full max-w-[380px] space-y-6">
          <div className="flex flex-col items-center text-center">
            <LinkUpLogo size="lg" />
            <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              <Shield className="h-3.5 w-3.5" />
              <span>Private Management Console</span>
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-semibold tracking-tight">
              {needsSetup ? 'Set Admin Password' : 'Sign in to Admin'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {needsSetup
                ? 'Create a master password to lock and manage your LinkUp platform.'
                : 'Enter the master admin password to manage users, chats, and live tables.'}
            </p>
          </div>

          {authError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300"
            >
              {authError}
            </div>
          )}

          <form onSubmit={handleGateSubmit} className="space-y-3">
            <div>
              <label
                htmlFor="admin-password"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
              >
                {needsSetup ? 'New Master Admin Password' : 'Master Admin Password'}
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoFocus
                  minLength={needsSetup ? 8 : 1}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={needsSetup ? 'At least 8 characters' : 'Enter admin password'}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {needsSetup && (
              <div>
                <label
                  htmlFor="admin-password-confirm"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
                >
                  Confirm Admin Password
                </label>
                <input
                  id="admin-password-confirm"
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat master password"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            )}

            <button
              type="submit"
              disabled={submittingAuth}
              className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Lock className="h-4 w-4" />
              <span>
                {submittingAuth
                  ? 'Verifying...'
                  : needsSetup
                  ? 'Create Password & Open Admin'
                  : 'Unlock Admin Console'}
              </span>
            </button>
          </form>

          <div className="text-center pt-2">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Return to LinkUp</span>
            </a>
          </div>
        </div>
      </div>
    );
  }

  const totalRows = tables.reduce((acc, t) => acc + t.rowCount, 0);
  const onlineUsersCount = users.filter((u) => u.status === 'online').length;
  const totalMessagesCount = tables.find((t) => t.name === 'messages')?.rowCount ?? 0;

  const navItems: { id: AdminSection; label: string; Icon: typeof Database }[] = [
    { id: 'site', label: 'Website Controls', Icon: Globe },
    { id: 'database', label: 'Database & Tables', Icon: Database },
    { id: 'users', label: `Users (${users.length})`, Icon: Users },
    { id: 'chats', label: `Chats (${conversations.length})`, Icon: MessageSquare },
    { id: 'files', label: `Files & Alerts (${attachments.length})`, Icon: Bell },
    { id: 'security', label: 'Security', Icon: KeyRound },
  ];

  const managingMembersConv = managingMembersConvId
    ? conversations.find((c) => c.id === managingMembersConvId) || null
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Top Bar */}
      <header className="sticky top-0 z-20 h-14 px-4 sm:px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <LinkUpLogo size="sm" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display font-semibold text-sm tracking-tight truncate">
                LinkUp Admin Console
              </span>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-[11px] font-medium">
                <Shield className="h-3 w-3" />
                @{currentUser.username}
              </span>
            </div>
            {lastUpdated && (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Synced {new Date(lastUpdated).toLocaleTimeString()}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setAutoRefresh((p) => !p)}
            className={`hidden sm:inline-flex px-3 py-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
              autoRefresh
                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
            }`}
          >
            Auto: {autoRefresh ? '5s' : 'Off'}
          </button>

          <button
            type="button"
            disabled={refreshing}
            onClick={() => void refreshAllData(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <a
            href="/"
            className="hidden md:inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Open App
          </a>

          <button
            type="button"
            onClick={handleSessionLock}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Lock</span>
          </button>
        </div>
      </header>

      {/* Sub-navigation Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 overflow-x-auto">
        <div className="max-w-6xl mx-auto flex items-center gap-1">
          {navItems.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setSection(id);
                  setBannerError(null);
                  setBannerSuccess(null);
                }}
                className={`inline-flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                  active
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto space-y-6 pb-12">
          {bannerError && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3"
            >
              <span>{bannerError}</span>
              <button type="button" onClick={() => setBannerError(null)} className="cursor-pointer">
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {bannerSuccess && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/40 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300 flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <Check className="h-4 w-4" />
                {bannerSuccess}
              </span>
              <button
                type="button"
                onClick={() => setBannerSuccess(null)}
                className="cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* KPI Summary Row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Registered Users
              </p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-display text-2xl font-semibold tabular-nums">
                  {users.length}
                </span>
                <span className="text-xs text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {onlineUsersCount} online
                </span>
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Conversations
              </p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {conversations.length}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total Messages
              </p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {totalMessagesCount}
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Total DB Rows ({tables.length} tables)
              </p>
              <p className="mt-1 font-display text-2xl font-semibold tabular-nums">
                {totalRows}
              </p>
            </div>
          </div>

          {/* SECTION 0: WEBSITE CONTROLS */}
          {section === 'site' && (
            <div className="space-y-6">
              {!siteForm ? (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 text-xs text-slate-500">
                  Loading website controls...
                </div>
              ) : (
                <form onSubmit={handleSaveSiteConfig} className="space-y-6">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Branding & Identity */}
                    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                      <div>
                        <h2 className="font-display font-semibold text-sm">
                          Branding & Site Identity
                        </h2>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Updates page title, sign-in heading, and tagline across the website.
                        </p>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Website Name</label>
                          <input
                            type="text"
                            required
                            maxLength={80}
                            value={siteForm.siteName}
                            onChange={(e) => {
                              setSiteFormDirty(true);
                              setSiteForm({ ...siteForm, siteName: e.target.value });
                            }}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Tagline</label>
                          <input
                            type="text"
                            maxLength={180}
                            value={siteForm.tagline}
                            onChange={(e) => {
                              setSiteFormDirty(true);
                              setSiteForm({ ...siteForm, tagline: e.target.value });
                            }}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>
                    </section>

                    {/* Global Announcement Banner */}
                    <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h2 className="font-display font-semibold text-sm">
                            Global Announcement Banner
                          </h2>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Broadcast a live top banner to every open browser tab immediately.
                          </p>
                        </div>
                        {siteForm.announcementText && (
                          <button
                            type="button"
                            onClick={() => {
                              setSiteFormDirty(true);
                              setSiteForm({ ...siteForm, announcementText: '' });
                            }}
                            className="text-xs text-slate-500 hover:text-red-600 cursor-pointer"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium mb-1">Banner Message</label>
                          <input
                            type="text"
                            maxLength={400}
                            placeholder="Leave blank to hide banner..."
                            value={siteForm.announcementText}
                            onChange={(e) => {
                              setSiteFormDirty(true);
                              setSiteForm({ ...siteForm, announcementText: e.target.value });
                            }}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium mb-1">Banner Style</label>
                          <select
                            value={siteForm.announcementTone}
                            onChange={(e) => {
                              setSiteFormDirty(true);
                              setSiteForm({
                                ...siteForm,
                                announcementTone: e.target.value as 'info' | 'warning' | 'success',
                              });
                            }}
                            className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="info">Info (Indigo)</option>
                            <option value="warning">Warning (Amber)</option>
                            <option value="success">Success (Emerald)</option>
                          </select>
                        </div>
                      </div>
                    </section>
                  </div>

                  {/* Feature & Access Toggles */}
                  <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                    <div>
                      <h2 className="font-display font-semibold text-sm">
                        Feature & Access Controls
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Enforced across API routes, WebSockets, and client UI in real time.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        {
                          key: 'allowSignups' as const,
                          title: 'Allow New Signups',
                          desc: 'Permit new accounts to register via email or Google.',
                        },
                        {
                          key: 'allowGroupCreation' as const,
                          title: 'Allow Group Creation',
                          desc: 'Allow users to create new multi-member group rooms.',
                        },
                        {
                          key: 'allowFileUploads' as const,
                          title: 'Allow File & Image Uploads',
                          desc: 'Enable attachment uploads in message composers.',
                        },
                        {
                          key: 'maintenanceMode' as const,
                          title: 'Maintenance Mode',
                          desc: 'Pause site access for non-admin users while keeping /admin open.',
                        },
                      ].map((item) => {
                        const enabled = siteForm[item.key];
                        return (
                          <div
                            key={item.key}
                            className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 p-3.5"
                          >
                            <div>
                              <p className="text-xs font-semibold">{item.title}</p>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {item.desc}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setSiteFormDirty(true);
                                setSiteForm({ ...siteForm, [item.key]: !enabled });
                              }}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium shrink-0 cursor-pointer transition-colors ${
                                enabled
                                  ? item.key === 'maintenanceMode'
                                    ? 'bg-amber-600 text-white'
                                    : 'bg-indigo-600 text-white'
                                  : 'border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                              }`}
                            >
                              {enabled ? 'Enabled' : 'Disabled'}
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Max Attachment Size (MB, 1–25)
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={siteForm.maxAttachmentMb}
                          onChange={(e) => {
                            setSiteFormDirty(true);
                            setSiteForm({
                              ...siteForm,
                              maxAttachmentMb: Math.max(
                                1,
                                Math.min(25, Number(e.target.value) || 1)
                              ),
                            });
                          }}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1">
                          Maintenance Notice Message
                        </label>
                        <input
                          type="text"
                          maxLength={400}
                          value={siteForm.maintenanceMessage}
                          onChange={(e) => {
                            setSiteFormDirty(true);
                            setSiteForm({ ...siteForm, maintenanceMessage: e.target.value });
                          }}
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <span className="text-[11px] text-slate-500">
                        {siteConfig?.updatedAt
                          ? `Last saved ${new Date(siteConfig.updatedAt).toLocaleString()}`
                          : ''}
                        {siteFormDirty ? ' · Unsaved changes' : ''}
                      </span>
                      <button
                        type="submit"
                        disabled={savingSiteConfig}
                        className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium cursor-pointer"
                      >
                        {savingSiteConfig ? 'Saving & Pushing Live...' : 'Save Website Controls'}
                      </button>
                    </div>
                  </section>
                </form>
              )}
            </div>
          )}

          {/* SECTION 1: DATABASE TABLES */}
          {section === 'database' && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <h2 className="font-display font-semibold text-sm">
                      Live PostgreSQL Tables & Row Counts
                    </h2>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-5">Table Name</th>
                        <th className="py-3 px-4 hidden md:table-cell">Purpose</th>
                        <th className="py-3 px-4">Last Activity</th>
                        <th className="py-3 px-4 text-right">Rows</th>
                        <th className="py-3 px-5 text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                      {tables.map((tbl) => {
                        const isSelected = selectedTable === tbl.name;
                        return (
                          <tr
                            key={tbl.name}
                            className={`transition-colors ${
                              isSelected
                                ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                            }`}
                          >
                            <td className="py-3 px-5 font-mono text-xs font-medium">
                              {tbl.name}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 hidden md:table-cell">
                              {tbl.description}
                            </td>
                            <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                              {tbl.lastActivityAt
                                ? formatConversationTimestamp(tbl.lastActivityAt)
                                : 'No records'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-xs font-semibold tabular-nums">
                              {tbl.rowCount}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <button
                                type="button"
                                onClick={() => void handleInspectTable(tbl.name)}
                                className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap cursor-pointer"
                              >
                                View rows
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-display font-semibold text-sm">Database Cleanup</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Permanently prune soft-deleted message stubs or read notification rows.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Purge soft-deleted messages?',
                        description:
                          'This permanently removes all rows in messages where deleted_at is set.',
                        confirmLabel: 'Purge Messages',
                        onConfirm: async () => {
                          const res = await adminApi.purgeDeletedMessages();
                          setBannerSuccess(`Purged ${res.removed} soft-deleted message row(s).`);
                          await refreshAllData(true);
                        },
                      })
                    }
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                  >
                    Purge Deleted Messages
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmAction({
                        title: 'Purge read notifications?',
                        description:
                          'This permanently deletes notifications already marked as read.',
                        confirmLabel: 'Purge Notifications',
                        onConfirm: async () => {
                          const res = await adminApi.purgeReadNotifications();
                          setBannerSuccess(`Purged ${res.removed} read notification row(s).`);
                          await refreshAllData(true);
                        },
                      })
                    }
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
                  >
                    Purge Read Notifications
                  </button>
                </div>
              </section>

              {selectedTable && (
                <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <TableIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="font-mono font-semibold text-sm">{selectedTable}</h3>
                      {tableDetail && (
                        <span className="text-xs text-slate-500 tabular-nums">
                          · Showing latest {tableDetail.rows.length} of {tableDetail.rowCount} rows
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedTable(null);
                        setTableDetail(null);
                      }}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {loadingDetail ? (
                    <div className="p-6 text-xs text-slate-500">Loading rows...</div>
                  ) : !tableDetail || tableDetail.rows.length === 0 ? (
                    <div className="p-8 text-center text-xs text-slate-500">
                      No rows in <span className="font-mono">{selectedTable}</span> yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono text-slate-500 bg-slate-50/70 dark:bg-slate-950/50">
                            {tableDetail.columns.map((col) => (
                              <th key={col} className="py-2.5 px-4 whitespace-nowrap">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs font-mono">
                          {tableDetail.rows.map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              {tableDetail.columns.map((col) => {
                                const val = row[col];
                                return (
                                  <td
                                    key={col}
                                    className="py-2.5 px-4 max-w-[220px] truncate text-slate-700 dark:text-slate-300"
                                    title={val === null ? 'null' : String(val)}
                                  >
                                    {val === null ? (
                                      <span className="text-slate-400 italic">null</span>
                                    ) : typeof val === 'boolean' ? (
                                      val ? 'true' : 'false'
                                    ) : (
                                      String(val)
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
              )}
            </div>
          )}

          {/* SECTION 2: USER MANAGEMENT */}
          {section === 'users' && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="p-4 sm:px-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-semibold text-sm">User Management</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Edit user profiles, reset login passwords, or remove accounts.
                  </p>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="search"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Filter users..."
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCreateUserOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium shrink-0 cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>Create User</span>
                  </button>
                </div>
              </div>

              {users.length === 0 ? (
                <div className="p-10 text-center text-xs text-slate-500">
                  No registered users match your filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                        <th className="py-3 px-5">User</th>
                        <th className="py-3 px-4">Email</th>
                        <th className="py-3 px-4">Access</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Chats</th>
                        <th className="py-3 px-4 text-right">Msgs</th>
                        <th className="py-3 px-5 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {users.map((u) => {
                        const isSelf = u.id === currentUser.id;
                        return (
                          <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-5">
                              <p className="font-medium text-slate-900 dark:text-slate-100">
                                {u.displayName}
                                {isSelf && (
                                  <span className="ml-1.5 text-[10px] text-indigo-600 dark:text-indigo-400">
                                    (You)
                                  </span>
                                )}
                              </p>
                              <p className="font-mono text-[11px] text-slate-500">@{u.username}</p>
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                              {u.email || '—'}
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex flex-wrap items-center gap-1">
                                <span
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                    u.isAdmin
                                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {u.isAdmin ? 'Admin' : 'User'}
                                </span>
                                {u.isBanned && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300">
                                    Suspended
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1.5 font-medium ${
                                  u.status === 'online'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                <span
                                  className={`h-1.5 w-1.5 rounded-full ${
                                    u.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'
                                  }`}
                                />
                                {u.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {u.conversationCount}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {u.messageCount}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={isSelf}
                                  title={
                                    isSelf
                                      ? 'You cannot revoke your own admin access'
                                      : u.isAdmin
                                      ? 'Revoke /admin access'
                                      : 'Grant /admin access'
                                  }
                                  onClick={async () => {
                                    try {
                                      await adminApi.updateUser(u.id, { isAdmin: !u.isAdmin });
                                      setBannerSuccess(
                                        !u.isAdmin
                                          ? `Granted /admin access to @${u.username}`
                                          : `Revoked /admin access from @${u.username}`
                                      );
                                      await refreshAllData(true);
                                    } catch (err) {
                                      setBannerError(
                                        err instanceof Error
                                          ? err.message
                                          : 'Failed to update access'
                                      );
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                    u.isAdmin
                                      ? 'border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                                  }`}
                                >
                                  <Shield className="h-3 w-3" />
                                  <span>{u.isAdmin ? 'Revoke Admin' : 'Make Admin'}</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isSelf}
                                  title={
                                    isSelf
                                      ? 'You cannot suspend your own account'
                                      : u.isBanned
                                      ? 'Restore account access'
                                      : 'Suspend account immediately'
                                  }
                                  onClick={async () => {
                                    try {
                                      await adminApi.updateUser(u.id, { isBanned: !u.isBanned });
                                      setBannerSuccess(
                                        !u.isBanned
                                          ? `Suspended @${u.username}`
                                          : `Restored access for @${u.username}`
                                      );
                                      await refreshAllData(true);
                                    } catch (err) {
                                      setBannerError(
                                        err instanceof Error ? err.message : 'Failed to update status'
                                      );
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                                    u.isBanned
                                      ? 'border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40'
                                      : 'border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                                  }`}
                                >
                                  {u.isBanned ? (
                                    <CheckCircle2 className="h-3 w-3" />
                                  ) : (
                                    <Ban className="h-3 w-3" />
                                  )}
                                  <span>{u.isBanned ? 'Unban' : 'Suspend'}</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => openEditUser(u)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
                                >
                                  <Edit3 className="h-3 w-3" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={isSelf}
                                  onClick={() =>
                                    setConfirmAction({
                                      title: `Delete @${u.username}?`,
                                      description: `This permanently deletes ${u.displayName}'s profile, messages, settings, and empty direct chats.`,
                                      confirmLabel: 'Delete User',
                                      onConfirm: async () => {
                                        await adminApi.deleteUser(u.id);
                                        setBannerSuccess(`Deleted user @${u.username}`);
                                        await refreshAllData(true);
                                      },
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <Trash2 className="h-3 w-3" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {/* SECTION 3: CHATS & MESSAGES MODERATION */}
          {section === 'chats' && (
            <div className="space-y-6">
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h2 className="font-display font-semibold text-sm">All Conversations</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Inspect conversation activity, rename groups, or delete rooms.
                    </p>
                  </div>
                </div>

                {conversations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No conversations exist yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-5">Room</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Members</th>
                          <th className="py-3 px-4 text-right">Msgs</th>
                          <th className="py-3 px-4">Last Activity</th>
                          <th className="py-3 px-5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {conversations.map((conv) => (
                          <tr
                            key={conv.id}
                            className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                              selectedConvFilter === conv.id
                                ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                                : ''
                            }`}
                          >
                            <td className="py-3 px-5">
                              <p className="font-medium">
                                {conv.type === 'group'
                                  ? conv.name || 'Unnamed Group'
                                  : conv.members.map((m) => `@${m.username}`).join(' ↔ ') ||
                                    'Direct Chat'}
                              </p>
                              <p className="font-mono text-[10px] text-slate-400">{conv.id}</p>
                            </td>
                            <td className="py-3 px-4 font-mono uppercase text-[11px]">
                              {conv.type}
                            </td>
                            <td className="py-3 px-4 text-slate-600 dark:text-slate-400 max-w-[240px] truncate">
                              {conv.members.map((m) => m.displayName).join(', ')} (
                              {conv.memberCount})
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {conv.messageCount}
                            </td>
                            <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                              {formatConversationTimestamp(conv.lastMessageAt)}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSelectedConvFilter((prev) =>
                                      prev === conv.id ? undefined : conv.id
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
                                >
                                  {selectedConvFilter === conv.id ? 'Show All Msgs' : 'Messages'}
                                </button>
                                {conv.type === 'group' && (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setRenamingConv(conv);
                                        setRenameValue(conv.name || '');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
                                    >
                                      Rename
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setManagingMembersConvId(conv.id);
                                        setAddMemberUserId('');
                                      }}
                                      className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-medium cursor-pointer"
                                    >
                                      Members
                                    </button>
                                  </>
                                )}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSystemMsgConv(conv);
                                    setSystemMsgText('');
                                  }}
                                  className="px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-900/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-medium cursor-pointer"
                                >
                                  Announce
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setConfirmAction({
                                      title: 'Delete conversation?',
                                      description:
                                        'This permanently deletes the conversation and all messages inside it.',
                                      confirmLabel: 'Delete Conversation',
                                      onConfirm: async () => {
                                        await adminApi.deleteConversation(conv.id);
                                        if (selectedConvFilter === conv.id) {
                                          setSelectedConvFilter(undefined);
                                        }
                                        setBannerSuccess('Conversation deleted');
                                        await refreshAllData(true);
                                      },
                                    })
                                  }
                                  className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium cursor-pointer"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="font-display font-semibold text-sm">
                      {selectedConvFilter ? 'Conversation Messages' : 'Recent Platform Messages'}
                    </h3>
                  </div>
                  {selectedConvFilter && (
                    <button
                      type="button"
                      onClick={() => setSelectedConvFilter(undefined)}
                      className="text-xs text-indigo-600 dark:text-indigo-400 font-medium cursor-pointer"
                    >
                      Clear filter
                    </button>
                  )}
                </div>

                {messages.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No messages recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-5">Sender</th>
                          <th className="py-3 px-4">Room</th>
                          <th className="py-3 px-4">Content</th>
                          <th className="py-3 px-4">Sent</th>
                          <th className="py-3 px-5 text-right">Moderation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {messages.map((m) => (
                          <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-5 whitespace-nowrap">
                              <span className="font-medium">{m.senderDisplayName}</span>{' '}
                              <span className="font-mono text-slate-400">@{m.senderUsername}</span>
                            </td>
                            <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                              {m.conversationLabel}
                            </td>
                            <td className="py-3 px-4 max-w-[340px] truncate">
                              {m.deletedAt ? (
                                <span className="italic text-slate-400">Soft-deleted</span>
                              ) : m.content ? (
                                m.content
                              ) : (
                                <span className="italic text-slate-400">[{m.messageType}]</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                              {formatConversationTimestamp(m.createdAt)}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: 'Delete this message?',
                                    description:
                                      'This permanently removes the message row from PostgreSQL.',
                                    confirmLabel: 'Delete Message',
                                    onConfirm: async () => {
                                      await adminApi.deleteMessage(m.id);
                                      setBannerSuccess('Message removed');
                                      await refreshAllData(true);
                                    },
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* SECTION 4: FILES & ALERTS */}
          {section === 'files' && (
            <div className="space-y-6">
              {/* Broadcast Notification */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <Megaphone className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <div>
                    <h2 className="font-display font-semibold text-sm">
                      Broadcast In-App Notification
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Send an instant real-time notification to all users or a selected account.
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={handleBroadcastNotification}
                  className="grid grid-cols-1 md:grid-cols-3 gap-3"
                >
                  <div>
                    <label className="block text-xs font-medium mb-1">Title</label>
                    <input
                      type="text"
                      required
                      maxLength={120}
                      value={broadcastTitle}
                      onChange={(e) => setBroadcastTitle(e.target.value)}
                      placeholder="System Update"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium mb-1">Recipient</label>
                    <select
                      value={broadcastTargetUserId}
                      onChange={(e) => setBroadcastTargetUserId(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                    >
                      <option value="">All Registered Users ({users.length})</option>
                      {users.map((u) => (
                        <option key={u.id} value={u.id}>
                          @{u.username} — {u.displayName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="md:col-span-3 flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                    <div className="flex-1">
                      <label className="block text-xs font-medium mb-1">Message Body</label>
                      <input
                        type="text"
                        required
                        maxLength={500}
                        value={broadcastBody}
                        onChange={(e) => setBroadcastBody(e.target.value)}
                        placeholder="Write notification message..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={sendingBroadcast}
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium cursor-pointer shrink-0 h-[38px]"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>{sendingBroadcast ? 'Sending...' : 'Send Notification'}</span>
                    </button>
                  </div>
                </form>
              </section>

              {/* Attachments */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="font-display font-semibold text-sm">
                    Uploaded Files & Attachments ({attachments.length})
                  </h2>
                </div>
                {attachments.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No files have been uploaded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-5">File</th>
                          <th className="py-3 px-4">Uploader</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4 text-right">Size</th>
                          <th className="py-3 px-4">Uploaded</th>
                          <th className="py-3 px-5 text-right">Moderation</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {attachments.map((att) => (
                          <tr key={att.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-5 font-medium max-w-[240px] truncate">
                              {att.fileName}
                            </td>
                            <td className="py-3 px-4 font-mono text-slate-500">
                              @{att.uploaderUsername}
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                              {att.mimeType}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">
                              {formatFileSize(att.fileSize)}
                            </td>
                            <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                              {formatConversationTimestamp(att.createdAt)}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmAction({
                                    title: `Delete ${att.fileName}?`,
                                    description:
                                      'This deletes the attachment metadata and removes the stored file from disk.',
                                    confirmLabel: 'Delete File',
                                    onConfirm: async () => {
                                      await adminApi.deleteAttachment(att.id);
                                      setBannerSuccess(`Deleted file ${att.fileName}`);
                                      await refreshAllData(true);
                                    },
                                  })
                                }
                                className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>

              {/* Recent Notifications */}
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
                  <Bell className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <h2 className="font-display font-semibold text-sm">
                    Recent Notifications ({notifications.length})
                  </h2>
                </div>
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No notifications recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-500 dark:text-slate-400">
                          <th className="py-3 px-5">Recipient</th>
                          <th className="py-3 px-4">Title & Body</th>
                          <th className="py-3 px-4">Type</th>
                          <th className="py-3 px-4">Status</th>
                          <th className="py-3 px-4">Created</th>
                          <th className="py-3 px-5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                        {notifications.map((n) => (
                          <tr key={n.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                            <td className="py-3 px-5 font-mono text-slate-600 dark:text-slate-300">
                              @{n.recipientUsername}
                            </td>
                            <td className="py-3 px-4 max-w-[320px]">
                              <p className="font-medium truncate">{n.title}</p>
                              <p className="text-slate-500 truncate">{n.body}</p>
                            </td>
                            <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                              {n.type}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                  n.isRead
                                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                    : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                }`}
                              >
                                {n.isRead ? 'Read' : 'Unread'}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-slate-500 tabular-nums whitespace-nowrap">
                              {formatConversationTimestamp(n.createdAt)}
                            </td>
                            <td className="py-3 px-5 text-right">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await adminApi.deleteNotification(n.id);
                                    setBannerSuccess('Notification removed');
                                    await refreshAllData(true);
                                  } catch (err) {
                                    setBannerError(
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to delete notification'
                                    );
                                  }
                                }}
                                className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium cursor-pointer"
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>
          )}

          {/* SECTION 5: SECURITY */}
          {section === 'security' && (
            <div className="max-w-xl space-y-6">
              <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
                <div>
                  <h2 className="font-display font-semibold text-sm">Admin Console Password</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {authStatus?.envOverride
                      ? 'Currently managed via the ADMIN_PASSWORD environment secret.'
                      : 'Stored as a salted scrypt hash in Cloud SQL (admin_config).'}
                  </p>
                </div>

                {!authStatus?.envOverride && (
                  <form onSubmit={handleChangeAdminPassword} className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Current Admin Password
                      </label>
                      <input
                        type="password"
                        required
                        value={currAdminPass}
                        onChange={(e) => setCurrAdminPass(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">New Admin Password</label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={newAdminPass}
                        onChange={(e) => setNewAdminPass(e.target.value)}
                        placeholder="At least 8 characters"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Confirm New Admin Password
                      </label>
                      <input
                        type="password"
                        required
                        minLength={8}
                        value={confirmNewAdminPass}
                        onChange={(e) => setConfirmNewAdminPass(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={changingAdminPass}
                      className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-medium cursor-pointer"
                    >
                      {changingAdminPass ? 'Updating...' : 'Update Master Password'}
                    </button>
                  </form>
                )}
              </section>
            </div>
          )}
        </div>
      </main>

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base">
                Edit User @{editingUser.username}
              </h3>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Bio</label>
                <textarea
                  rows={2}
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  Reset Password (optional)
                </label>
                <input
                  type="password"
                  minLength={6}
                  value={editNewPassword}
                  onChange={(e) => setEditNewPassword(e.target.value)}
                  placeholder="Leave blank to keep existing"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUser}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                >
                  {savingUser ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create User Modal */}
      {createUserOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base">Create New User</h3>
              <button
                type="button"
                onClick={() => setCreateUserOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Display Name</label>
                <input
                  type="text"
                  required
                  value={newUserDisplayName}
                  onChange={(e) => setNewUserDisplayName(e.target.value)}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Username (optional)</label>
                <input
                  type="text"
                  value={newUserUsername}
                  onChange={(e) => setNewUserUsername(e.target.value)}
                  placeholder="Auto-generated if left blank"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Initial Password</label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={newUserIsAdmin}
                  onChange={(e) => setNewUserIsAdmin(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Grant /admin access to this user</span>
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateUserOpen(false)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                >
                  {creatingUser ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename Group Modal */}
      {renamingConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h3 className="font-display font-semibold text-base">Rename Group</h3>
            <form onSubmit={handleRenameGroup} className="space-y-3">
              <input
                type="text"
                required
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setRenamingConv(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                >
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Group Members Modal */}
      {managingMembersConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base truncate">
                Members · {managingMembersConv.name || 'Group'}
              </h3>
              <button
                type="button"
                onClick={() => setManagingMembersConvId(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl">
              {managingMembersConv.members.map((m) => (
                <div
                  key={m.userId}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{m.displayName}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      @{m.username} · {m.role}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={memberBusy}
                    onClick={async () => {
                      setMemberBusy(true);
                      try {
                        await adminApi.removeConversationMember(managingMembersConv.id, m.userId);
                        setBannerSuccess(`Removed @${m.username} from group`);
                        await refreshAllData(true);
                      } catch (err) {
                        setBannerError(
                          err instanceof Error ? err.message : 'Failed to remove member'
                        );
                      } finally {
                        setMemberBusy(false);
                      }
                    }}
                    className="px-2.5 py-1 rounded-lg border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 font-medium cursor-pointer shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-1">
              <select
                value={addMemberUserId}
                onChange={(e) => setAddMemberUserId(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-xs"
              >
                <option value="">Select user to add...</option>
                {users
                  .filter(
                    (u) => !managingMembersConv.members.some((m) => m.userId === u.id)
                  )
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      @{u.username} — {u.displayName}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={!addMemberUserId || memberBusy}
                onClick={async () => {
                  if (!addMemberUserId) return;
                  setMemberBusy(true);
                  try {
                    await adminApi.addConversationMember(
                      managingMembersConv.id,
                      addMemberUserId
                    );
                    setAddMemberUserId('');
                    setBannerSuccess('Added member to group');
                    await refreshAllData(true);
                  } catch (err) {
                    setBannerError(
                      err instanceof Error ? err.message : 'Failed to add member'
                    );
                  } finally {
                    setMemberBusy(false);
                  }
                }}
                className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-medium cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Send System Message Modal */}
      {systemMsgConv && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold text-base truncate">
                Announce to{' '}
                {systemMsgConv.type === 'group'
                  ? systemMsgConv.name || 'Group'
                  : 'Conversation'}
              </h3>
              <button
                type="button"
                onClick={() => setSystemMsgConv(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleSendSystemMessage} className="space-y-3">
              <textarea
                rows={3}
                required
                maxLength={1000}
                value={systemMsgText}
                onChange={(e) => setSystemMsgText(e.target.value)}
                placeholder="Type a system message visible to all participants..."
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 text-sm"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSystemMsgConv(null)}
                  className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingSystemMsg}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium cursor-pointer"
                >
                  {sendingSystemMsg ? 'Sending...' : 'Send Announcement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {confirmAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <div>
              <h3 className="font-display font-semibold text-base">{confirmAction.title}</h3>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                {confirmAction.description}
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setConfirmAction(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={async () => {
                  setConfirmBusy(true);
                  try {
                    await confirmAction.onConfirm();
                    setConfirmAction(null);
                  } catch (err) {
                    setBannerError(err instanceof Error ? err.message : 'Action failed');
                    setConfirmAction(null);
                  } finally {
                    setConfirmBusy(false);
                  }
                }}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-medium cursor-pointer"
              >
                {confirmBusy ? 'Working...' : confirmAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
