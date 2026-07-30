// Server component — forces dynamic rendering so the latest component
// code is always served. The actual UI is in StudioClient.js (a client component).
export const dynamic = "force-dynamic";

import UniverseStudio from "@/components/studio/UniverseStudio";

export default function StudioPage(props) {
  return <UniverseStudio initialTool="image" />;
}
