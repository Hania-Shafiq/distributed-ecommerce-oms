/**
 * components/Card.jsx
 * Quiet glass panel — 8px radius, medium-weight titles.
 */

export default function Card({ children, className = '', title, subtitle, headerAction }) {
  return (
    <div className={`glass-card rounded-lg p-6 ${className}`}>
      {(title || subtitle || headerAction) && (
        <div className="flex items-center justify-between pb-4 mb-5 border-b border-granite/8">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-charcoal tracking-tight">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-xs text-gray-500 mt-0.5 font-normal">
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
