/**
 * components/ProductImage.jsx
 * Single reusable product image with placeholder fallback.
 *
 * - null/empty image_url → grey placeholder + product name (or initials if long)
 * - load error → same placeholder via onError
 * - loading="lazy" + fixed width/height to avoid layout shift
 */

import { useState, useEffect } from 'react';

const PLACEHOLDER_SRC = '/images/placeholder.svg';
const NAME_MAX_CHARS = 28;

function productInitials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function displayLabel(name) {
  const trimmed = String(name || '').trim();
  if (!trimmed) return 'Product';
  if (trimmed.length <= NAME_MAX_CHARS) return trimmed;
  return productInitials(trimmed);
}

/**
 * @param {object} props
 * @param {string|null|undefined} props.imageUrl
 * @param {string} [props.name]
 * @param {string} [props.alt]
 * @param {string} [props.className] - applied to outer container
 * @param {string} [props.imgClassName] - applied to the <img> when showing a real photo
 * @param {number|string} [props.width]
 * @param {number|string} [props.height]
 * @param {'eager'|'lazy'} [props.loading]
 */
export default function ProductImage({
  imageUrl,
  name = '',
  alt,
  className = '',
  imgClassName = 'w-full h-full object-cover',
  width,
  height,
  loading = 'lazy',
}) {
  const src = typeof imageUrl === 'string' ? imageUrl.trim() : '';
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const showPhoto = Boolean(src) && !failed;
  const label = displayLabel(name);
  const initials = productInitials(name);
  const showInitials = String(name || '').trim().length > NAME_MAX_CHARS;

  const sizeStyle = {};
  if (width != null) sizeStyle.width = typeof width === 'number' ? `${width}px` : width;
  if (height != null) sizeStyle.height = typeof height === 'number' ? `${height}px` : height;

  if (showPhoto) {
    return (
      <div className={`overflow-hidden ${className}`.trim()} style={sizeStyle}>
        <img
          src={src}
          alt={alt || name || 'Product'}
          loading={loading}
          width={typeof width === 'number' ? width : undefined}
          height={typeof height === 'number' ? height : undefined}
          onError={() => setFailed(true)}
          className={imgClassName}
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden flex flex-col items-center justify-center text-center select-none ${className}`.trim()}
      style={{ ...sizeStyle, backgroundColor: '#e8e8e8' }}
      role="img"
      aria-label={alt || name || 'Product image placeholder'}
    >
      <img
        src={PLACEHOLDER_SRC}
        alt=""
        aria-hidden
        loading={loading}
        width={typeof width === 'number' ? width : undefined}
        height={typeof height === 'number' ? height : undefined}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-90"
      />
      <div className="relative z-1 px-2 py-1 max-w-full flex flex-col items-center gap-0.5">
        {showInitials && (
          <span className="text-xs font-semibold tracking-wide" style={{ color: '#6b6b6b' }}>
            {initials}
          </span>
        )}
        <span
          className="text-[10px] sm:text-xs font-medium leading-snug line-clamp-3 break-words"
          style={{ color: '#5a5a5a' }}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
