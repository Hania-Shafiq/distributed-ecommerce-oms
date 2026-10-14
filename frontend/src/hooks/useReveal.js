/**
 * hooks/useReveal.js
 * One-shot scroll entrance: adds `is-revealed` when the element enters view.
 */

import { useEffect, useRef } from 'react';

export default function useReveal({ once = true, threshold = 0.12 } = {}) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-revealed');
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add('is-revealed');
        if (once) observer.disconnect();
      },
      { threshold, rootMargin: '0px 0px -36px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold]);

  return ref;
}
