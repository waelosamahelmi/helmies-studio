"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { takeHandoff, HANDOFF_PARAM, HANDOFF_VALUE } from "@/lib/studio-handoff";

/* ══════════════════════════════════════════════════════════════════════════
   useHandoff — receive an asset passed in from another studio
   ──────────────────────────────────────────────────────────────────────────
   Returns the handoff exactly once, then null forever after. The payload is
   cleared from sessionStorage on read (see takeHandoff), so returning to
   this tool later does not silently re-apply an old asset.

   Reading happens in an effect rather than during render because
   sessionStorage does not exist on the server; a render-time read would
   desync the server and client markup.

   Tools use it like inbound templateConfig — the pattern already in
   ImageStudio — applying whatever fields they understand and ignoring the
   rest:

     const handoff = useHandoff();
     useEffect(() => {
       if (!handoff) return;
       setReference({ url: handoff.url });
       if (handoff.prompt) setPrompt(handoff.prompt);
     }, [handoff]);
   ══════════════════════════════════════════════════════════════════════════ */
export function useHandoff() {
  const params = useSearchParams();
  const signalled = params.get(HANDOFF_PARAM) === HANDOFF_VALUE;
  const [handoff, setHandoff] = useState(null);

  useEffect(() => {
    if (!signalled) return;
    const payload = takeHandoff();
    if (payload?.url) setHandoff(payload);
  }, [signalled]);

  return handoff;
}
