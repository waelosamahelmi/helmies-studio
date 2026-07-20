"use client";

export default function AnnouncementBar() {
  return (
    <div className="announce-bar">
      <span className="announce-bar__text">
        <span className="announce-bar__badge">LIMITED</span>
        Launch week: 50% off all plans. Use code <strong>LAUNCH50</strong> at checkout.
        <span className="announce-bar__arrow">→</span>
      </span>
    </div>
  );
}
