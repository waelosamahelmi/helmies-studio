"use client";

export default function MobileChipScroller({
  items = [],
  selectedValue,
  onSelect,
  labelKey = "label",
  valueKey = "value",
  renderItem,
}) {
  if (!items || items.length === 0) {
    return (
      <div className="v6-mobile-chip-scroller v6-mobile-chip-scroller--empty">
        <span className="v6-muted v6-tiny">No options available</span>
      </div>
    );
  }

  return (
    <div className="v6-mobile-chip-scroller" role="listbox" aria-label="Select option">
      {items.map((item) => {
        const val = item[valueKey];
        const isActive = selectedValue === val;

        return (
          <button
            key={val}
            role="option"
            aria-selected={isActive}
            className={[
              "v6-mobile-chip-scroller__chip",
              isActive && "v6-mobile-chip-scroller__chip--active",
            ]
              .filter(Boolean)
              .join(" ")}
            onClick={() => onSelect?.(val)}
          >
            {renderItem ? renderItem(item) : item[labelKey]}
          </button>
        );
      })}
    </div>
  );
}
