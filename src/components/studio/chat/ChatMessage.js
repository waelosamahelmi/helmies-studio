"use client";

import { IconDownload, IconArrowRight, IconBolt } from "@/components/Icons";
import StagedProgress from "../StagedProgress";

export default function ChatMessage({ msg, config, onRetry }) {
  if (msg.type === "system") {
    return (
      <div className="chat-message chat-message--system">
        <div className="chat-message__system">{msg.text}</div>
      </div>
    );
  }

  if (msg.type === "user") {
    return (
      <div className="chat-message chat-message--user">
        <div className="chat-message__avatar chat-message__avatar--user">U</div>
        <div className="chat-message__bubble chat-message__bubble--user">
          {msg.text && <p className="chat-message__text">{msg.text}</p>}
          {msg.chips?.length > 0 && (
            <div className="chat-message__chips">
              {msg.chips.map((c, i) => <span key={i} className="chat-message__chip">{c}</span>)}
            </div>
          )}
          {msg.attachments?.length > 0 && (
            <div className="chat-message__attachments">
              {msg.attachments.map((a, i) => (
                <div key={i} className="chat-message__attachment">
                  {a.type === "image" ? <img src={a.url} alt="" /> : <span>{a.name}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (msg.type === "loading") {
    return (
      <div className="chat-message chat-message--assistant">
        <div className="chat-message__avatar chat-message__avatar--assistant">H</div>
        <div className="chat-message__bubble chat-message__bubble--assistant">
          <StagedProgress tool={config?.tool} elapsed={msg.elapsed || 0} />
        </div>
      </div>
    );
  }

  if (msg.type === "error") {
    return (
      <div className="chat-message chat-message--assistant">
        <div className="chat-message__avatar chat-message__avatar--assistant">H</div>
        <div className="chat-message__bubble chat-message__bubble--assistant chat-message__bubble--error">
          <p className="chat-message__error-text">{msg.text}</p>
        </div>
      </div>
    );
  }

  if (msg.type === "result") {
    return (
      <div className="chat-message chat-message--assistant">
        <div className="chat-message__avatar chat-message__avatar--assistant">H</div>
        <div className="chat-message__bubble chat-message__bubble--assistant">
          <div className="chat-message__media">
            {config?.resultType === "image" && msg.url && (
              <img src={msg.url} alt="Generated" className="chat-message__img" />
            )}
            {config?.resultType === "video" && msg.url && (
              <video src={msg.url} controls autoPlay loop playsInline className="chat-message__video" />
            )}
            {config?.resultType === "audio" && msg.url && (
              <audio src={msg.url} controls className="chat-message__audio" />
            )}
            {msg.outputs?.length > 1 && (
              <div className="chat-message__multi">
                {msg.outputs.map((o, i) => (
                  <video key={i} src={o.url || o} controls playsInline className="chat-message__video" />
                ))}
              </div>
            )}
          </div>
          <div className="chat-message__actions">
            {msg.url && (
              <a href={msg.url} download className="chat-message__action-btn">
                <IconDownload /> Download
              </a>
            )}
            <button className="chat-message__action-btn" onClick={() => onRetry?.(msg)}>
              <IconArrowRight /> Retry
            </button>
            {msg.creditsUsed > 0 && (
              <span className="chat-message__credits"><IconBolt /> {msg.creditsUsed}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (msg.type === "assistant") {
    return (
      <div className="chat-message chat-message--assistant">
        <div className="chat-message__avatar chat-message__avatar--assistant">H</div>
        <div className="chat-message__bubble chat-message__bubble--assistant">
          <p className="chat-message__text">{msg.text || msg.streamText}</p>
        </div>
      </div>
    );
  }

  if (msg.type === "plan") {
    return (
      <div className="chat-message chat-message--assistant">
        <div className="chat-message__avatar chat-message__avatar--assistant">H</div>
        <div className="chat-message__bubble chat-message__bubble--assistant">
          <div className="chat-message__plan">
            <div className="chat-message__plan-header">
              <span className="chat-message__plan-icon">🧠</span>
              <span>Planning...</span>
              <span className="chat-message__plan-cost">{msg.totalCredits} credits</span>
            </div>
            {msg.steps?.map((step, i) => (
              <div key={i} className={`chat-message__plan-step ${step.status ? `chat-message__plan-step--${step.status}` : ""}`}>
                <span className="chat-message__plan-step-icon">
                  {step.status === "done" ? "✓" : step.status === "running" ? "○" : "·"}
                </span>
                <span className="chat-message__plan-step-label">{step.label}</span>
                {step.cost > 0 && <span className="chat-message__plan-step-cost">{step.cost}⛯</span>}
              </div>
            ))}
            {msg.onConfirm && (
              <button className="chat-message__confirm-btn" onClick={msg.onConfirm}>
                Confirm & Execute ({msg.totalCredits} credits)
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return null;
}
