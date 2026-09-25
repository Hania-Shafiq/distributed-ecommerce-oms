/**
 * components/Card.jsx
 * Generic content card wrapper used on dashboard and detail pages.
 */
export default function Card({ children, className = '', title }) {
  return (
    <div className={`bg-white rounded-2xl shadow-md p-6 ${className}`}>
      {title && (
        <h2 className="text-lg font-bold text-granite mb-4 pb-3 border-b border-gray-100">
          {title}
        </h2>
      )}
      {children}
    </div>
  );
}
