/**
 * Minimal geometric category icons — thin stroke, single-color line work.
 * Replaces decorative / emoji-like placeholders across product surfaces.
 */

import { Cpu, Sofa, UtensilsCrossed, Mountain, Gem, Package } from 'lucide-react';

const STROKE = 1.25;

/**
 * @param {string} category
 * @param {string} [className]
 */
export default function CategoryIcon({ category, className = 'w-6 h-6' }) {
  const props = { className, strokeWidth: STROKE, 'aria-hidden': true };

  switch (category) {
    case 'Electronics':
      return <Cpu {...props} />;
    case 'Furniture':
      return <Sofa {...props} />;
    case 'Kitchen':
      return <UtensilsCrossed {...props} />;
    case 'Sports & Outdoors':
      return <Mountain {...props} />;
    case 'Accessories':
      return <Gem {...props} />;
    default:
      return <Package {...props} />;
  }
}

/**
 * Moody multi-stop gradients within the navy/plum + green family only.
 * No bright candy hues — depth via value shifts in the same palette.
 */
export function categoryGradient(category = '') {
  const gradients = {
    Electronics: 'from-[#1A141C] via-[#231C28] to-[#2D4239]',
    Furniture: 'from-[#140F16] via-[#2A222E] to-[#3A4F45]',
    Kitchen: 'from-[#1C1719] via-[#2D4239] to-[#3D8361]/40',
    'Sports & Outdoors': 'from-[#121A18] via-[#2A5F52] to-[#231C28]',
    Accessories: 'from-[#140F16] via-[#1E1822] to-[#2D4239]',
  };
  return gradients[category] || 'from-[#140F16] via-[#231C28] to-[#2D4239]';
}
