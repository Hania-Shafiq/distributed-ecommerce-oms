/**
 * components/Button.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Reusable button with consistent branding across all variants.
 * All colors come from our custom Tailwind tokens — no hardcoded hex values.
 *
 * VARIANTS:
 *   primary   → sea-green fill (main CTA)
 *   secondary → granite outline
 *   danger    → red outline (delete / destructive actions)
 *   ghost     → transparent, underline on hover (tertiary actions)
 * ─────────────────────────────────────────────────────────────────────────────
 */

const variants = {
  primary:
    'bg-sea-green text-white hover:bg-granite active:scale-95 shadow-sm',
  secondary:
    'border-2 border-granite text-granite hover:bg-granite hover:text-white active:scale-95',
  danger:
    'border-2 border-red-500 text-red-500 hover:bg-red-500 hover:text-white active:scale-95',
  ghost:
    'text-granite hover:underline active:scale-95',
};

const sizes = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-5 py-2.5 text-base',
  lg: 'px-7 py-3.5 text-lg',
};

/**
 * @param {'primary'|'secondary'|'danger'|'ghost'} variant
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
  ...props
}) {
  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-lg font-semibold',
        'transition-all duration-200 cursor-pointer focus:outline-none focus:ring-2',
        'focus:ring-sea-green focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        fullWidth ? 'w-full' : '',
        className,
      ].join(' ')}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && (
        <svg
          className="animate-spin h-4 w-4"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  );
}
