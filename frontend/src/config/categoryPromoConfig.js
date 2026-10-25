/**
 * config/categoryPromoConfig.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Promotional Tile configuration map for Category-Sectioned Catalog View.
 * Maps category names to curated imagery, headlines, and subtitles.
 * If a category is not present or image fails, it falls back dynamically to
 * the category's top in-stock product visual.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export const CATEGORY_PROMO_CONFIG = {
  Electronics: {
    tag: 'FEATURED',
    headline: 'Tech for every day',
    subtitle: 'Work, connect, and entertain with high-performance audio and computing gear.',
    image: '/images/promotions/tall-banner-tech.jpg',
    fallbackImage: '/images/categories/electronics.jpg',
    ctaText: 'Shop now',
  },
  Furniture: {
    tag: 'FEATURED',
    headline: 'Comfort for your space',
    subtitle: 'Modern ergonomic seating and minimalist tables built for everyday focus.',
    image: '/images/promotions/promo-furniture.jpg',
    fallbackImage: '/images/categories/furniture.jpg',
    ctaText: 'Shop now',
  },
  Kitchen: {
    tag: 'FEATURED',
    headline: 'Cook, brew, serve',
    subtitle: 'Culinary essentials, precision kettles, and appliances for home dining.',
    image: '/images/promotions/tall-banner-modern-living.jpg',
    fallbackImage: '/images/categories/kitchen.jpg',
    ctaText: 'Shop now',
  },
  'Sports & Outdoors': {
    tag: 'FEATURED',
    headline: 'Move more, play more',
    subtitle: 'Durable activewear, hydration flasks, and fitness gear for every journey.',
    image: '/images/promotions/promo-sports.jpg',
    fallbackImage: '/images/categories/sports-outdoors.jpg',
    ctaText: 'Shop now',
  },
  Accessories: {
    tag: 'FEATURED',
    headline: 'Finishing touches',
    subtitle: 'Leather craftsmanship, minimalist cases, and daily carry companions.',
    image: '/images/categories/accessories.jpg',
    fallbackImage: '/images/categories/accessories.jpg',
    ctaText: 'Shop now',
  },
};

/**
 * Standard ordered categories for the sectioned catalog view.
 */
export const ORDERED_CATEGORIES = [
  'Electronics',
  'Furniture',
  'Kitchen',
  'Sports & Outdoors',
  'Accessories',
];
