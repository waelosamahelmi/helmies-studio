"use client";

import { useRef, useEffect } from "react";
import ChatMessage from "./ChatMessage";

export default function ChatFeed({ messages, config, onRetry, idle }) {
  const feedRef = useRef(null);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <div className="chat-feed" ref={feedRef}>
      {messages.length === 0 && idle}
      {messages.map((msg) => (
        <ChatMessage key={msg.id} msg={msg} config={config} onRetry={onRetry} />
      ))}
    </div>
  );
}
