"use client";

export default function SpecializedWorkspace({ tool, children }) {
  return <section className={`universe-specialized universe-specialized--${tool}`}>{children}</section>;
}

export function withUniverseSpecialized(Component, { tool }) {
  function UniverseSpecializedAdapter(props) { return <SpecializedWorkspace tool={tool}><Component {...props} /></SpecializedWorkspace>; }
  UniverseSpecializedAdapter.displayName = `UniverseSpecialized(${Component.displayName || Component.name || tool})`;
  return UniverseSpecializedAdapter;
}
