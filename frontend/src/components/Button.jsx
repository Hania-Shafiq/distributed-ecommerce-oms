/**
 * components/Button.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable button with consistent branding across all variants.
 * All colors adhere to design tokens with polished hover, active, and focus states.
 * ─────────────────────────────────────────────────────────────────────────────
 */

const variants = {
  primary:
    'bg-sea-green text-white hover:bg-granite shadow-sm hover:shadow-md active:scale-[0.98]',
  secondary:
    'bg-white text-granite border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-2xs active:scale-[0.98]',
  outline:
    'border border-sea-green text-sea-green hover:bg-sea-green hover:text-white active:scale-[0.98]',
  danger:
    'bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white active:scale-[0.98]',
  ghost:
    'text-gray-600 hover:text-granite hover:bg-gray-100/80 active:scale-[0.98]',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-lg font-medium',
  md: 'px-4 py-2.5 text-sm rounded-xl font-semibold',
  lg: 'px-6 py-3 text-base rounded-xl font-semibold',
};

/**
 * @param {'primary'|'secondary'|'outline'|'danger'|'ghost'} variant
 * @param {'sm'|'md'|'lg'} size
 * @param {boolean} loading  — shows a spinner and disables the button
 * @param {boolean} fullWidth — stretches button to 100% width
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  className = '',
  disabled = false,
  type = 'button',
  ...props
}) {
  const chosenVariant = variants[variant] || variants.primary;
  const chosenSize = sizes[size] || sizes.md;

  return (
    <button
      type={type}
      className={[
        'inline-flex items-center justify-center gap-2 select-none cursor-pointer',
        'transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-sea-green/40 focus:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none',
        chosenVariant,
        chosenSize,
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      disabled={loading || disabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin -ml-0.5 h-4 w-4 text-current"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          />
        </svg>
      )}
      {children}
    </button>
  );
}
