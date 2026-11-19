interface LinkUpLogoProps {
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES = {
  sm: 'h-8 w-8 rounded-lg',
  md: 'h-10 w-10 rounded-xl',
  lg: 'h-12 w-12 rounded-2xl',
};

const ICON_CLASSES = {
  sm: 'h-4.5 w-4.5',
  md: 'h-5.5 w-5.5',
  lg: 'h-7 w-7',
};

export function LinkUpLogo({ size = 'md' }: LinkUpLogoProps) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={ICON_CLASSES[size]}
      >
        {/* Interlocking speech/link arcs forming a clean LinkUp monogram */}
        <path
          d="M11.5 7C7.91015 7 5 9.91015 5 13.5C5 15.6563 6.05079 17.5674 7.66953 18.75L7 22.5L10.95 20.47C11.1318 20.4898 11.3149 20.5 11.5 20.5H15.5C19.0899 20.5 22 17.5899 22 14C22 10.4101 19.0899 7.5 15.5 7.5"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M20.5 11.5C24.0899 11.5 27 14.4101 27 18C27 20.1563 25.9492 22.0674 24.3305 23.25L25 26.5L21.05 24.47C20.8682 24.4898 20.6851 24.5 20.5 24.5H16.5C12.9101 24.5 10 21.5899 10 18"
          stroke="currentColor"
          strokeOpacity="0.88"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
