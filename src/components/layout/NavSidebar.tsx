import { Bell, Compass, MessageSquare, Moon, Settings, Sun } from 'lucide-react';
import { Avatar } from '../ui/Avatar';
import { LinkUpLogo } from '../ui/LinkUpLogo';
import type { MyProfile, ThemePreference } from '../../types/chat';

export type MainTab = 'messages' | 'discover' | 'notifications' | 'settings';

interface NavSidebarProps {
  activeTab: MainTab;
  onSelectTab: (tab: MainTab) => void;
  profile: MyProfile;
  unreadMessagesCount: number;
  unreadNotificationsCount: number;
  themePreference: ThemePreference;
  onCycleTheme: () => void;
  hideMobileBar?: boolean;
}

export function NavSidebar({
  activeTab,
  onSelectTab,
  profile,
  unreadMessagesCount,
  unreadNotificationsCount,
  themePreference,
  onCycleTheme,
  hideMobileBar = false,
}: NavSidebarProps) {
  const navItems: {
    id: MainTab;
    label: string;
    Icon: typeof MessageSquare;
    badge?: number;
  }[] = [
    { id: 'messages', label: 'Messages', Icon: MessageSquare, badge: unreadMessagesCount },
    { id: 'discover', label: 'People', Icon: Compass },
    { id: 'notifications', label: 'Alerts', Icon: Bell, badge: unreadNotificationsCount },
    { id: 'settings', label: 'Settings', Icon: Settings },
  ];

  return (
    <>
      {/* Desktop Rail */}
      <nav
        aria-label="Primary navigation"
        className="hidden md:flex w-[68px] shrink-0 flex-col items-center justify-between py-4 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
      >
        <div className="flex flex-col items-center gap-4">
          <button
            type="button"
            onClick={() => onSelectTab('messages')}
            title="LinkUp"
            aria-label="LinkUp Home"
            className="cursor-pointer rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <LinkUpLogo size="md" />
          </button>

          <div className="flex flex-col items-center gap-1.5 pt-2">
            {navItems.map(({ id, label, Icon, badge }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectTab(id)}
                  title={label}
                  aria-label={label}
                  className={`relative h-11 w-11 rounded-xl flex items-center justify-center transition-colors cursor-pointer ${
                    active
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {badge !== undefined && badge > 0 && (
                    <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={onCycleTheme}
            title={`Theme: ${themePreference}`}
            aria-label="Toggle color theme"
            className="h-10 w-10 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {themePreference === 'dark' ? (
              <Sun className="h-4.5 w-4.5" />
            ) : (
              <Moon className="h-4.5 w-4.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('settings')}
            title={`${profile.displayName} (@${profile.username})`}
            className="cursor-pointer rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <Avatar
              src={profile.avatarUrl}
              name={profile.displayName}
              size="sm"
              status="online"
            />
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      {!hideMobileBar && (
        <nav
          aria-label="Mobile navigation"
          className="md:hidden fixed bottom-0 inset-x-0 z-30 h-14 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-around px-2"
        >
          {navItems.map(({ id, label, Icon, badge }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                className={`relative flex flex-col items-center justify-center min-w-[60px] min-h-[44px] rounded-xl text-[11px] font-medium transition-colors ${
                  active
                    ? 'text-indigo-600 dark:text-indigo-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="mt-0.5">{label}</span>
                {badge !== undefined && badge > 0 && (
                  <span className="absolute top-1 right-2.5 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[10px] font-semibold tabular-nums flex items-center justify-center">
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      )}
    </>
  );
}
