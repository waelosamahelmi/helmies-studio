"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, Dropzone, Specs,
  IcMegaphone,
} from "@/components/studio/kit";
import { MARKETING_AVATARS } from "@/lib/models";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   MARKETING — one brief, one deliverable, cut for one placement
   ──────────────────────────────────────────────────────────────────────────
   Fixed in this rebuild:
   · `campaignFormat` was a control in the inspector that changed nothing:
     it was never put in the submit payload. It is sent now, and it also
     shapes the brief, so choosing it has a visible effect either way.
   · `onNew` cleared the stage label but left `result` in place, so "New"
     redisplayed the previous ad. It calls the hook's `reset` now.
   · `error` was computed and never rendered.
   · The model was whatever the catalog returned first, unnamed and
     unchangeable — including models that cannot accept the avatar and
     product images this tool is built around. The picker is visible and
     warns when the chosen model has no reference slots.
   · `elapsed` was unused.
   ══════════════════════════════════════════════════════════════════════════ */

const PLACEMENTS = [
  { value: "instagram", label: "Instagram", ratio: "9:16" },
  { value: "tiktok", label: "TikTok", ratio: "9:16" },
  { value: "shorts", label: "Shorts", ratio: "9:16" },
  { value: "youtube", label: "YouTube", ratio: "16:9" },
  { value: "x", label: "X", ratio: "16:9" },
];

const FORMATS = [
  {
    value: "product_hero",
    label: "Product hero",
    hint: "Cinematic, product-led, no presenter.",
    prompt: "Product hero advert. Cinematic close coverage of the product, controlled studio light, no presenter on camera.",
  },
  {
    value: "ugc_advert",
    label: "UGC advert",
    hint: "Handheld, presenter-led, reads as authentic.",
    prompt: "UGC-style advert. Handheld phone framing, natural light, presenter speaking directly to camera.",
  },
  {
    value: "social_set",
    label: "Social set",
    hint: "Fast cuts built for a feed.",
    prompt: "Social cutdown. Fast cuts, strong opening frame, motion held through every beat.",
  },
];

const FALLBACK_DURATIONS = [15, 30, 60];
const FALLBACK_RES = ["1080p", "4K"];

