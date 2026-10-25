import { useTheme } from '../context/ThemeContext';

/**
 * ThemeToggle
 * ─────────────────────────────────────────────────────────────────────────────
 * Accessible, keyboard-friendly theme switcher supporting light & dark modes.
 * Features crisp inline SVG sun/moon icons matching the UI's line weight.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function ThemeToggle({ className = '', size = 'md' }) {
  const { isDark, toggleTheme } = useTheme();

  const sizeClasses = {
    sm: 'p-1.5 rounded-lg text-xs',
    md: 'p-2 rounded-lg text-sm',
    lg: 'p-2.5 rounded-xl text-base',
  };

  const chosenSize = sizeClasses[size] || sizeClasses.md;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={`relative inline-flex items-center justify-center transition-all duration-150 select-none cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-sea-green focus-visible:ring-offset-2 ${chosenSize} ${className}`}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {isDark ? (
        /* Sun Icon (shown in dark mode to switch to light) */
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4 text-amber-300 hover:text-amber-200 transition-colors"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2" />
          <path d="M12 20v2" />
          <path d="M4.93 4.93l1.41 1.41" />
          <path d="M17.66 17.66l1.41 1.41" />
          <path d="M2 12h2" />
          <path d="M20 12h2" />
          <path d="M6.34 17.66l-1.41 1.41" />
          <path d="M19.07 4.93l-1.41 1.41" />
        </svg>
      ) : (
        /* Moon Icon (shown in light mode to switch to dark) */
        <svg
          viewBox="0 0 24 24"
          className="w-4 h-4 text-[#9CA3AF] hover:text-white transition-colors"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
        </svg>
      )}
    </button>
  );
}
