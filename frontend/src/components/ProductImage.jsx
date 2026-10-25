/**
 * components/ProductImage.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Resilient product image component with intelligent catalog resolution.
 * - Resolves exact product names to local high-res studio photos
 * - Matches keywords and categories to curated high-resolution photography
 * - Graceful fallback to sleek SVG/photo placeholder
 * - loading="lazy" + fixed aspect ratios to prevent layout shifts
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect } from 'react';
import { Package } from 'lucide-react';

const LOCAL_PRODUCTS = [
  { match: /headphone|audio|earphone|headset/i, url: '/images/products/wireless-noise-cancelling-headphones.jpg' },
  { match: /keyboard|keypad/i, url: '/images/products/mechanical-gaming-keyboard.jpg' },
  { match: /chair|seat|desk chair/i, url: '/images/products/ergonomic-office-chair.jpg' },
  { match: /bottle|flask|water bottle/i, url: '/images/products/stainless-steel-water-bottle.jpg' },
  { match: /yoga|mat|fitness mat/i, url: '/images/products/yoga-mat.jpg' },
  { match: /monitor|screen|display|laptop/i, url: '/images/products/4k-usb-c-monitor-27-inch.jpg' },
  { match: /kettle|tea maker/i, url: '/images/products/electric-kettle.jpg' },
  { match: /shoe|sneaker|footwear|runner/i, url: '/images/products/running-shoes-mens.jpg' },
  { match: /wallet|purse|cardholder/i, url: '/images/products/leather-wallet.jpg' },
  { match: /speaker|soundbar|audio box/i, url: '/images/products/portable-bluetooth-speaker.jpg' },
];

const CURATED_CATALOG_IMAGES = [
  // Kitchen & Dining
  { match: /bowl|plate|dish|ceramic/i, url: 'https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&w=800&q=80' },
  { match: /mug|cup|coffee cup/i, url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?auto=format&fit=crop&w=800&q=80' },
  { match: /cutlery|fork|knife|spoon/i, url: 'https://images.unsplash.com/photo-1584269600464-37b1b58a9fe7?auto=format&fit=crop&w=800&q=80' },
  { match: /baking|cake|tin|pan/i, url: 'https://images.unsplash.com/photo-1590794056226-79ef3a8147e1?auto=format&fit=crop&w=800&q=80' },
  { match: /tea|teapot|infuser/i, url: 'https://images.unsplash.com/photo-1576092768241-dec231879fc3?auto=format&fit=crop&w=800&q=80' },
  
  // Bags & Accessories
  { match: /shopper|tote|handbag/i, url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=800&q=80' },
  { match: /jumbo bag|lunch bag|storage bag/i, url: 'https://images.unsplash.com/photo-1597484661643-2f5fef640dd1?auto=format&fit=crop&w=800&q=80' },
  { match: /umbrella|parasol/i, url: 'https://images.unsplash.com/photo-1517411032315-54ef2cb783bb?auto=format&fit=crop&w=800&q=80' },
  { match: /luggage|tag|travel/i, url: 'https://images.unsplash.com/photo-1527631746610-bca00a040d60?auto=format&fit=crop&w=800&q=80' },
  { match: /scarf|shawl|wrap/i, url: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?auto=format&fit=crop&w=800&q=80' },
  { match: /pencil|pen|stationery|notebook/i, url: 'https://images.unsplash.com/photo-1583485088034-697b5bc54ccd?auto=format&fit=crop&w=800&q=80' },
  { match: /clock|timer/i, url: 'https://images.unsplash.com/photo-1563861826100-9cb868fdbe1c?auto=format&fit=crop&w=800&q=80' },
  { match: /candle|lantern|holder/i, url: 'https://images.unsplash.com/photo-1603006905003-be475563bc59?auto=format&fit=crop&w=800&q=80' },
  { match: /box|caddy|chest/i, url: 'https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&w=800&q=80' },
  { match: /toy|doll|game|kids/i, url: 'https://images.unsplash.com/photo-1558877385-81a1c7e67d72?auto=format&fit=crop&w=800&q=80' },
  { match: /heart|decoration|hanging/i, url: 'https://images.unsplash.com/photo-1518199266791-5375a83190b7?auto=format&fit=crop&w=800&q=80' },
  { match: /towel|linen|fabric/i, url: 'https://images.unsplash.com/photo-1616627547584-bf28cee262db?auto=format&fit=crop&w=800&q=80' },

  // Electronics & Office
  { match: /mouse|trackpad/i, url: 'https://images.unsplash.com/photo-1615663245857-ac93bb7c39e7?auto=format&fit=crop&w=800&q=80' },
  { match: /cable|charger|adapter/i, url: 'https://images.unsplash.com/photo-1588508065123-287b28e013da?auto=format&fit=crop&w=800&q=80' },
  { match: /lamp|light|led/i, url: 'https://images.unsplash.com/photo-1507473885765-e6ed057f782c?auto=format&fit=crop&w=800&q=80' },
  { match: /watch|smartwatch/i, url: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=800&q=80' },
  { match: /camera|lens/i, url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=800&q=80' },

  // Furniture & Decor
  { match: /table|desk/i, url: 'https://images.unsplash.com/photo-1530629013299-6cb10d168419?auto=format&fit=crop&w=800&q=80' },
  { match: /shelf|bookcase|drawer/i, url: 'https://images.unsplash.com/photo-1594026112284-02bb6f3352fe?auto=format&fit=crop&w=800&q=80' },
  { match: /cushion|pillow/i, url: 'https://images.unsplash.com/photo-1584100936595-c0654b55a2e2?auto=format&fit=crop&w=800&q=80' },

  // Sports & Outdoors
  { match: /ball|basketball|football|soccer/i, url: 'https://images.unsplash.com/photo-1519766304817-4f37bda74a29?auto=format&fit=crop&w=800&q=80' },
  { match: /dumbbell|weight|gym/i, url: 'https://images.unsplash.com/photo-1584735935682-2f2b69dff9d2?auto=format&fit=crop&w=800&q=80' },
  { match: /bike|bicycle|cycling/i, url: 'https://images.unsplash.com/photo-1485965120184-e220f721d03e?auto=format&fit=crop&w=800&q=80' },
];

const CATEGORY_FALLBACK_IMAGES = {
  'electronics': '/images/categories/electronics.jpg',
  'furniture': '/images/categories/furniture.jpg',
  'kitchen': '/images/categories/kitchen.jpg',
  'sports & outdoors': '/images/categories/sports-outdoors.jpg',
  'sports': '/images/categories/sports.jpg',
  'accessories': '/images/categories/accessories.jpg',
};

export function resolveImageUrl(imageUrl, name = '', category = '') {
  // 1. Explicit clean URL
  if (typeof imageUrl === 'string' && imageUrl.trim()) {
    const trimmed = imageUrl.trim();
    if (trimmed.startsWith('/products/uploads/') || trimmed.startsWith('/uploads/')) {
      const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      return `${apiBase.replace(/\/$/, '')}${trimmed}`;
    }
    return trimmed;
  }

  const cleanName = String(name || '');

  // 2. Local exact product matches
  for (const item of LOCAL_PRODUCTS) {
    if (item.match.test(cleanName)) {
      return item.url;
    }
  }

  // 3. Curated keyword matches
  for (const item of CURATED_CATALOG_IMAGES) {
    if (item.match.test(cleanName)) {
      return item.url;
    }
  }

  // 4. Category fallback
  const catKey = String(category || '').toLowerCase().trim();
  if (catKey && CATEGORY_FALLBACK_IMAGES[catKey]) {
    return CATEGORY_FALLBACK_IMAGES[catKey];
  }

  // 5. Default to accessories or electronics category visual
  return '/images/categories/accessories.jpg';
}

export default function ProductImage({
  imageUrl,
  name = '',
  category = '',
  alt,
  className = '',
  imgClassName = 'w-full h-full object-cover',
  width,
  height,
  loading = 'lazy',
}) {
  const resolvedSrc = resolveImageUrl(imageUrl, name, category);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [resolvedSrc]);

  const sizeStyle = {};
  if (width != null) sizeStyle.width = typeof width === 'number' ? `${width}px` : width;
  if (height != null) sizeStyle.height = typeof height === 'number' ? `${height}px` : height;

  if (resolvedSrc && !failed) {
    return (
      <div className={`overflow-hidden relative ${className}`.trim()} style={sizeStyle}>
        <img
          src={resolvedSrc}
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

  // Modern soft aesthetic fallback (NOT harsh green block)
  return (
    <div
      className={`relative overflow-hidden flex flex-col items-center justify-center text-center select-none bg-gradient-to-br from-[#F1F5F2] via-[#E8F0EC] to-[#DEEAE3] dark:from-[#111E19] dark:via-[#14241E] dark:to-[#182B24] ${className}`.trim()}
      style={sizeStyle}
      role="img"
      aria-label={alt || name || 'Product visual'}
    >
      <div className="w-12 h-12 rounded-xl bg-white/80 dark:bg-emerald-950/80 border border-emerald-900/10 dark:border-emerald-500/20 shadow-xs flex items-center justify-center text-emerald-800 dark:text-emerald-200 mb-2">
        <Package className="w-6 h-6 text-emerald-700 dark:text-emerald-300" strokeWidth={1.5} />
      </div>
      <span className="text-xs font-semibold text-slate-800 dark:text-[#E6EFEA] px-3 line-clamp-1 max-w-full">
        {name || 'Product Item'}
      </span>
      {category && (
        <span className="text-[10px] font-mono text-emerald-700/80 dark:text-emerald-300/90 uppercase tracking-wider mt-0.5">
          {category}
        </span>
      )}
    </div>
  );
}
