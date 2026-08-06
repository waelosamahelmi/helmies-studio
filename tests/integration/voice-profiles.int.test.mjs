import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, createUserWithWallet } from "./setup.mjs";

// S2 — VoiceProfile persistence against the real (disposable, local-only)
// test database: the migration's table + defaults, cross-user isolation
// (404-on-other-user like agent-sessions), the wizard's status walk, and
// the picker's status filter.

let prisma;
let vp;

beforeEach(async () => {
  prisma = await resetDb();
  vp = await import("@/lib/voice-profiles");
});

describe("voice profiles (integration)", () => {
  it("creates with the migration's defaults: provider suno, empty voiceId, status pending", async () => {
    const user = await createUserWithWallet(100);
    const p = await vp.createProfile(user.id, { name: "  My narrator  " });
    expect(p.name).toBe("My narrator");
    expect(p.provider).toBe("suno");
    expect(p.voiceId).toBe("");
    expect(p.status).toBe("pending");
    expect(p.userId).toBe(user.id);
  });

  it("isolates profiles between users — the other user's read/update/delete 404 like a missing row", async () => {
    const alice = await createUserWithWallet(100);
    const bob = await createUserWithWallet(100);
    const mine = await vp.createProfile(alice.id, { name: "Alice voice" });

    await expect(vp.getProfile(bob.id, mine.id)).rejects.toMatchObject({ status: 404 });
    await expect(vp.updateStatus(bob.id, mine.id, "ready")).rejects.toMatchObject({ status: 404 });
    await expect(vp.deleteProfile(bob.id, mine.id)).rejects.toMatchObject({ status: 404 });

    const bobsList = await vp.listProfiles(bob.id);
    expect(bobsList.map((p) => p.id)).not.toContain(mine.id);

    // Alice's own profile is untouched by any of it.
    const still = await vp.getProfile(alice.id, mine.id);
    expect(still.status).toBe("pending");
  });

  it("walks the wizard's transitions and persists the voiceId at ready", async () => {
    const user = await createUserWithWallet(100);
    const p = await vp.createProfile(user.id, { name: "Narrator" });

    await vp.updateStatus(user.id, p.id, "validating");
    await vp.updateStatus(user.id, p.id, "generating");
    const ready = await vp.updateProfile(user.id, p.id, { status: "ready", voiceId: "voice_abc123" });
    expect(ready.status).toBe("ready");
    expect(ready.voiceId).toBe("voice_abc123");
  });

  it("rejects a status outside the enum and an empty update", async () => {
    const user = await createUserWithWallet(100);
    const p = await vp.createProfile(user.id, { name: "N" });
    await expect(vp.updateStatus(user.id, p.id, "hacked")).rejects.toMatchObject({ status: 400 });
    await expect(vp.updateProfile(user.id, p.id, {})).rejects.toMatchObject({ status: 400 });
    await expect(vp.createProfile(user.id, { name: "   " })).rejects.toMatchObject({ status: 400 });
  });

  it("listProfiles({ status: 'ready' }) is exactly what the pickers see", async () => {
    const user = await createUserWithWallet(100);
    const a = await vp.createProfile(user.id, { name: "Ready one" });
    await vp.updateProfile(user.id, a.id, { status: "ready", voiceId: "v-1" });
    await vp.createProfile(user.id, { name: "Still pending" });
    const failed = await vp.createProfile(user.id, { name: "Failed one" });
    await vp.updateStatus(user.id, failed.id, "failed");

    const ready = await vp.listProfiles(user.id, { status: "ready" });
    expect(ready.map((p) => p.name)).toEqual(["Ready one"]);

    const all = await vp.listProfiles(user.id);
    expect(all).toHaveLength(3);
  });

  it("deleting removes the row; the user row cascade-deletes profiles", async () => {
    const user = await createUserWithWallet(100);
    const p = await vp.createProfile(user.id, { name: "Doomed" });
    await vp.deleteProfile(user.id, p.id);
    await expect(vp.getProfile(user.id, p.id)).rejects.toMatchObject({ status: 404 });

    const p2 = await vp.createProfile(user.id, { name: "Cascades" });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.voiceProfile.findUnique({ where: { id: p2.id } })).toBeNull();
  });
});
