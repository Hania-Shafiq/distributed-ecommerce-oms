/**
 * components/Button.jsx
 * Raised/pressed depth with refined 6px radius. Primary = action green only.
 */

const variants = {
  primary: 'btn-3d btn-3d-primary',
  secondary: 'btn-3d btn-3d-secondary',
  outline: 'btn-3d btn-3d-outline',
  danger: 'btn-3d btn-3d-danger',
  ghost: 'btn-3d btn-3d-ghost',
};

const sizes = {
  sm: 'px-3 py-1.5 text-xs rounded-md font-medium',
  md: 'px-4 py-2.5 text-sm rounded-md font-medium',
  lg: 'px-6 py-3 text-base rounded-lg font-medium',
};

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
        'focus:outline-none focus:ring-2 focus:ring-sea-green/35 focus:ring-offset-2',
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
