// Helmies Studio — turning what the user uploads into what a production can use.
//
// The asset request (src/lib/agent-chat.js) is one half of the exchange: the
// assistant asks for a face, a product, a logo, a voice. This is the other
// half — the part that makes the answer MEAN something.
//
// Before this, an upload in agent chat was a url in a JSON blob that no
// server code read. The fix is not to pass the url further along; it is to
// file the upload as the thing it actually is:
//
//   character / product / environment  →  a StudioEntity with the uploads as
//        `source` references. Every later shot naming its id gets the real
//        face back, through the same entity-inject path the Director uses.
//   logo                               →  the brand kit's visualReferences,
//        role "logo". Never generated: a logo a model drew is a different
//        logo.
//   voice                              →  a `voice` reference on the person
//        it belongs to, which is what makes a clip speak in their voice.
//   footage                            →  kept as-is. Real material the
//        studio cannot generate, handed to the plan unchanged.
//
// Owner-scoped throughout, and every url is re-validated here: the client
// sends back what it uploaded, and "the client sent it" is not provenance.
import prisma from "./prisma.js";
import { createEntity, getOwnedEntity, addEntityReference } from "./entities.js";
import { isAllowedReferenceUrl } from "./entity-core.mjs";
import { ASSET_SLOT_KINDS } from "./agent-chat.js";
import { trimVoiceSample, MAX_VOICE_SECONDS } from "./voice-trim.js";
import { log } from "./log.js";

const MAX_ITEMS = 8;
const MAX_URLS_PER_ITEM = 8;

