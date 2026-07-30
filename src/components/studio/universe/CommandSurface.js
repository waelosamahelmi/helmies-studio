"use client";

import CommandPalette from "@/components/studio/CommandPalette";
export default function CommandSurface({ open, ...props }) {
  if (!open) return null;
  return <CommandPalette {...props} />;
}
