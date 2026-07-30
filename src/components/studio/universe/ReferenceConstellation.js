"use client";

import { IconClose, IconImage } from "@/components/Icons";

export default function ReferenceConstellation({ assets = [], max = 4, onAdd, onRemove, roles = [] }) {
  return (
    <section className="universe-references" aria-label="Generation references">
      {assets.map((asset, index) => (
        <article key={asset.id || asset.url || index} className="universe-reference">
          {asset.url ? <img src={asset.url} alt={asset.name || `Reference ${index + 1}`} /> : <IconImage />}
          <span>{asset.role || roles[index] || "reference"}</span>
          <button onClick={() => onRemove?.(asset.id)} aria-label={`Remove ${asset.name || "reference"}`}><IconClose /></button>
        </article>
      ))}
      {assets.length < max && <label className="universe-reference universe-reference--add"><input type="file" multiple hidden onChange={(event) => onAdd?.(event.target.files)} /><span>Add reference</span></label>}
    </section>
  );
}
