import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Horizontal, scroll-snapping carousel for media cards. The prev/next buttons
 * advance roughly one viewport at a time, so users move through the items
 * batch by batch. The track is a labelled region and is keyboard focusable so
 * arrow/Home/End scrolling works without a pointer.
 */
export default function MediaCarousel({
  children,
  className = "",
  label,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
  labelledBy?: string;
}) {
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

  const onWheel = useCallback((e: WheelEvent) => {
    const el = trackRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 0) return;
    if ((e.deltaY < 0 && el.scrollLeft <= 1) || (e.deltaY > 0 && el.scrollLeft >= max - 1)) return;
    e.preventDefault();
    el.scrollLeft += e.deltaY;
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", sync);
    let ro: ResizeObserver | undefined;
    let mo: MutationObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(sync);
      ro.observe(el);
    }
    if (typeof MutationObserver !== "undefined") {
      mo = new MutationObserver(sync);
      mo.observe(el, { childList: true });
    }
    return () => {
      el.removeEventListener("scroll", sync);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", sync);
      ro?.disconnect();
      mo?.disconnect();
    };
  }, [sync, onWheel]);

  const page = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth - 40, 160), behavior: "smooth" });
  };

  return (
    <div className={`media-carousel ${className}`.trim()}>
      <div
        className="media-carousel-track"
        ref={trackRef}
        role="region"
        tabIndex={0}
        {...(labelledBy
          ? { "aria-labelledby": labelledBy }
          : { "aria-label": label || "Media carousel" })}
      >
        {children}
      </div>
      <button
        type="button"
        className="media-carousel-nav prev"
        onClick={() => page(-1)}
        disabled={!canPrev}
        aria-label={label ? `Previous ${label}` : "Previous"}
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
        aria-label={label ? `Next ${label}` : "Next"}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </div>
  );
}
