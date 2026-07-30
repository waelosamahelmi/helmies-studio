import { IconDownload, IconArrowUpRight, IconBolt } from "@/components/Icons";

export default function GenerationResult({ result, type = "image", model, elapsed, onRetry, onReference }) {
  const url = result?.url || result?.outputUrl;
  if (!url) return null;
  return <section className="universe-result"><div className="universe-result__media">{type === "video" ? <video src={url} controls /> : type === "audio" ? <audio src={url} controls /> : <img src={url} alt="Generated output" />}</div><aside><span>Generation complete</span><h2>{result.name || "New creative output"}</h2><dl><div><dt>Model</dt><dd>{model}</dd></div><div><dt>Final cost</dt><dd><IconBolt /> {result.creditsUsed || "Recorded"}</dd></div><div><dt>Render time</dt><dd>{Math.round(elapsed || 0)} seconds</dd></div></dl><div className="universe-result__actions"><a href={url} download className="universe-button universe-button--primary"><IconDownload /> Download</a><button onClick={onReference} className="universe-button">Use as reference</button><button onClick={onRetry} className="universe-button"><IconArrowUpRight /> Create variation</button></div></aside></section>;
}
