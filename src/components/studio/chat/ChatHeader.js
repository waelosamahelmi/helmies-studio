"use client";

export default function ChatHeader({ icon: Icon, pendingCount }) {
  return (
    <div className="chat-header">
      {Icon && (
        <div className="chat-header__icon">
          <Icon />
        </div>
      )}
      <div className="chat-header__spacer" />
      {pendingCount > 0 && (
        <div className="chat-header__pending" title="Generations in progress">
          <span className="chat-header__pending-dot" />
          <span>{pendingCount}</span>
        </div>
      )}
    </div>
  );
}
