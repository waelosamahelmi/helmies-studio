"use client";

import { useRef, useState, useEffect, useCallback } from "react";

/**
 * YouTubeEmbed — autoplaying YouTube video with hidden default controls.
 * Only shows custom play/pause + mute buttons on hover.
 * Auto-plays muted, pauses when scrolled out of view.
 */
export default function YouTubeEmbed({ videoId }) {
  const iframeRef = useRef(null);
  const wrapperRef = useRef(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(true);
  const [hovered, setHovered] = useState(false);

  const postCommand = useCallback((func) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.contentWindow.postMessage(`{"event":"command","func":"${func}","args":""}`, "*");
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          postCommand("playVideo");
          setPlaying(true);
        } else {
          postCommand("pauseVideo");
          setPlaying(false);
        }
      },
      { threshold: 0.5 }
    );

    observer.observe(wrapper);
    return () => observer.disconnect();
  }, [postCommand]);

  const togglePlay = () => {
    if (playing) {
      postCommand("pauseVideo");
    } else {
      postCommand("playVideo");
    }
    setPlaying(!playing);
  };

  const toggleMute = () => {
    if (muted) {
      postCommand("unMute");
    } else {
      postCommand("mute");
    }
    setMuted(!muted);
  };

  return (
    <div className="yt-embed" ref={wrapperRef}>
      <div
        className="yt-embed__inner"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <iframe
          ref={iframeRef}
          src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&loop=1&playlist=${videoId}&controls=0&rel=0&modestbranding=1&playsinline=1&enablejsapi=1`}
          title="Lip Sync Demo"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
        <div className="yt-embed__scrim" />
        {hovered && (
          <div className="yt-embed__controls">
            <button className="yt-embed__btn" onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
              {playing ? (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              )}
            </button>
            <button className="yt-embed__btn" onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"}>
              {muted ? (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12A4.5 4.5 0 0014 8.18v1.7l2.45 2.45c.03-.1.05-.18.05-.28zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 8.18v1.7l2.45 2.45c.03-.1.05-.18.05-.28zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
              )}
            </button>
            <a
              className="yt-embed__btn yt-embed__btn--yt"
              href={`https://www.youtube.com/watch?v=${videoId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Open on YouTube"
            >
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 15l5.19-3L10 9v6m11.56-7.83c.13.47.22 1.1.28 1.9.07.8.1 1.49.1 2.09L22 12c0 2.19-.16 3.8-.44 4.83-.25.9-.83 1.48-1.73 1.73-.47.13-1.33.22-2.65.28-1.3.07-2.49.1-3.59.1L12 19c-4.19 0-6.8-.16-7.83-.44-.9-.25-1.48-.83-1.73-1.73-.13-.47-.22-1.1-.28-1.9-.07-.8-.1-1.49-.1-2.09L2 12c0-2.19.16-3.8.44-4.83.25-.9.83-1.48 1.73-1.73.47-.13 1.33-.22 2.65-.28 1.3-.07 2.49-.1 3.59-.1L12 5c4.19 0 6.8.16 7.83.44.9.25 1.48.83 1.73 1.73z"/></svg>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
