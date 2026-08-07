"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, Brief, ModelPicker, Stage, Idle,
  Field, Group, Segmented, Chips, RatioPicker, Specs,
  IcPersona,
} from "@/components/studio/kit";
import { INFLUENCER_TABS } from "@/lib/models";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   INFLUENCER — one persona, held steady across every shot
   ──────────────────────────────────────────────────────────────────────────
   The traits are locked once and reused; only the scene changes between
   renders. The inspector shows the exact persona sentence being sent, so a
   drift in the result can be traced to a trait rather than guessed at.

   Fixed in this rebuild:
   · `affordable` was read from useCreditCost and never used, so the Generate
     button stayed live with an empty wallet and the job failed at the server
     with a 402 after the user had done all the work. The dock is gated on it.
   · `error` was computed and never rendered.
   · The model list was `imageModels.slice(0, 12)` — an arbitrary cut of the
     catalog with no search and no reason. It is the full text-to-image group
     now, and the seed id "flux-dev" no longer wins over the catalog.
   · Aspect ratios were a hardcoded list; they follow the model now.
   · `elapsed` was unused.
   ══════════════════════════════════════════════════════════════════════════ */

const EXAMPLES = [
  "In a sunlit gym, mid-set, breathing hard, no phone in frame",
  "On a Paris street in autumn, walking, caught mid-stride",
  "In a quiet cafe by the window, laptop closed, morning light",
  "On a beach at golden hour, wind in the hair, looking off-frame",
];

const FALLBACK_RATIOS = ["1:1", "3:4", "4:3", "9:16", "16:9"];

const DEFAULT_TRAITS = INFLUENCER_TABS.reduce((acc, tab) => {
  tab.categories.forEach((cat) => { acc[cat.id] = cat.options[0]?.id; });
  return acc;
}, {});

