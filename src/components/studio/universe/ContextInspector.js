export default function ContextInspector({ title = "Context intelligence", children }) {
  return <aside className="universe-inspector"><header><span>Context orbit</span><h2>{title}</h2></header>{children}</aside>;
}
