"use client";

import { useState, useRef } from "react";
import { motion } from "framer-motion";
import { IconBolt, IconArrowUpRight, IconClose } from "@/components/Icons";

const EASE = [0.32, 0.72, 0, 1];

function MasonryItem({ item, index }) {
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef(null);

  const isVideo = item.url?.match(/\.(mp4|webm)$/i);
  const isImage = item.url?.match(/\.(jpg|jpeg|png|webp|gif)$/i);

  return (
    <motion.div
      className="masonry__item"
      initial={{ opacity: 0, y: 20, filter: "blur(8px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ delay: index * 0.06, duration: 0.5, ease: EASE }}
      onMouseEnter={() => {
        setHovered(true);
        if (videoRef.current) videoRef.current.play();
      }}
      onMouseLeave={() => {
        setHovered(false);
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.currentTime = 0; }
      }}
    >
      {isVideo && (
        <video
          ref={videoRef}
          src={item.url}
          className="masonry__media"
          muted
          loop
          playsInline
          preload="metadata"
        />
      )}
      {isImage && (
        <img src={item.url} alt={item.prompt || ""} className="masonry__media" loading="lazy" />
      )}
      {!isVideo && !isImage && (
        <div className="masonry__text-preview">
          <pre>{typeof item.url === "string" ? item.url.slice(0, 200) : "Output"}</pre>
        </div>
      )}

      <div className={`masonry__overlay ${hovered ? "masonry__overlay--visible" : ""}`}>
        <div className="masonry__overlay-top">
          <span className="masonry__badge">{item.tool || item.type || "Generated"}</span>
          {item.creditsUsed && (
            <span className="masonry__cost"><IconBolt /> {item.creditsUsed}</span>
          )}
        </div>
        <div className="masonry__overlay-bottom">
          {item.prompt && <p className="masonry__prompt">{item.prompt.slice(0, 80)}{item.prompt.length > 80 ? "..." : ""}</p>}
          <a href={item.url} download className="masonry__download">
            <IconArrowUpRight />
          </a>
        </div>
      </div>
    </motion.div>
  );
}

export default function MasonryGrid({ items = [] }) {
  return (
    <div className="masonry">
      {items.map((item, i) => (
        <MasonryItem key={item.id || i} item={item} index={i} />
      ))}
    </div>
  );
}
