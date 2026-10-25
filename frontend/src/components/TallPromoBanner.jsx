/**
 * components/TallPromoBanner.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Tall promotional banner for the "All" category Metro-style layout:
 * - Spans the height of two product rows on desktop (lg:row-span-2)
 * - Dark green and white OMS//STORE aesthetic
 * - Curated product imagery (kitchen, tech & ergonomics)
 * - Eyebrow tag, bold two-tone headline, description, and "Shop Now →" CTA
 * - Smooth multi-slide transition with bottom indicator dots & auto-slide
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

const TALL_SLIDES = [
  {
    id: 'modern-living',
    category: 'Kitchen',
    tag: 'HOME ESSENTIALS',
    titleLine1: 'MODERN LIVING',
    titleLine2: 'MADE EASY',
    description: 'Top-quality home & kitchen products at the best prices.',
    ctaText: 'Shop Now',
    image: '/images/promotions/tall-banner-modern-living.jpg',
    fallbackImage: '/images/categories/kitchen.jpg',
    alt: 'Modern living air fryer, blender and kitchen essentials',
  },
  {
    id: 'tech-workspace',
    category: 'Electronics',
    tag: 'WORKSPACE & TECH',
    titleLine1: 'WORK SMARTER',
    titleLine2: 'STAY AHEAD',
    description: 'High-performance audio, typing gear & computing essentials.',
    ctaText: 'Explore Tech',
    image: '/images/promotions/tall-banner-tech.jpg',
    fallbackImage: '/images/categories/electronics.jpg',
    alt: 'Sleek laptop, wireless headphones and mechanical keyboard',
  },
  {
    id: 'active-performance',
    category: 'Sports & Outdoors',
    tag: 'ACTIVE LIVING',
    titleLine1: 'MOVE FREELY',
    titleLine2: 'PEAK FORM',
    description: 'Insulated stainless hydration, smart fitness & athletic gear.',
    ctaText: 'Shop Active',
    image: '/images/promotions/promo-sports.jpg',
    fallbackImage: '/images/categories/sports-outdoors.jpg',
    alt: 'Active sports equipment, dumbbells and water bottle',
  },
];

export default function TallPromoBanner({ onSelectCategory }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);

  const totalSlides = TALL_SLIDES.length;

  const nextSlide = useCallback(() => {
    setCurrentIndex(prev => (prev + 1) % totalSlides);
  }, [totalSlides]);

  // Auto-slide every 6 seconds when not hovered
  useEffect(() => {
    if (isHovered) return;
    const interval = setInterval(nextSlide, 6000);
    return () => clearInterval(interval);
  }, [isHovered, nextSlide]);

  const currentSlide = TALL_SLIDES[currentIndex];

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-full h-full min-h-[460px] sm:min-h-[520px] lg:min-h-0 rounded-2xl sm:rounded-3xl overflow-hidden border border-emerald-900/30 dark:border-white/10 shadow-[0_8px_30px_rgba(10,36,26,0.12)] bg-gradient-to-b from-[#082218] via-[#0B2A1E] to-[#071C14] text-white flex flex-col justify-between group transition-all"
    >
      {/* Subtle blueprint pattern overlay */}
      <div className="absolute inset-0 bg-blueprint-dots opacity-10 pointer-events-none" aria-hidden="true" />

      {/* Ambient background glow */}
      <div
        className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-emerald-500/15 blur-[60px] pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute top-1/2 -right-12 w-48 h-48 rounded-full bg-emerald-400/10 blur-[60px] pointer-events-none"
        aria-hidden="true"
      />

      {/* ── Top Section: Text Content & CTA ── */}
      <div className="relative z-10 p-6 sm:p-7 flex flex-col">
        {/* Eyebrow Tag */}
        <div className="inline-flex items-center gap-1.5 text-emerald-300 font-mono text-[10px] sm:text-[11px] font-bold uppercase tracking-wider mb-2.5">
          <Sparkles className="w-3 h-3 text-emerald-400" />
          <span>{currentSlide.tag}</span>
        </div>

        {/* Big Two-Tone Headline */}
        <div className="mb-2.5">
          <h3 className="text-2xl sm:text-[1.65rem] xl:text-[1.85rem] font-extrabold text-white tracking-tight leading-[1.08]">
            {currentSlide.titleLine1}
          </h3>
          <h3 className="text-2xl sm:text-[1.65rem] xl:text-[1.85rem] font-extrabold text-[#34D399] tracking-tight leading-[1.08]">
            {currentSlide.titleLine2}
          </h3>
        </div>

        {/* Subtitle Description */}
        <p className="text-xs sm:text-[13px] text-emerald-100/80 leading-relaxed max-w-[260px] mb-5 font-normal">
          {currentSlide.description}
        </p>

        {/* CTA Action Button */}
        {onSelectCategory && (
          <button
            type="button"
            onClick={() => onSelectCategory(currentSlide.category)}
            className="inline-flex items-center gap-2 px-4 py-2 sm:px-4.5 sm:py-2.5 rounded-full bg-white hover:bg-emerald-50 text-emerald-950 font-mono text-xs font-bold transition-all duration-150 shadow-sm hover:shadow-md cursor-pointer w-fit group"
          >
            <span>{currentSlide.ctaText}</span>
            <ArrowRight className="w-3.5 h-3.5 text-emerald-800 transition-transform duration-200 group-hover:translate-x-1" />
          </button>
        )}
      </div>

      {/* ── Bottom Section: Product Image Showcase ── */}
      <div className="relative z-0 w-full flex-1 flex items-end justify-center overflow-hidden min-h-[220px] sm:min-h-[260px] lg:min-h-[240px]">
        {/* Gradient blend overlay on top of image */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-transparent via-[#0B2A1E]/30 to-[#0B2A1E] z-10 pointer-events-none"
          aria-hidden="true"
        />

        <img
          key={currentSlide.id}
          src={currentSlide.image}
          alt={currentSlide.alt}
          onError={(e) => {
            if (e.target.src !== currentSlide.fallbackImage) {
              e.target.src = currentSlide.fallbackImage;
            }
          }}
          className="w-full h-full object-cover object-bottom transition-all duration-700 ease-out group-hover:scale-105"
        />

        {/* ── Bottom Indicator Dots ── */}
        <div className="absolute bottom-3.5 left-6 z-20 flex items-center gap-1.5 bg-[#081F15]/75 backdrop-blur-md px-2.5 py-1 rounded-full border border-emerald-500/20">
          {TALL_SLIDES.map((slide, idx) => {
            const isActive = idx === currentIndex;
            return (
              <button
                key={slide.id}
                type="button"
                onClick={() => setCurrentIndex(idx)}
                aria-label={`Go to slide ${idx + 1}`}
                className={`transition-all duration-300 cursor-pointer rounded-full ${
                  isActive
                    ? 'w-5 h-1.5 bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                    : 'w-1.5 h-1.5 bg-white/40 hover:bg-white/70'
                }`}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
