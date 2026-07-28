// Pass 1 — Context Enrichment
// Spec §28. Add RELEVANT context only: brand kit, project, visual analysis,
// canvas, character/persona, previous approved asset. Never include unrelated
// project data. Never mutate immutable facts (handled in normalizer).

export async function enrichContext(state) {
  const ctx = {
    brand: null,
    project: null,
    visual: null,
    canvas: null,
    character: null,
    previousAsset: null,
  };

  if (state.brandKit) {
    ctx.brand = {
      name: state.brandKit.name || null,
      palette: state.brandKit.palette || null,
      typography: state.brandKit.typography || null,
      photographyStyle: state.brandKit.photographyStyle || null,
      toneOfVoice: state.brandKit.toneOfVoice || null,
      avoid: state.brandKit.avoid || null,
      enforcement: state.brandKit.enforcement || "off",
      slogans: state.brandKit.slogans || null,
    };
  }

  if (state.project) {
    // Only project-relevant fields; do NOT dump the entire project
    ctx.project = {
      name: state.project.name || null,
      type: state.project.type || null,
      tags: state.project.tags || null,
    };
  }

  if (state.visualAnalysis) {
    ctx.visual = {
      caption: state.visualAnalysis.caption || null,
      palette: state.visualAnalysis.palette || null,
      lighting: state.visualAnalysis.lighting || null,
      style: state.visualAnalysis.style || null,
      subjects: state.visualAnalysis.subjects || null,
    };
  }

  if (state.canvas) {
    ctx.canvas = {
      aspectRatio: state.canvas.aspectRatio || null,
      instructions: state.canvas.instructions || null,
      objectRoles: (state.canvas.objects || []).map((o) => ({ role: o.role, type: o.type, note: o.note || null })),
    };
  }

  if (state.character) {
    ctx.character = {
      name: state.character.name || null,
      physicalDescription: state.character.physicalDescription || state.character.description || null,
      style: state.character.style || null,
    };
  }

  if (state.previousAsset) {
    ctx.previousAsset = {
      url: state.previousAsset.url || null,
      prompt: state.previousAsset.prompt || null,
    };
  }

  state.enrichedContext = ctx;
  return state;
}