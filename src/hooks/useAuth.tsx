import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { auth, signOut } from '../lib/firebase';
import { api, getLocalAuthToken, setLocalAuthToken } from '../lib/api';
import type { MyProfile, UserSettings } from '../types/chat';

interface AuthContextValue {
  firebaseUser: User | null;
  profile: MyProfile | null;
  settings: UserSettings | null;
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  setProfile: (profile: MyProfile) => void;
  setSettings: (settings: UserSettings) => void;
  loginWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAccount = useCallback(async (user: User | null) => {
    const localToken = getLocalAuthToken();

    if (!user && !localToken) {
      setProfile(null);
      setSettings(null);
      setError(null);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const data = await api.getMe();
      setProfile(data.profile);
      setSettings(data.settings);
    } catch (err) {
      if (localToken && !user) {
        setLocalAuthToken(null);
        setProfile(null);
        setSettings(null);
      } else {
        setError(err instanceof Error ? err.message : 'Unable to sync your LinkUp profile');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setFirebaseUser(user);
      if (user) {
        setLocalAuthToken(null);
      }
      setLoading(true);
      void loadAccount(user);
    });
    return () => unsub();
  }, [loadAccount]);

  const refreshProfile = useCallback(async () => {
    await loadAccount(auth.currentUser);
  }, [loadAccount]);

  const loginWithEmail = useCallback(async (email: string, password: string) => {
    const res = await api.authLogin({ email, password });
    setLocalAuthToken(res.token);
    setProfile(res.profile);
    setSettings(res.settings);
    setError(null);
  }, []);

  const registerWithEmail = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const res = await api.authRegister({ email, password, displayName });
      setLocalAuthToken(res.token);
      setProfile(res.profile);
      setSettings(res.settings);
      setError(null);
    },
    []
  );

  const logout = useCallback(async () => {
    setLocalAuthToken(null);
    if (auth.currentUser) {
      await signOut(auth);
    }
    setProfile(null);
    setSettings(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        settings,
        loading,
        error,
        refreshProfile,
        setProfile,
        setSettings,
        loginWithEmail,
        registerWithEmail,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