export default function MarketingStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [placement, setPlacement] = useState("instagram");
  const [format, setFormat] = useState("ugc_advert");
  const [duration, setDuration] = useState(15);
  const [resolution, setResolution] = useState("1080p");
  const [avatar, setAvatar] = useState(null);
  const [products, setProducts] = useState([]);
  const [prompt, setPrompt] = useState("");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  /* An advert is a video job; reference-capable models are the useful ones,
     so they sort first rather than being the only ones shown. */
  const available = useMemo(() => {
    const video = (models || []).filter((m) => matchesGroup(m, "ttv") || matchesGroup(m, "i2v"));
    return [...video].sort((a, b) => (b.maxImages || 0) - (a.maxImages || 0));
  }, [models]);

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) {
      setModelId(available[0].id);
    }
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setPrompt(templateConfig.prompt);
    if (templateConfig.duration) setDuration(Number(templateConfig.duration));
    if (templateConfig.resolution) setResolution(templateConfig.resolution);
    if (templateConfig.campaign_format) setFormat(templateConfig.campaign_format);
    if (templateConfig.platform) setPlacement(templateConfig.platform);
    if (templateConfig.model) setModelId(templateConfig.model);
  }, [templateConfig]);

  const place = PLACEMENTS.find((p) => p.value === placement) || PLACEMENTS[0];
  const ratio = place.ratio;
  const chosenFormat = FORMATS.find((f) => f.value === format) || FORMATS[0];

  const durations = useMemo(() => {
    const d = (model?.durations || []).map(Number).filter((n) => Number.isFinite(n) && n > 0);
    return d.length ? d : FALLBACK_DURATIONS;
  }, [model]);
  const resolutions = model?.resolutions?.length ? model.resolutions : FALLBACK_RES;

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (durations.length && !durations.includes(Number(duration))) setDuration(durations[0]);
  }, [durations, duration]);
  useEffect(() => {
    const has = resolutions.some((r) => String(r).toLowerCase() === String(resolution).toLowerCase());
    if (resolutions.length && !has) setResolution(resolutions[0]);
  }, [resolutions, resolution]);

  /* Reference slots the chosen model actually has */
  const maxRefs = model?.maxImages || 0;
  const references = useMemo(
    () => [...(avatar ? [avatar.url] : []), ...products.map((p) => p.url)],
    [avatar, products],
  );
  const refsOverflow = maxRefs > 0 && references.length > maxRefs;
  const refsUnsupported = maxRefs === 0 && references.length > 0;

  const { cost, affordable, balance, shortfall } = useCreditCost("marketing", model?.id || "", {
    duration,
    resolution,
    aspect_ratio: ratio,
    images_list: references,
  });


  const generate = useCallback(() => {
    if (!model) return;
    submit("marketing", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: `${chosenFormat.prompt} ${prompt}`.trim(),
      campaign_format: format,
      aspect_ratio: ratio,
      duration: Number(duration),
      resolution,
      images_list: maxRefs > 0 ? references.slice(0, maxRefs) : references,
    });
  }, [model, submit, chosenFormat, prompt, format, ratio, duration, resolution, references, maxRefs]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Placement" hint={`Sets the frame to ${ratio}.`}>
        <Chips label="Placement" options={PLACEMENTS} value={placement} onChange={setPlacement} scroll />
      </Field>

      <Field label="Length">
        <Chips
          label="Length"
          options={durations.map((d) => ({ value: d, label: `${d}s` }))}
          value={duration}
          onChange={(v) => setDuration(Number(v))}
          compare={(a, b) => Number(a) === Number(b)}
          scroll
        />
      </Field>

      {resolutions.length > 1 && (
        <Field label="Resolution">
          <Segmented
            label="Resolution"
            value={resolution}
            onChange={setResolution}
            options={resolutions.map((r) => ({ value: r, label: String(r).toUpperCase() }))}
          />
        </Field>
      )}

      <Field
        label="Presenter"
        hint={avatar ? `${avatar.name} is on camera. Tap again to drop them.` : "Optional. Pick a face for presenter-led formats."}
      >
        <Chips
          label="Presenter"
          options={MARKETING_AVATARS.map((a) => ({ value: a.id, label: a.name }))}
          value={avatar?.id || ""}
          onChange={(id) =>
            setAvatar((prev) => (prev?.id === id ? null : MARKETING_AVATARS.find((a) => a.id === id) || null))
          }
          scroll
        />
      </Field>

      <Field
        label="Product shots"
        hint={maxRefs > 0 ? `This model takes ${maxRefs} reference${maxRefs > 1 ? "s" : ""} in total.` : "Photograph the product on a plain surface for the cleanest result."}
      >
        <Dropzone
          value={products}
          onChange={setProducts}
          accept="image/*"
          multiple
          max={4}
          label="Drop product shots or browse"
          hint="Up to 4"
        />
      </Field>

      {refsUnsupported && (
        <p className="hs-notice hs-notice--caution">
          This model takes no reference images, so the presenter and product shots will be
          ignored. Pick a model with reference slots to use them.
        </p>
      )}
      {refsOverflow && (
        <p className="hs-notice hs-notice--caution">
          {references.length} references attached but this model takes {maxRefs}. The first {maxRefs} are sent.
        </p>
      )}
    </div>
  );

  /* ── Inspector ────────────────────────────────────────────────────────── */
  const inspector = (
    <div className="hs-stack" style={{ gap: "var(--s-5)", minHeight: 0 }}>
      <Field label="Campaign format" hint={chosenFormat.hint}>
        <Segmented
          label="Campaign format"
          value={format}
          onChange={setFormat}
          options={FORMATS.map((f) => ({ value: f.value, label: f.label }))}
        />
      </Field>

      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        emptyHint="No video models in the catalog yet."
      />

      <Group label="This deliverable">
        <Specs
          rows={[
            { k: "Placement", v: place.label },
            { k: "Ratio", v: ratio },
            { k: "Length", v: `${duration}s` },
            { k: "Res", v: String(resolution).toUpperCase() },
            { k: "Refs", v: `${references.length}` },
          ]}
        />
      </Group>
    </div>
  );

  const idle = (
    <Idle
      icon={<IcMegaphone />}
      title="Brief one campaign"
      description="Say what the product is and who it is for. The format and placement handle the rest of the shape."
      examples={[
        "Skincare serum for people who travel — calm, honest, no hard sell",
        "Running shoe launch, first 3 seconds have to stop the scroll",
        "Coffee subscription, morning routine, warm and unhurried",
      ]}
      onExample={(e) => setPrompt((p) => (p ? `${p}. ${e}` : e))}
    />
  );

  return (
    <Workspace controls={controls} inspector={inspector} inspectorLabel="Campaign">
      <div className="st-work__stage">
        <Stage
          prompt={prompt}
          generating={generating}
          result={result}
          error={error}
          stage={stage}
          elapsed={elapsed}
          ratio={ratio}
          model={model?.displayName || model?.name}
          settings={`${chosenFormat.label} · ${ratio} · ${duration}s`}
          onCancel={cancel}
          onRetry={generate}
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
          onNew={reset}
          idle={idle}
        />
      </div>

      <Brief
        tool="marketing"
        value={prompt}
        onChange={setPrompt}
        onSubmit={generate}
        onCancel={cancel}
        generating={generating}
        stage={stage}
        disabled={!model}
        cost={cost || 0}
        balance={balance}
        affordable={affordable}
        shortfall={shortfall}
        placeholder="What is the product, who is it for, and what should they do next?"
      />
    </Workspace>
  );
}