const clean = (v, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** The urls on one item, filtered to what may legally become a reference. */
export function usableUrls(urls) {
  if (!Array.isArray(urls)) return [];
  const out = [];
  for (const raw of urls.slice(0, MAX_URLS_PER_ITEM)) {
    const url = typeof raw === "string" ? raw.trim() : typeof raw?.url === "string" ? raw.url.trim() : "";
    if (!url || !isAllowedReferenceUrl(url)) continue;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

/* A slot that names an identity kind becomes an entity; the rest are filed
   elsewhere. Kept as a lookup rather than a switch so an unknown kind is
   ignored instead of throwing — the request came from an LLM, and a bad
   slot kind must cost the user a missing card, never a 500. */
const ENTITY_KIND_FOR = Object.fromEntries(
  Object.entries(ASSET_SLOT_KINDS).map(([slot, def]) => [slot, def.entity]),
);

/**
 * File one identity: a new entity, or more references on one that exists.
 *
 * `status: "ready"` on creation is deliberate. An entity left as "draft" is
 * invisible to castHint (which filters to ready/locked), so the planner
 * would never see the character the user just uploaded — they would upload a
 * face and the very next turn would plan without it.
 */
async function fileIdentity(userId, item, { projectId = null } = {}) {
  const kind = ENTITY_KIND_FOR[item.kind];
  if (!kind) return null;
  const urls = usableUrls(item.urls);
  const name = clean(item.name) || clean(item.label) || ASSET_SLOT_KINDS[item.kind].noun;

  if (item.entityId) {
    const existing = await getOwnedEntity(userId, item.entityId);
    if (!existing) return null;
    // Picking an entity that already exists is a complete answer on its own —
    // "use the Wael I made last week" needs no upload at all.
    let row = existing;
    for (const url of urls) {
      const next = await addEntityReference(userId, existing.id, {
        url, kind: "source", label: name, source: "user",
      }).catch((err) => {
        // A locked identity refusing a new reference is the lock working.
        // Report it, keep the entity, do not fail the whole intake.
        log.info("agent_asset_reference_refused", { entityId: existing.id, reason: err?.message });
        return null;
      });
      if (next) row = next;
    }
    return { entity: row, created: false, added: urls.length };
  }

  /* NO UPLOAD IS STILL AN ANSWER.
     ──────────────────────────────────────────────────────────────────────
     A production has people in it who are nobody in particular — a
     bystander, a villain, a hand reaching into frame. There is no photo of
     them to upload, and demanding one would stall the whole card.

     They still need to EXIST, because the thing that keeps an invented
     character consistent across thirty shots is not a reference image; it
     is the same sentence describing them in every prompt. An entity with a
     description and no references gives exactly that: entity-inject writes
     its prompt block into every step that names it, so shot 4 and shot 27
     describe the same person in the same words. Left to the planner, each
     shot re-invents the wording and the face drifts.

     So: uploads make an identity anchored to a real face; a description
     alone makes one anchored to fixed words. Neither is nothing. */
  const description = clean(item.description, 600);
  if (!urls.length && !description) return null;

  const entity = await createEntity(userId, kind, {
    name,
    description: description || null,
    references: urls.map((url) => ({ url, kind: "source", label: name, source: "user" })),
    status: "ready",
    ...(projectId ? { projectId } : {}),
  });
  return { entity, created: true, added: urls.length, describedOnly: !urls.length };
}

/**
 * The logo.
 *
 * Written onto the caller's active brand kit — creating one when they have
 * none, because a user who uploads a logo has a brand whether or not they
 * have filled in a form about it. Stored as a visualReference with role
 * "logo" so the planner and the title renderer can both find it by role
 * rather than by guessing which reference happens to be the mark.
 */
async function fileLogo(userId, item) {
  const urls = usableUrls(item.urls);
  if (!urls.length) return null;
  const name = clean(item.name) || "My brand";

  let kit = await prisma.brandKit.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
  if (!kit) kit = await prisma.brandKit.create({ data: { userId, name } });

  const current = Array.isArray(kit.visualReferences) ? kit.visualReferences : [];
  // One logo, replaced rather than accumulated: a kit holding three "logos"
  // gives every later step a coin flip about which mark is the real one.
  const kept = current.filter((r) => r?.role !== "logo");
  const added = urls.map((url, i) => ({
    url,
    role: "logo",
    label: i === 0 ? "Logo" : `Logo ${i + 1}`,
    addedAt: new Date().toISOString(),
  }));
  const updated = await prisma.brandKit.update({
    where: { id: kit.id },
    data: { visualReferences: [...added, ...kept] },
  });
  return { brandKit: updated, added: urls.length };
}

/**
 * The voice.
 *
 * Filed against the person it belongs to (`voiceFor`), because a voice with
 * no owner cannot be chosen by the one rule that makes dialogue work: the
 * voice on a shot is the voice of whoever speaks in it.
 *
 * The sample is TRIMMED first. This is not tidiness — it is the failure that
 * cost a render: the provider refuses a reference audio outside 2-30 seconds
 * ("Each reference audio must be between 2 and 30 seconds") and refuses the
 * SET if the total exceeds 30. Two 51-second uploads meant every shot with
 * dialogue 422'd, and the error named the reference audio without naming the
 * length. Trimming at intake means the file on record is always one the
 * provider will accept.
 */
async function fileVoice(userId, item, { entitiesByName }) {
  const urls = usableUrls(item.urls);
  if (!urls.length) return null;

  const owner = clean(item.voiceFor) || clean(item.name);
  const target = item.entityId
    ? await getOwnedEntity(userId, item.entityId)
    : owner
      ? entitiesByName.get(owner.toLowerCase()) || await prisma.studioEntity.findFirst({
        where: { userId, kind: "character", name: { equals: owner, mode: "insensitive" } },
      })
      : null;

  const prepared = [];
  for (const url of urls) {
    const trimmed = await trimVoiceSample(url).catch((err) => {
      log.info("agent_voice_trim_failed", { reason: err?.message });
      return null;
    });
    prepared.push(trimmed || { url, seconds: null, trimmed: false });
  }

  if (!target) {
    // Nobody to attach it to. Keep it as a profile so it is not lost, and
    // say so — the caller reports it, rather than silently dropping a file
    // the user was asked for.
    const profile = await prisma.voiceProfile.create({
      data: { userId, name: owner || "Voice sample", status: "ready", voiceId: prepared[0].url },
    });
    return { voiceProfile: profile, orphan: true, owner, samples: prepared };
  }

  let row = target;
  for (const p of prepared) {
    const next = await addEntityReference(userId, target.id, {
      url: p.url, kind: "voice", label: `${target.name} — voice`, source: "user",
    }).catch((err) => {
      log.info("agent_asset_reference_refused", { entityId: target.id, reason: err?.message });
      return null;
    });
    if (next) row = next;
  }
  return { entity: row, voice: true, samples: prepared };
}

/**
 * Accept a filled asset request.
 *
 * Returns { results, receipt } — `receipt` is plain prose appended to the
 * conversation so the assistant's NEXT turn can see, in its own transcript,
 * exactly what exists now and under which ids. The LLM is never handed a
 * side channel; what it knows is what the conversation says.
 */
export async function acceptAssets(userId, { items = [], projectId = null } = {}) {
  const list = Array.isArray(items) ? items.slice(0, MAX_ITEMS) : [];
  const results = [];
  // Identities first, so a voice naming "Wael" can find the Wael created in
  // the same submission. Ordering is the whole reason this is not a map().
  const ordered = [
    ...list.filter((i) => ENTITY_KIND_FOR[i?.kind]),
    ...list.filter((i) => !ENTITY_KIND_FOR[i?.kind]),
  ];
  const entitiesByName = new Map();

  for (const item of ordered) {
    if (!item || typeof item !== "object") continue;
    const kind = clean(item.kind, 20);
    if (!ASSET_SLOT_KINDS[kind]) continue;
    const shaped = { ...item, kind };

    try {
      if (ENTITY_KIND_FOR[kind]) {
        const filed = await fileIdentity(userId, shaped, { projectId });
        if (filed) {
          entitiesByName.set(filed.entity.name.toLowerCase(), filed.entity);
          results.push({ key: shaped.key, kind, ...filed });
        }
      } else if (kind === "logo") {
        const filed = await fileLogo(userId, shaped);
        if (filed) results.push({ key: shaped.key, kind, ...filed });
      } else if (kind === "voice") {
        const filed = await fileVoice(userId, shaped, { entitiesByName });
        if (filed) results.push({ key: shaped.key, kind, ...filed });
      } else if (kind === "footage") {
        const urls = usableUrls(shaped.urls);
        if (urls.length) results.push({ key: shaped.key, kind, urls, name: clean(shaped.name) || "Footage" });
      }
    } catch (err) {
      log.error("agent_asset_intake_failed", { kind, error: err?.message });
      results.push({ key: shaped.key, kind, error: err?.message || "That upload could not be filed." });
    }
  }

  return { results, receipt: buildReceipt(results) };
}

/**
 * What the conversation is told. Pure — unit-tested directly.
 *
 * Written as the USER's turn, in the user's voice, because that is what it
 * is: their answer to the assistant's request. An assistant turn claiming
 * "I have filed your uploads" would be the model reading its own words back
 * as evidence, which is how a run proceeds confidently on assets that never
 * arrived.
 */
export function buildReceipt(results = []) {
  if (!results.length) return "I skipped the uploads for now.";
  const lines = [];
  for (const r of results) {
    if (r.error) { lines.push(`- ${r.kind}: could not be filed (${r.error})`); continue; }
    if (r.entity && r.voice) {
      const trimmed = (r.samples || []).filter((s) => s.trimmed);
      lines.push(`- Voice for ${r.entity.name} is on file (entity id ${r.entity.id})${trimmed.length ? `, trimmed to ${MAX_VOICE_SECONDS}s so the provider accepts it` : ""}.`);
      continue;
    }
    if (r.voiceProfile) {
      lines.push(`- A voice sample is on file, but no character named "${r.owner || "?"}" exists to attach it to — ask me who it belongs to.`);
      continue;
    }
    if (r.brandKit) { lines.push(`- Logo is on file under the brand kit "${r.brandKit.name}".`); continue; }
    if (r.entity) {
      if (r.describedOnly) {
        lines.push(`- ${r.entity.name} (${r.entity.kind}) created from the description alone, no photographs — entity id ${r.entity.id}. Name this id on every shot they appear in so the same words describe them each time; the video model invents the face, but it invents the SAME one.`);
      } else {
        lines.push(r.created
          ? `- ${r.entity.name} (${r.entity.kind}) created with ${r.added} reference image${r.added === 1 ? "" : "s"} — entity id ${r.entity.id}.`
          : `- ${r.entity.name} (${r.entity.kind}) reused${r.added ? `, ${r.added} more reference${r.added === 1 ? "" : "s"} added` : ""} — entity id ${r.entity.id}.`);
      }
      continue;
    }
    if (r.urls) lines.push(`- ${r.name}: ${r.urls.length} file${r.urls.length === 1 ? "" : "s"} attached.`);
  }
  return `Here are the assets you asked for:\n${lines.join("\n")}\n\nUse these ids for every shot that shows them. Go ahead and plan.`;
}
