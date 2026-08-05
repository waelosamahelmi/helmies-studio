"use client";

import { useStudioMode } from "./useStudioMode";
import ModeBar from "./ModeBar";
import LipSyncStudio from "./LipSyncStudio";
import AvatarStudio from "./AvatarStudio";
import InfluencerStudio from "./InfluencerStudio";

/* ══════════════════════════════════════════════════════════════════════════
   PERFORM — one studio, three modes (S1 consolidation)
   ──────────────────────────────────────────────────────────────────────────
   · Lip Sync — LipSyncStudio mounted whole: match a performance to a voice
     track.
   · Avatar   — AvatarStudio mounted whole: a portrait speaks from driving
     audio.
   · Persona  — the persona flow the registry used to file under
     "influencer": build a character whose traits are locked once and held
     steady across every shot (InfluencerStudio mounted whole).

   The retired slugs /studio/lipsync, /studio/avatar and /studio/influencer
   redirect here with the matching `?mode=`. Each mode body is keyed by its
   mode — state is isolated per mode, the same contract StudioClient's
   ErrorBoundary applies per tool.
   ══════════════════════════════════════════════════════════════════════════ */

const MODES = ["lipsync", "avatar", "persona"];
const MODE_OPTIONS = [
  { value: "lipsync", label: "Lip Sync" },
  { value: "avatar", label: "Avatar" },
  { value: "persona", label: "Persona" },
];

const BODIES = {
  lipsync: LipSyncStudio,
  avatar: AvatarStudio,
  persona: InfluencerStudio,
};

export default function PerformStudio(props) {
  const { mode, setMode } = useStudioMode({ modes: MODES, fallback: "lipsync" });
  const Body = BODIES[mode];

  return (
    <div className="st-moded">
      <ModeBar label="Perform mode" value={mode} onChange={setMode} options={MODE_OPTIONS} />
      <div className="st-moded__body" key={mode}>
        <Body {...props} />
      </div>
    </div>
  );
}
