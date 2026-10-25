/**
 * components/PromoCarousel.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Responsive promotional hero carousel matching the reference dark green theme:
 * - 4 curated promo slides with high-definition product imagery
 * - Distinctive mint scalloped discount badge ("UP TO 50% OFF")
 * - Left/right chevron navigation arrows with backdrop-blur
 * - Elongated mint pill indicator dots with interactive click
 * - Smooth CSS slide transitions
 * - Optional auto-sliding with pause-on-hover & play/pause toggle
 * - Touch swipe support for mobile
 * - Seamless integration with category filter
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowRight,
  Play,
  Pause,
} from 'lucide-react';

const PROMO_SLIDES = [
  {
    id: 'smart-picks',
    category: 'Electronics',
    tag: 'FEATURED SPOTLIGHT',
    titleLine1: 'SMART PICKS.',
    titleLine2: 'BETTER PRICES.',
    subtitle: "Explore this week's featured deals on audio, displays & computing",
    discountBadge: {
      top: 'UP TO',
      value: '50%',
      unit: 'OFF',
    },
    ctaText: 'Explore Tech Deals',
    image: '/images/promotions/promo-smart-picks.jpg',
    unsplashFallback:
      'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1400&q=80',
    alt: 'Curated electronics: laptop, wireless headphones, kitchen appliances',
  },
  {
    id: 'modern-kitchen',
    category: 'Kitchen',
    tag: 'CHEF-GRADE LIVING',
    titleLine1: 'CULINARY CRAFT.',
    titleLine2: 'MODERN KITCHEN.',
    subtitle: 'Precision stainless appliances, pour-overs & everyday cookware',
    discountBadge: {
      top: 'SAVE',
      value: '35%',
      unit: 'TODAY',
    },
    ctaText: 'Shop Kitchen',
    image: '/images/promotions/promo-kitchen.jpg',
    unsplashFallback:
      'https://images.unsplash.com/photo-1556911220-e15b29be8c8f?auto=format&fit=crop&w=1400&q=80',
    alt: 'Modern kitchen appliances and cookware showcase',
  },
  {
    id: 'ergonomic-office',
    category: 'Furniture',
    tag: 'WORKSPACE UPGRADE',
    titleLine1: 'WORK SMARTER.',
    titleLine2: 'LIVE IN COMFORT.',
    subtitle: 'Design-forward ergonomic chairs, minimalist desks & warm accents',
    discountBadge: {
      top: 'UP TO',
      value: '$120',
      unit: 'OFF',
    },
    ctaText: 'Explore Furniture',
    image: '/images/promotions/promo-furniture.jpg',
    unsplashFallback:
      'https://images.unsplash.com/photo-1524758631624-e2822e304c36?auto=format&fit=crop&w=1400&q=80',
    alt: 'Ergonomic workspace seating and minimalist office desk',
  },
  {
    id: 'active-performance',
    category: 'Sports & Outdoors',
    tag: 'ACTIVE ESSENTIALS',
    titleLine1: 'PEAK PERFORMANCE.',
    titleLine2: 'BUILT TO LAST.',
    subtitle: 'Insulated stainless hydration, smart fitness & athletic gear',
    discountBadge: {
      top: 'SPECIAL',
      value: '40%',
      unit: 'OFF',
    },
    ctaText: 'Shop Active Gear',
    image: '/images/promotions/promo-sports.jpg',
    unsplashFallback:
      'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1400&q=80',
    alt: 'Athletic fitness equipment and stainless water bottle',
  },
];

/**
 * Scalloped circular badge matching the design in the reference image
 */
