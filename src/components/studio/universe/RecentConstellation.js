export default function RecentConstellation({ assets = [], onOpen }) {
  if (!assets.length) return null;
  return <aside className="universe-recents" aria-label="Recent work">{assets.slice(0, 5).map((asset) => <button key={asset.id} onClick={onOpen} title={asset.name || "Recent generation"} style={{ backgroundImage: `url("${asset.thumbnailUrl || asset.url || asset.outputUrl}")` }} />)}</aside>;
}
