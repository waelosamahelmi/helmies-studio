import { describe, it, expect, vi, beforeEach } from "vitest";

// admin/users PATCH must route credit changes through the wallet ledger
// (adjustWalletTo) instead of writing prisma.user.update({ data: { credits } }).
// Role-only updates still go through prisma.user.update directly.
//
// Role and credit changes must commit atomically: both writes happen inside
// one prisma.$transaction, with adjustWalletTo composed onto the same tx
// client. If adjustWalletTo throws (e.g. a CAS miss on a contested wallet),
// the whole transaction rolls back — a role change must never survive an
// aborted credit adjustment — and the audit log must not record anything
// for a request that didn't actually change anything.

vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({
  adjustWalletTo: vi.fn(),
}));

// A distinct object from the top-level `prisma` client so tests can prove
// mutations happen on the tx client passed into $transaction's callback,
// not on the outer (non-transactional) client.
const txClient = { user: { update: vi.fn() } };

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { update: vi.fn() },
    $transaction: vi.fn(async (fn) => fn(txClient)),
  },
}));

import prisma from "@/lib/prisma";
import { adjustWalletTo } from "@/lib/wallet";
import { logAudit } from "@/lib/security";
import { PATCH } from "@/app/api/admin/users/route.js";

const jsonReq = (body) =>
  new Request("http://test/api/admin/users", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  adjustWalletTo.mockResolvedValue({ wallet: { available: 250 }, delta: 100 });
  prisma.user.update.mockResolvedValue({});
  txClient.user.update.mockResolvedValue({});
  prisma.$transaction.mockImplementation(async (fn) => fn(txClient));
});

describe("PATCH /api/admin/users — credit adjustments via wallet ledger", () => {
  it("adjusts the wallet through adjustWalletTo inside the transaction, not prisma.user.update", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", credits: 250 }));
    expect(res.status).toBe(200);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(adjustWalletTo).toHaveBeenCalledTimes(1);
    const [userId, target, description, adminId, tx] = adjustWalletTo.mock.calls[0];
    expect(userId).toBe("u1");
    expect(target).toBe(250);
    expect(description).toEqual(expect.stringContaining("Admin"));
    expect(adminId).toBe("admin1");
    expect(tx).toBe(txClient); // composed onto the same tx, per Task 1's db param

    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("still updates role via the tx client when only role changes", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", role: "admin" }));
    expect(res.status).toBe(200);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "admin" } });
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(adjustWalletTo).not.toHaveBeenCalled();
  });

  it("handles both role and credits atomically in one transaction", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", credits: 250, role: "admin" }));
    expect(res.status).toBe(200);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(txClient.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { role: "admin" } });
    expect(adjustWalletTo).toHaveBeenCalledWith("u1", 250, expect.stringContaining("Admin"), "admin1", txClient);
  });

  it("still rejects negative credits with 400 and never opens a transaction", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", credits: -5 }));
    expect(res.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(adjustWalletTo).not.toHaveBeenCalled();
  });

  it("still logs the audit entry with credits, role, and adminId after a successful transaction", async () => {
    await PATCH(jsonReq({ userId: "u1", credits: 250, role: "admin" }));
    expect(logAudit).toHaveBeenCalledWith(
      "admin_edit_user",
      "user",
      "u1",
      { credits: 250, role: "admin", adminId: "admin1" },
      expect.anything()
    );
  });

  it("rolls back atomically and audits nothing when adjustWalletTo rejects on a CAS miss", async () => {
    adjustWalletTo.mockRejectedValueOnce(new Error("Wallet changed concurrently — retry the adjustment"));

    const res = await PATCH(jsonReq({ userId: "u1", credits: 250, role: "admin" }));

    expect(res.status).toBe(500);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // The role write was only ever issued against the tx client inside the
    // single $transaction call whose callback subsequently threw — real
    // Prisma rolls that write back, so it never survives outside the failed
    // transaction. Proven here by: (a) it went through tx, not the top-level
    // client, and (b) the request never reaches the audit log.
    expect(txClient.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });
});
