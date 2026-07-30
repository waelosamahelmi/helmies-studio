"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Workspace, ModelPicker, Stage, Idle, SpendMeter,
  Field, Group, Segmented, RatioPicker, Dropzone, Specs,
  IcSwap, IcBolt, IcClose,
} from "@/components/studio/kit";
import { useModelCatalog } from "./useModelCatalog";
import { useAsyncGeneration } from "./useAsyncGeneration";
import { useCreditCost } from "./useCreditCost";
import { matchesGroup } from "@/lib/capability-groups";

/* ══════════════════════════════════════════════════════════════════════════
   RECAST — put one identity into another performance
   ──────────────────────────────────────────────────────────────────────────
   Two sources, and which is which decides the whole result. The controls say
   it in those terms: the IDENTITY is the face you want to see, the SCENE is
   the footage whose blocking, timing and performance are kept.

   Fixed in this rebuild:
   · `error` was computed and never rendered. Two large uploads followed by
     silence was the entire failure experience.
   · The orientation control was gated on `currentModel.hasOrientation`, a
     flag that exists only on the static fallback list and is never emitted by
     the live catalog — so it never appeared. It is always available now and
     defaults to "auto", which simply omits the field.
   · There was no aspect ratio control even though the endpoint accepts one.
   · `elapsed` was unused.
   ══════════════════════════════════════════════════════════════════════════ */

const ORIENTATIONS = [
  { value: "", label: "Auto" },
  { value: "left", label: "Faces left" },
  { value: "right", label: "Faces right" },
];

const FALLBACK_RATIOS = ["16:9", "9:16", "1:1"];

export default function RecastStudio({ initialModel, templateConfig, onCreditsChanged }) {
  const [modelId, setModelId] = useState(initialModel || null);
  const [identity, setIdentity] = useState(null);
  const [scene, setScene] = useState(null);
  const [orientation, setOrientation] = useState("");
  const [ratio, setRatio] = useState("16:9");
  const [note, setNote] = useState("");

  const { models, loading: loadingModels } = useModelCatalog({});
  const { loading: generating, result, error, elapsed, stage, submit, cancel, reset } = useAsyncGeneration();

  const available = useMemo(
    () => (models || []).filter((m) => matchesGroup(m, "v2v")),
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
    if (templateConfig.prompt) setNote(templateConfig.prompt);
    if (templateConfig.aspect_ratio) setRatio(templateConfig.aspect_ratio);
    if (templateConfig.character_orientation) setOrientation(templateConfig.character_orientation);
    if (templateConfig.model) setModelId(templateConfig.model);
  }, [templateConfig]);

  const ratios = model?.aspectRatios?.length ? model.aspectRatios : FALLBACK_RATIOS;

  useEffect(() => {
    if (ratios.length && !ratios.includes(ratio)) setRatio(ratios[0]);
  }, [ratios, ratio]);

  const { cost, affordable, balance, shortfall } = useCreditCost("recast", model?.id || "", {
    image_url: identity?.url,
    video_url: scene?.url,
    aspect_ratio: ratio,
  });

  useEffect(() => { if (result) onCreditsChanged?.(); }, [result, onCreditsChanged]);

  const paired = !!identity?.url && !!scene?.url;
  const ready = paired && !!model && affordable && !generating;

  const generate = useCallback(() => {
    if (!model || !paired) return;
    const params = {
      endpoint: model.endpoint || model.id,
      image_url: identity.url,
      video_url: scene.url,
      aspect_ratio: ratio,
    };
    if (orientation) params.character_orientation = orientation;
    if (note.trim()) params.prompt = note.trim();
    submit("recast", model.id, params);
  }, [model, paired, submit, identity, scene, ratio, orientation, note]);

  /* ── Controls ─────────────────────────────────────────────────────────── */
  const controls = (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Group label="The pairing">
        <p className="hs-hint" style={{ margin: 0 }}>
          The identity is the face you want to see. The scene is the footage whose
          blocking and performance are kept.
        </p>

        <Field
          label="1 · Identity"
          hint={identity ? "A clear, front-lit face reads best." : "One photo of the face to carry across."}
        >
          <Dropzone
            value={identity}
            onChange={setIdentity}
            accept="image/*"
            label="Drop the face or browse"
            hint="JPG, PNG or WebP"
          />
        </Field>

        <Field
          label="2 · Scene"
          hint={scene ? "Timing and framing come from this clip." : "The clip the identity is placed into."}
        >
          <Dropzone
            value={scene}
            onChange={setScene}
            accept="video/*"
            label="Drop the footage or browse"
            hint="MP4, MOV or WebM"
          />
        </Field>

        {!paired && (
          <p className="hs-hint" style={{ margin: 0 }}>
            {!identity && !scene
              ? "Both sources are needed before this can run."
              : !identity
                ? "Add the identity photo to complete the pair."
                : "Add the scene footage to complete the pair."}
          </p>
        )}
      </Group>

      <Field label="Head direction" hint="Auto leaves it to the model. Set it when the identity photo is a profile.">
        <Segmented
          label="Head direction"
          value={orientation}
          onChange={setOrientation}
          options={ORIENTATIONS}
        />
      </Field>

      <Field label="Aspect ratio">
        <RatioPicker options={ratios} value={ratio} onChange={setRatio} />
      </Field>

      <Field label="Direction" hint="Optional. Anything the recast should hold on to.">
        {(id) => (
          <textarea
            id={id}
            className="hs-input hs-textarea"
            style={{ minHeight: 64 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Keep the beard, match the warm key light"
          />
        )}
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
        emptyHint="No recast models in the catalog yet."
      />

      <Group label="This pairing">
        <Specs
          rows={[
            { k: "Identity", v: identity ? "Loaded" : "Missing" },
            { k: "Scene", v: scene ? "Loaded" : "Missing" },
            { k: "Head", v: ORIENTATIONS.find((o) => o.value === orientation)?.label },
            { k: "Ratio", v: ratio },
          ]}
        />
      </Group>
    </div>
  );

  const idle = (
    <Idle
      icon={<IcSwap />}
      title="Pair an identity with a scene"
      description="Load one photo of the face you want and the clip it should appear in. The clip keeps its timing, blocking and performance — only the identity changes."
    />
  );

  /* ── Dock ─────────────────────────────────────────────────────────────
     Recast has no required brief, so the action is gated on the pairing
     rather than on text. Same meter, same button, different condition. */
  const dock = (
    <div className="st-dock-prompt">
      <div className="st-spend">
        <SpendMeter
          cost={cost || 0}
          balance={balance}
          affordable={affordable}
          shortfall={shortfall}
          label="Cost"
        />

        {generating ? (
          <button type="button" className="hs-btn hs-btn--outline hs-btn--lg" onClick={cancel}>
            <span className="hs-spin" />
            {stage ? String(stage).replace(/_/g, " ") : "Working"}
            <IcClose className="hs-icon-sm" />
          </button>
        ) : (
          <button
            type="button"
            className="hs-btn hs-btn--primary hs-btn--lg"
            onClick={generate}
            disabled={!ready}
            title={
              !model ? "No recast model available"
                : !identity ? "Add the identity photo first"
                  : !scene ? "Add the scene footage first"
                    : !affordable ? "Not enough credits"
                      : "Recast"
            }
          >
            <IcBolt className="hs-icon-sm" />
            Recast
            {cost > 0 && <span className="hs-btn__cost">{cost}</span>}
          </button>
        )}
      </div>
    </div>
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
          settings={ratio}
          onCancel={cancel}
          onRetry={generate}
          onNew={reset}
          idle={idle}
        />
      </div>

      {dock}
    </Workspace>
  );
}
