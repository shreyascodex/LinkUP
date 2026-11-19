import { useState } from 'react';
import { Users } from 'lucide-react';
import { getAvatarTone, getInitials } from '../../lib/utils/format';

interface AvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: 'online' | 'offline';
  isGroup?: boolean;
}

const SIZE_CLASSES = {
  xs: 'h-7 w-7 text-[11px]',
  sm: 'h-9 w-9 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
};

const DOT_CLASSES = {
  xs: 'h-2 w-2',
  sm: 'h-2.5 w-2.5',
  md: 'h-2.5 w-2.5',
  lg: 'h-3 w-3',
  xl: 'h-3.5 w-3.5',
};

export function Avatar({ src, name, size = 'md', status, isGroup = false }: AvatarProps) {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="relative inline-flex shrink-0">
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${SIZE_CLASSES[size]} rounded-full object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800`}
        />
      ) : (
        <div
          aria-label={name}
          className={`${SIZE_CLASSES[size]} ${getAvatarTone(name)} rounded-full flex items-center justify-center font-display font-semibold border border-slate-200/80 dark:border-slate-700/80 select-none`}
        >
          {isGroup ? <Users className="h-4 w-4" /> : getInitials(name)}
        </div>
      )}
      {status === 'online' && !isGroup && (
        <span
          title="Online"
          className={`${DOT_CLASSES[size]} absolute bottom-0 right-0 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900`}
        />
      )}
    </div>
  );
}
