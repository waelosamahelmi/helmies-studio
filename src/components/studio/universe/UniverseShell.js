"use client";

import Link from "next/link";
import { IconBolt, IconSearch, IconSettings } from "@/components/Icons";

export default function UniverseShell({ children, orbit, index, recents, onCommand, credits, pendingCount }) {
  return <div className="universe-shell">
    <div className="universe-shell__rings" aria-hidden="true"><i /><i /><i /></div>
    <header className="universe-topbar">
      <Link href="/" className="universe-brand"><img src="/ico.svg" alt="" /><strong>Helmies</strong><span>Studio</span></Link>
      <button className="universe-command-trigger" onClick={onCommand}><IconSearch /><span>Ask Helmies or launch any creative instrument</span><kbd>Ctrl K</kbd></button>
      <div className="universe-topbar__actions">{pendingCount > 0 && <Link href="/gallery" className="universe-live"><i />{pendingCount} running</Link>}<Link href="/settings?tab=billing" className="universe-credit"><IconBolt />{credits ?? "···"}</Link><Link href="/settings" className="universe-account" aria-label="Account settings"><IconSettings /></Link></div>
    </header>
    {orbit}{index}
    <main className="universe-page">{children}</main>
    {recents}
  </div>;
}