export default function InfluencerStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [group, setGroup] = useState(INFLUENCER_TABS[0]?.id);
  const [name, setName] = useState("");
  const [traits, setTraits] = useState(DEFAULT_TRAITS);
  const [scene, setScene] = useState("");
  const [ratio, setRatio] = useState("3:4");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, retryInfo, submit, cancel, reset } = useAsyncGeneration();

  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "tti")),
    [models],
  );

  const model = available.find((m) => m.id === modelId) || available[0] || null;

  useEffect(() => {
    if (available.length && !available.some((m) => m.id === modelId)) {
      setModelId(available[0].id);
    }
  }, [available, modelId]);

  useEffect(() => {
    if (!templateConfig) return;
    if (templateConfig.prompt) setScene(templateConfig.prompt);
    if (templateConfig.aspect_ratio) setRatio(templateConfig.aspect_ratio);
    if (templateConfig.persona_name) setName(templateConfig.persona_name);
    if (templateConfig.model) setModelId(templateConfig.model);
    if (templateConfig.traits) setTraits((t) => ({ ...t, ...templateConfig.traits }));
  }, [templateConfig]);

  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;

  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);

  const { cost, affordable, balance, shortfall } = useCreditCost("image", model?.id || "", {
    aspect_ratio: ratio,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  /* ── The persona sentence ─────────────────────────────────────────────── */
  const segments = useMemo(() => {
    const out = [];
    INFLUENCER_TABS.forEach((tab) => {
      tab.categories.forEach((cat) => {
        const opt = cat.options.find((o) => o.id === traits[cat.id]);
        if (opt?.promptVal) out.push({ k: cat.label, v: opt.promptVal });
      });
    });
    return out;
  }, [traits]);

  const persona = segments.map((s) => s.v).join(", ");

  const compiled = useMemo(
    () => [persona, name.trim(), scene.trim(), "professional photograph, sharp detail"]
      .filter(Boolean)
      .join(", "),
    [persona, name, scene],
  );

  const generate = useCallback(() => {
    if (!model || !affordable) return;
    submit("image", model.id, {
      endpoint: model.endpoint || model.id,
      prompt: compiled,
      aspect_ratio: ratio,
    });
  }, [model, affordable, submit, compiled, ratio]);

  const tab = INFLUENCER_TABS.find((t) => t.id === group) || INFLUENCER_TABS[0];

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Field label="Persona name" hint="Reusing the same name across shots helps the model stay consistent.">
        {(id) => (
          <input
            id={id}
            className="hs-input"
            value={name}
            maxLength={24}
            onChange={(e) => setName(e.target.value)}
            placeholder="Alex, Sophia, Mina"
          />
        )}
      </Field>

      <Field label="Trait group">
        <Segmented
          label="Trait group"
          value={group}
          onChange={setGroup}
          options={INFLUENCER_TABS.map((t) => ({ value: t.id, label: t.label }))}
        />
      </Field>

      {tab?.categories.map((cat) => (
        <Field key={cat.id} label={cat.label}>
          <Chips
            label={cat.label}
            options={cat.options.map((o) => ({ value: o.id, label: o.label }))}
            value={traits[cat.id]}
            onChange={(v) => setTraits((t) => ({ ...t, [cat.id]: v }))}
            scroll
          />
        </Field>
      ))}

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
      </Field>
    </div>
  );

  /* ── Inspector ────────────────────────────────────────────────────────── */
  const inspector = (
    <div className="hs-stack" style={{ gap: "var(--s-5)", minHeight: 0 }}>
      <ModelPicker
        models={available}
        value={model?.id}
        onSelect={setModelId}
        loading={loadingModels}
        emptyHint="No image models in the catalog yet."
      />

      <Group label="This shot">
        <Specs
          rows={[
            { k: "Persona", v: name.trim() || "Unnamed" },
            { k: "Traits", v: `${segments.length}` },
            { k: "Ratio", v: ratio },
          ]}
        />
      </Group>

      <Group label="Persona sentence">
        <div className="hs-panel-quiet" style={{ padding: "var(--s-4)" }}>
          {segments.length ? (
            <p style={{ margin: 0, fontSize: "var(--t-sm)", lineHeight: 1.6 }}>
              {segments.map((s, i) => (
                <span key={s.k}>
                  <span className="hs-mute" style={{ fontSize: 10 }}>{s.k}: </span>
                  <span>{s.v}</span>
                  {i < segments.length - 1 && <span className="hs-dim">, </span>}
                </span>
              ))}
              {name.trim() && <><span className="hs-dim">, </span><span>{name.trim()}</span></>}
              {scene.trim() && <><span className="hs-dim">, </span><span className="hs-mute">{scene.trim()}</span></>}
            </p>
          ) : (
            <p className="hs-hint" style={{ margin: 0 }}>
              Pick traits in the settings pane and the persona sentence builds here.
            </p>
          )}
        </div>
      </Group>
    </div>
  );

  const idle = (
    <Idle
      icon={<IcPersona />}
      title="Build a persona, then place them"
      description="Set the traits once. From then on you only write the scene, and the same person shows up in it."
      examples={EXAMPLES}
      onExample={(e) => setScene((p) => (p ? `${p}. ${e}` : e))}
    />
  );

  return (
    <Workspace controls={controls} inspector={inspector} inspectorLabel="Model">
      <div className="st-work__stage">
        <Stage
          generating={generating}
          result={result}
          error={error}
          stage={stage}
          elapsed={elapsed}
          ratio={ratio}
          model={model?.displayName || model?.name}
          settings={`${name.trim() || "Persona"} · ${ratio}`}
          onCancel={cancel}
          onRetry={generate}
          onEditSettings={reset}
          note={retryInfo ? `Retrying (attempt ${retryInfo.attempts} of ${retryInfo.maxAttempts})…` : undefined}
          onNew={reset}
          idle={idle}
        />
      </div>

      <Brief
        tool="perform"
        value={scene}
        onChange={setScene}
        onSubmit={generate}
        onCancel={cancel}
        generating={generating}
        stage={stage}
        disabled={!model}
        cost={cost || 0}
        balance={balance}
        affordable={affordable}
        shortfall={shortfall}
        placeholder="Describe the scene: where they are, what they are doing, the light."
      />
    </Workspace>
  );
}
