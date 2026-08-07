/* ══════════════════════════════════════════════════════════════════════════
   STUDIO KIT
   The shared parts. Tools compose their own layout from these — there is no
   mandatory workspace shape, because a shot board and a waveform editor are
   not the same craft.
   ══════════════════════════════════════════════════════════════════════════ */

export { default as Shell } from "./Shell";
export { default as Workspace } from "./Workspace";
export { default as Brief } from "./Brief";
export { default as History } from "./History";
export { default as Commit } from "./Commit";
export { useGridRoving, useCopyFeedback, LibrarySearch, LibraryCard, LibrarySkeleton } from "./Library";
export { default as ModelPicker } from "./ModelPicker";

export { default as Stage, Rendering, Result, Idle, Fault, Readout, mediaUrl, clock } from "./Stage";
export { default as ErrorPanel } from "./ErrorPanel";
export { SpendMeter, CostTag } from "./Spend";
export { Sheet, Modal, Confirm } from "./Sheet";

export {
  Field, Group, Segmented, Chips, RatioPicker, Toggle, Stepper, Slider,
  Dropzone, Specs, useUpload,
} from "./Controls";

export * from "./Icons";
export { TOOLS, GROUPS, TOOL_IDS, DOCK_TOOLS, getTool, byGroup } from "./tools";
