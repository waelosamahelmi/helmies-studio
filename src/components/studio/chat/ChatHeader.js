"use client";

import { IconBolt } from "@/components/Icons";

export default function ChatHeader({ icon: Icon, label, credits, pendingCount }) {
  return (
    <div className="chat-header">
      <div className="chat-header__left">
        {Icon && (
          <div className="chat-header__icon">
            <Icon />
          </div>
        )}
        <h1 className="chat-header__label">{label}</h1>
      </div>
      <div className="chat-header__right">
        {pendingCount > 0 && (
          <div className="chat-header__pending" title="Generations in progress">
            <span className="chat-header__pending-dot" />
            <span>{pendingCount}</span>
          </div>
        )}
        <div className="chat-header__credits">
          <IconBolt />
          <span>{credits ?? "—"}</span>
        </div>
      </div>
    </div>
  );
}
