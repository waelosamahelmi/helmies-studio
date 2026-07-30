"use client";

import { useRef, useState, useCallback } from "react";

/* ── Inline SVG: Chevron left ── */
const IconChevronLeft = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15,18 9,12 15,6" />
  </svg>
);

/* ── Inline SVG: Chevron right ── */
const IconChevronRight = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9,18 15,12 9,6" />
  </svg>
);

export default function MobileModelCarousel({
  models = [],
  selectedModelId,
  onSelect,
}) {
  const scrollRef = useRef(null);
  const [showArrows, setShowArrows] = useState(false);

  const scrollBy = useCallback((direction) => {
    const el = scrollRef.current;
    if (!el) return;
    const cardWidth = 148; // 140px card + 8px gap
    el.scrollBy({ left: direction * cardWidth * 2, behavior: "smooth" });
  }, []);

  if (!models || models.length === 0) {
    return (
      <div className="v6-mobile-model-carousel v6-mobile-model-carousel--empty">
        <span className="v6-muted v6-tiny">No models available</span>
      </div>
    );
  }

  return (
    <div
      className="v6-mobile-model-carousel"
      onMouseEnter={() => setShowArrows(true)}
      onMouseLeave={() => setShowArrows(false)}
    >
      {/* Scrollable track */}
      <div
        ref={scrollRef}
        className="v6-mobile-model-carousel__track"
        role="listbox"
        aria-label="Select model"
      >
        {models.map((model) => {
          const isActive = selectedModelId === model.id;
          const displayName = model.displayName || model.name || model.id;

          return (
            <button
              key={model.id}
              role="option"
              aria-selected={isActive}
              className={[
                "v6-mobile-model-carousel__card",
                isActive && "v6-mobile-model-carousel__card--active",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => onSelect?.(model.id)}
            >
              <div className="v6-mobile-model-carousel__card-name">
                {displayName}
              </div>
              <div className="v6-mobile-model-carousel__card-provider">
                {model.provider || model.providerName || ""}
              </div>
              <div className="v6-mobile-model-carousel__card-meta">
                {model.credits > 0 && (
                  <span className="v6-mobile-model-carousel__card-cost">
                    {model.credits} credits
                  </span>
                )}
                {model.speedTier && (
                  <span className="v6-mobile-model-carousel__card-speed">
                    {model.speedTier}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Scroll arrows — visible on hover when more than 3 models */}
      {models.length > 3 && showArrows && (
        <>
          <button
            className="v6-mobile-model-carousel__arrow v6-mobile-model-carousel__arrow--left"
            onClick={() => scrollBy(-1)}
            aria-label="Scroll left"
          >
            <IconChevronLeft />
          </button>
          <button
            className="v6-mobile-model-carousel__arrow v6-mobile-model-carousel__arrow--right"
            onClick={() => scrollBy(1)}
            aria-label="Scroll right"
          >
            <IconChevronRight />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {models.length > 1 && (
        <div className="v6-mobile-model-carousel__dots" aria-hidden="true">
          {models.map((m, i) => (
            <div
              key={i}
              className={[
                "v6-mobile-model-carousel__dot",
                m.id === selectedModelId &&
                  "v6-mobile-model-carousel__dot--active",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          ))}
        </div>
      )}
    </div>
  );
}
