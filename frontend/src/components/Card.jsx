/**
 * components/Card.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Clean, consistent container card with subtle borders, shadows, and headers.
 * ─────────────────────────────────────────────────────────────────────────────
 */
export default function Card({ children, className = '', title, subtitle, headerAction }) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200/70 shadow-xs hover:shadow-sm transition-shadow duration-200 p-6 ${className}`}>
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-gray-100">
          <div>
            {title && (
              <h2 className="text-base font-bold text-granite tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          {headerAction && <div>{headerAction}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
