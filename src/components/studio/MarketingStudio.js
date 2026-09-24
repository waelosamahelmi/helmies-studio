"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, Slider, Dropzone, Specs,
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
   · `campaignFormat` was a control in the inspector that changed nothing.
     It shapes the BRIEF now (FORMATS[].prompt), which is the only place it
     can have an effect: it was also being sent as a `campaign_format` param,
     a field no model declares — dead weight at best, a rejected run on the
     provider's generic envelope at worst.
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

/* No fallback lengths or resolutions. 15/30/60 seconds and "1080p/4K" were
   offered for every model that published none — and no model in the catalog
   renders 60 seconds or takes "4K" by that name, so the control promised a
   deliverable the run could not produce. What is offered comes from the
   chosen model's schema: its fixed lengths, or its length range. */
const NONE = [];

export default function MarketingStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [placement, setPlacement] = useState("instagram");
  const [format, setFormat] = useState("ugc_advert");
  const [duration, setDuration] = useState(0);
  const [resolution, setResolution] = useState("");
  const [avatar, setAvatar] = useState(null);
  const [products, setProducts] = useState([]);
  const [prompt, setPrompt] = useState("");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  /* An advert is a video job; reference-capable models are the useful ones,
     so they sort first rather than being the only ones shown.

     Text-to-video only (which includes the coarse "video" rows — the ones
     that also take references). Image-to-video models were pooled in too, and
     every one of them REQUIRES a source still this studio never collects. */
  const available = useMemo(() => {
    const video = (models || []).filter((m) => matchesGroup(m, "ttv"));
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

  const durations = useMemo(
    () => (model?.durations || []).map(Number).filter((n) => Number.isFinite(n) && n > 0),
    [model],
  );
  /* Fixed lengths win; a range is only used when the model publishes no enum. */
  const range = durations.length ? null : model?.durationRange || null;
  const resolutions = model?.resolutions?.length ? model.resolutions : NONE;

  /* Drop settings the chosen model does not offer */
  useEffect(() => {
    if (durations.length) {
      // An advert wants room: start from the longest fixed length on offer.
      if (!durations.includes(Number(duration))) setDuration(Math.max(...durations));
      return;
    }
    if (range) {
      const n = Number(duration);
      if (!(n >= range.min && n <= range.max)) setDuration(range.default);
      return;
    }
    if (duration) setDuration(0);
  }, [durations, range, duration]);
  useEffect(() => {
    if (!resolutions.length) { if (resolution) setResolution(""); return; }
    const has = resolutions.some((r) => String(r).toLowerCase() === String(resolution).toLowerCase());
    if (!has) setResolution(resolutions[0]);
  }, [resolutions, resolution]);

  /* Reference slots the chosen model actually has */
  const maxRefs = model?.maxImages || 0;
  const references = useMemo(
    () => [...(avatar ? [avatar.url] : []), ...products.map((p) => p.url)],
    [avatar, products],
  );
  const refsOverflow = maxRefs > 0 && references.length > maxRefs;
  const refsUnsupported = maxRefs === 0 && references.length > 0;

  /* ONE set of settings for the quote and the submit. `images_list` is the
     studio's word for references — the server moves it into whichever field
     the model calls them — and it is only sent to a model that has such a
     field. To one that does not, the references were an unknown key. */
  const settings = useMemo(() => {
    const out = { aspect_ratio: ratio };
    if (duration) out.duration = Number(duration);
    if (resolution) out.resolution = resolution;
    if (maxRefs > 0 && references.length) out.images_list = references.slice(0, maxRefs);
    return out;
  }, [ratio, duration, resolution, references, maxRefs]);

  const { cost, affordable, balance, shortfall } = useCreditCost("marketing", model?.id || "", settings);


  const generate = useCallback(() => {
    if (!model) return;
    submit("marketing", model.id, {
      endpoint: model.endpoint || model.id,
      // The campaign format travels as direction in the brief, not as a param.
      prompt: `${chosenFormat.prompt} ${prompt}`.trim(),
      ...settings,
    });
  }, [model, submit, chosenFormat, prompt, settings]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Placement" hint={`Sets the frame to ${ratio}.`}>
        <Chips label="Placement" options={PLACEMENTS} value={placement} onChange={setPlacement} scroll />
      </Field>

      {durations.length > 1 && (
        <Field label="Length" hint="This model's fixed lengths. Longer costs more.">
          <Chips
            label="Length"
            options={durations.map((d) => ({ value: d, label: `${d}s` }))}
            value={duration}
            onChange={(v) => setDuration(Number(v))}
            compare={(a, b) => Number(a) === Number(b)}
            scroll
          />
        </Field>
      )}

      {range && (
        <Field hint="Longer costs more.">
          <Slider
            label="Length"
            min={range.min}
            max={range.max}
            step={1}
            value={duration || range.default}
            onChange={setDuration}
            format={(v) => `${v}s`}
          />
        </Field>
      )}

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
            { k: "Length", v: duration ? `${duration}s` : "Model default" },
            { k: "Res", v: resolution ? String(resolution).toUpperCase() : "Model default" },
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
          settings={[chosenFormat.label, ratio, duration ? `${duration}s` : null].filter(Boolean).join(" · ")}
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