function ScallopBadge({ badge }) {
  if (!badge) return null;
  return (
    <div
      className="relative shrink-0 flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 lg:w-22 lg:h-22 select-none filter drop-shadow-[0_4px_14px_rgba(16,185,129,0.3)] transition-transform duration-300 hover:scale-105"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 w-full h-full text-[#9DF2C8] fill-current"
      >
        <path d="M 94 50 Q 95.9 62.3, 88.1 72 Q 83.6 83.6, 72 88.1 Q 62.3 95.9, 50 94 Q 37.7 95.9, 28 88.1 Q 16.4 83.6, 11.9 72 Q 4.1 62.3, 6 50 Q 4.1 37.7, 11.9 28 Q 16.4 16.4, 28 11.9 Q 37.7 4.1, 50 6 Q 62.3 4.1, 72 11.9 Q 83.6 16.4, 88.1 28 Q 95.9 37.7, 94 50 Z" />
      </svg>
      <div className="relative z-10 flex flex-col items-center justify-center text-center text-[#064E3B] leading-none px-1">
        <span className="text-[8px] sm:text-[9px] font-mono font-extrabold uppercase tracking-wider">
          {badge.top}
        </span>
        <span className="text-base sm:text-xl lg:text-2xl font-black tracking-tight my-0.5">
          {badge.value}
        </span>
        <span className="text-[8px] sm:text-[9px] font-mono font-extrabold uppercase tracking-wider">
          {badge.unit}
        </span>
      </div>
    </div>
  );
}

export default function PromoCarousel({ onSelectCategory, activeCategory }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [autoSlideEnabled, setAutoSlideEnabled] = useState(true);
  const [isHovered, setIsHovered] = useState(false);

  // Touch gesture support
  const touchStartX = useRef(null);
  const touchEndX = useRef(null);

  const totalSlides = PROMO_SLIDES.length;

  const nextSlide = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % totalSlides);
  }, [totalSlides]);

  const prevSlide = useCallback(() => {
    setCurrentIndex(prev => (prev - 1 + totalSlides) % totalSlides);
  }, [totalSlides]);

  const goToSlide = (index) => {
    setCurrentIndex(index);
  };

  // Auto-slide effect
  useEffect(() => {
    if (!autoSlideEnabled || isPaused || isHovered) return;
    const interval = setInterval(nextSlide, 5200);
    return () => clearInterval(interval);
  }, [autoSlideEnabled, isPaused, isHovered, nextSlide]);

  // Touch handlers
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchMove(e) {
    touchEndX.current = e.touches[0].clientX;
  }

  function handleTouchEnd() {
    if (!touchStartX.current || !touchEndX.current) return;
    const diff = touchStartX.current - touchEndX.current;
    if (diff > 45) {
      nextSlide();
    } else if (diff < -45) {
      prevSlide();
    }
    touchStartX.current = null;
    touchEndX.current = null;
  }

  // Keyboard navigation
  function handleKeyDown(e) {
    if (e.key === 'ArrowLeft') {
      prevSlide();
    } else if (e.key === 'ArrowRight') {
      nextSlide();
    }
  }

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      aria-label="Promotional deals carousel"
      aria-roledescription="carousel"
      className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden border border-emerald-900/30 dark:border-white/10 shadow-[0_12px_40px_rgba(6,32,22,0.16)] bg-gradient-to-br from-[#082218] via-[#0E3424] to-[#0A2016] text-white focus:outline-none focus:ring-2 focus:ring-[#10B981]/40 mb-8 select-none transition-all"
    >
      {/* Subtle blueprint pattern overlay */}
      <div className="absolute inset-0 bg-blueprint-dots opacity-10 pointer-events-none" aria-hidden="true" />
      
      {/* Ambient background glow */}
      <div
        className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-emerald-500/10 blur-[90px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-20 right-1/4 w-96 h-96 rounded-full bg-emerald-400/10 blur-[100px] pointer-events-none"
        aria-hidden="true"
      />

      {/* ── Slides Track ── */}
      <div
        className="flex transition-transform duration-500 ease-out will-change-transform"
        style={{ transform: `translateX(-${currentIndex * 100}%)` }}
      >
        {PROMO_SLIDES.map((slide, index) => {
          const isCurrent = index === currentIndex;
          const isCategorySelected = activeCategory?.toLowerCase() === slide.category.toLowerCase();

          return (
            <div
              key={slide.id}
              role="group"
              aria-roledescription="slide"
              aria-label={`Slide ${index + 1} of ${totalSlides}: ${slide.titleLine1} ${slide.titleLine2}`}
              className="w-full shrink-0 flex flex-col md:flex-row items-stretch min-h-[300px] sm:min-h-[320px] lg:min-h-[340px]"
            >
              {/* ── Left Content (Text, Badge & CTA) ── */}
              <div className="flex-1 flex flex-col justify-center px-6 sm:px-10 lg:px-14 py-8 sm:py-10 z-10">
                {/* Eyebrow Pill */}
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-[10px] sm:text-xs font-mono font-semibold uppercase tracking-wider mb-3 w-fit backdrop-blur-xs">
                  <Sparkles className="w-3 h-3 text-emerald-400" />
                  <span>{slide.tag}</span>
                </div>

                {/* Headline & Badge Row */}
                <div className="flex items-center gap-3 sm:gap-6 mb-3">
                  <div>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight">
                      {slide.titleLine1}
                    </h2>
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#34D399] tracking-tight leading-tight">
                      {slide.titleLine2}
                    </h2>
                  </div>
                  <ScallopBadge badge={slide.discountBadge} />
                </div>

                {/* Subtitle */}
                <p className="text-emerald-100/80 text-xs sm:text-sm font-normal max-w-md mb-5 leading-relaxed">
                  {slide.subtitle}
                </p>

                {/* CTA Action Button */}
                {onSelectCategory && (
                  <button
                    type="button"
                    onClick={() => onSelectCategory(slide.category)}
                    className={`inline-flex items-center gap-2 px-4 py-2 sm:px-5 sm:py-2.5 rounded-xl font-mono text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-sm cursor-pointer group w-fit ${
                      isCategorySelected
                        ? 'bg-[#10B981] text-emerald-950 hover:bg-emerald-400'
                        : 'bg-white hover:bg-emerald-50 text-emerald-950'
                    }`}
                  >
                    <span>{slide.ctaText}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-800 transition-transform duration-200 group-hover:translate-x-1" />
                  </button>
                )}
              </div>

              {/* ── Right Content (Product Showcase Image) ── */}
              <div className="relative w-full md:w-[46%] lg:w-[48%] h-52 sm:h-64 md:h-auto flex items-center justify-center overflow-hidden">
                {/* Gradient blend overlay on left for smooth backdrop integration on desktop */}
                <div
                  className="hidden md:block absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-[#0E3424] via-[#0E3424]/60 to-transparent z-10 pointer-events-none"
                  aria-hidden="true"
                />
                {/* Gradient blend overlay on top for mobile */}
                <div
                  className="block md:hidden absolute inset-0 bg-gradient-to-t from-[#082218] via-transparent to-transparent z-10 pointer-events-none"
                  aria-hidden="true"
                />

                <img
                  src={slide.image}
                  alt={slide.alt}
                  loading={index === 0 ? 'eager' : 'lazy'}
                  onError={(e) => {
                    // Fall back to high-res Unsplash image if local is not reached, or vice-versa
                    if (e.target.src !== slide.unsplashFallback) {
                      e.target.src = slide.unsplashFallback;
                    }
                  }}
                  className="w-full h-full object-cover object-center transition-transform duration-700 ease-out hover:scale-105"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Navigation Arrows ── */}
      <button
        type="button"
        onClick={prevSlide}
        aria-label="Previous slide"
        className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#081F15]/75 hover:bg-[#081F15] text-white/90 hover:text-white border border-emerald-400/30 flex items-center justify-center backdrop-blur-md shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
      >
        <ChevronLeft className="w-5 h-5 text-white" strokeWidth={2.5} />
      </button>

      <button
        type="button"
        onClick={nextSlide}
        aria-label="Next slide"
        className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-[#081F15]/75 hover:bg-[#081F15] text-white/90 hover:text-white border border-emerald-400/30 flex items-center justify-center backdrop-blur-md shadow-lg transition-all duration-200 hover:scale-110 active:scale-95 cursor-pointer"
      >
        <ChevronRight className="w-5 h-5 text-white" strokeWidth={2.5} />
      </button>

      {/* ── Bottom Controls: Indicator Dots & Auto-slide Toggle ── */}
      <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 bg-[#081F15]/70 backdrop-blur-md px-3 py-1.5 rounded-full border border-emerald-500/20 shadow-md">
        {PROMO_SLIDES.map((slide, idx) => {
          const isActive = idx === currentIndex;
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => goToSlide(idx)}
              aria-label={`Go to slide ${idx + 1}`}
              className={`transition-all duration-300 cursor-pointer rounded-full ${
                isActive
                  ? 'w-7 sm:w-8 h-2 bg-[#34D399] shadow-[0_0_8px_rgba(52,211,153,0.7)]'
                  : 'w-2 h-2 bg-white/40 hover:bg-white/80'
              }`}
            />
          );
        })}

        {/* Optional Auto-Slide Play/Pause Toggle */}
        <button
          type="button"
          onClick={() => setAutoSlideEnabled(prev => !prev)}
          title={autoSlideEnabled ? 'Pause auto-slide' : 'Resume auto-slide'}
          aria-label={autoSlideEnabled ? 'Pause auto-slide' : 'Resume auto-slide'}
          className="ml-1 text-white/60 hover:text-white transition-colors cursor-pointer p-0.5"
        >
          {autoSlideEnabled ? (
            <Pause className="w-3 h-3 text-emerald-300" />
          ) : (
            <Play className="w-3 h-3 text-white/70" />
          )}
        </button>
      </div>
    </div>
  );
}
