(function () {
  const toolMap = { agent: "orchestrator", projects: "memory", recast: "body-swap", motion: "vibe-motion" };
  let activeController = null;
  let activeGeneration = null;
  let accountCredits = null;

  const nativeCredit = credit;
  credit = function () {
    if (accountCredits === null) return nativeCredit();
    return `<div class="credit"><i></i><span>${Number(accountCredits).toLocaleString()} credits</span></div>`;
  };

  function catalogTuple(model) {
    const image = model.background || model.thumbnailUrl || APP.assets?.[0]?.src || "";
    return [model.displayName, model.provider, `${model.credits || 0} cr`, image, model.id];
  }

  async function loadLiveData() {
    const requestedPage = new URLSearchParams(location.search).get("page");
    if (requestedPage && APP.pages.some((item) => item.id === requestedPage)) APP.state.page = requestedPage;
    const [creditsResult, imageResult, videoResult, audioResult, assetResult] = await Promise.allSettled([
      fetch("/api/credits").then((response) => response.ok ? response.json() : null),
      fetch("/api/models/catalog?type=image").then((response) => response.ok ? response.json() : null),
      fetch("/api/models/catalog?type=video").then((response) => response.ok ? response.json() : null),
      fetch("/api/models/catalog?type=audio").then((response) => response.ok ? response.json() : null),
      fetch("/api/assets?limit=40").then((response) => response.ok ? response.json() : null),
    ]);
    if (creditsResult.status === "fulfilled") accountCredits = creditsResult.value?.credits ?? accountCredits;
    if (imageResult.status === "fulfilled" && imageResult.value?.models?.length) APP.models.image = imageResult.value.models.map(catalogTuple);
    if (videoResult.status === "fulfilled" && videoResult.value?.models?.length) APP.models.video = videoResult.value.models.map(catalogTuple);
    if (audioResult.status === "fulfilled" && audioResult.value?.models?.length) APP.models.audio = audioResult.value.models.map(catalogTuple);
    if (assetResult.status === "fulfilled" && assetResult.value?.assets?.length) {
      APP.assets = assetResult.value.assets.map((asset) => ({ id: asset.id, name: asset.name || "Studio asset", type: asset.type || "Media", src: asset.thumbnailUrl || asset.url || asset.outputUrl })).filter((asset) => asset.src);
      APP.state.selectedAssets = new Set(APP.assets.slice(0, 1).map((asset) => asset.id));
    }
    const firstModel = currentModels(page().kind)[0];
    if (firstModel) APP.state.model = firstModel[0];
    render();
  }

  function chosenModelId() {
    const selected = currentModels(page().kind).find((model) => model[0] === APP.state.model);
    return selected?.[4] || selected?.[0] || APP.state.model;
  }

  function generationParams() {
    return {
      duration: APP.state.duration,
      aspect_ratio: APP.state.ratio,
      resolution: APP.state.quality === "HD" ? "720p" : APP.state.quality.toLowerCase(),
      image_url: APP.assets.find((asset) => APP.state.selectedAssets.has(asset.id))?.src,
    };
  }

  async function pollGeneration(url) {
    for (let attempt = 0; attempt < 450; attempt += 1) {
      if (activeController?.signal.aborted) throw new DOMException("Cancelled", "AbortError");
      const response = await fetch(url, { signal: activeController.signal });
      const data = await response.json();
      const generation = data.generation || data;
      APP.state.progress = Math.min(94, 24 + attempt * 2);
      APP.state.stage = generation.status === "processing" ? "Generating composition" : "Waiting for provider";
      if (["completed", "succeeded", "success"].includes(generation.status)) return generation;
      if (["failed", "error", "cancelled"].includes(generation.status)) throw new Error(generation.error || "Generation failed");
      render();
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    throw new Error("Generation timed out");
  }

  generate = async function () {
    if (APP.state.generating) return cancelGeneration();
    const prompt = document.getElementById("prompt")?.value?.trim();
    if (!prompt) return toast("Add a generation direction first");
    activeController = new AbortController();
    APP.state.generating = true;
    APP.state.result = false;
    APP.state.progress = 8;
    APP.state.stage = "Preparing request";
    render();
    try {
      const tool = toolMap[APP.state.page] || APP.state.page;
      const response = await fetch("/api/generate/async", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: activeController.signal,
        body: JSON.stringify({ tool, model: chosenModelId(), prompt, ...generationParams() }),
      });
      const submitted = await response.json();
      if (!response.ok) throw new Error(submitted.error || "Generation submission failed");
      activeGeneration = submitted.generationId;
      APP.state.stage = "Submitting to provider";
      APP.state.progress = 22;
      render();
      const completed = await pollGeneration(submitted.pollUrl || `/api/generations/status?id=${submitted.generationId}`);
      APP.result = completed.outputUrl || completed.url || completed.outputs?.[0];
      APP.state.progress = 100;
      APP.state.stage = "Ready";
      APP.state.generating = false;
      APP.state.result = Boolean(APP.result);
      if (typeof submitted.remainingCredits === "number") accountCredits = submitted.remainingCredits;
      render();
      toast("Generation completed and saved to Assets");
    } catch (error) {
      APP.state.generating = false;
      APP.state.progress = 0;
      APP.state.stage = "Ready";
      render();
      if (error.name !== "AbortError") toast(error.message || "Generation failed");
    }
  };

  cancelGeneration = function () {
    activeController?.abort();
    activeController = null;
    activeGeneration = null;
    APP.state.generating = false;
    APP.state.progress = 0;
    APP.state.stage = "Ready";
    render();
    toast("Generation cancelled. Reserved credits will be released");
  };

  async function uploadFile(file) {
    const form = new FormData();
    form.append("file", file);
    const response = await fetch("/api/upload", { method: "POST", body: form });
    const uploaded = await response.json();
    if (!response.ok || !uploaded.url) throw new Error(uploaded.error || "Upload failed");
    const asset = { id: `upload-${Date.now()}`, name: file.name, type: file.type.startsWith("video/") ? "Video" : "Image", src: uploaded.url };
    APP.assets.unshift(asset);
    APP.state.selectedAssets.add(asset.id);
    APP.state.modal = "";
    render();
    toast("Reference uploaded and selected");
  }

  document.addEventListener("click", (event) => {
    const target = event.target.closest('[data-action="device-upload"]');
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/*,audio/*";
    input.onchange = () => input.files?.[0] && uploadFile(input.files[0]).catch((error) => toast(error.message));
    input.click();
  }, true);

  loadLiveData().catch(() => render());
})();
