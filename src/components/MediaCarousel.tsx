import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontal, scroll-snapping carousel for media cards. The prev/next buttons
 * advance roughly one viewport at a time, so users move through the items
 * batch by batch.
 */
export default function MediaCarousel({ children, className = "" }: { children: ReactNode; className?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const sync = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft < max - 4);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(sync);
      observer.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      observer?.disconnect();
    };
  }, [sync, children]);

  const page = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth - 40, 160), behavior: "smooth" });
  };

  return (
    <div className={`media-carousel ${className}`.trim()}>
      <div className="media-carousel-track" ref={trackRef}>
        {children}
      </div>
      <button
        type="button"
        className="media-carousel-nav prev"
        onClick={() => page(-1)}
        disabled={!canPrev}
        aria-label="Previous"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
      <button
        type="button"
        className="media-carousel-nav next"
        onClick={() => page(1)}
        disabled={!canNext}
        aria-label="Next"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
