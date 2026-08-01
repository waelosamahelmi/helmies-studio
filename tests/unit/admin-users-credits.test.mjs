import { describe, it, expect, vi, beforeEach } from "vitest";

// admin/users PATCH must route credit changes through the wallet ledger
// (adjustWalletTo) instead of writing prisma.user.update({ data: { credits } }).
// Role-only updates still go through prisma.user.update directly.

vi.mock("@/lib/security", () => ({
  requireAdmin: vi.fn().mockResolvedValue({ id: "admin1" }),
  logAudit: vi.fn(),
}));

vi.mock("@/lib/wallet", () => ({
  adjustWalletTo: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { user: { update: vi.fn() } },
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
});

describe("PATCH /api/admin/users — credit adjustments via wallet ledger", () => {
  it("adjusts the wallet through adjustWalletTo, not prisma.user.update, for credit changes", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", credits: 250 }));
    expect(res.status).toBe(200);

    expect(adjustWalletTo).toHaveBeenCalledTimes(1);
    const [userId, target, description, adminId] = adjustWalletTo.mock.calls[0];
    expect(userId).toBe("u1");
    expect(target).toBe(250);
    expect(description).toEqual(expect.stringContaining("Admin"));
    expect(adminId).toBe("admin1");

    for (const call of prisma.user.update.mock.calls) {
      expect(call[0].data).not.toHaveProperty("credits");
    }
  });

  it("still updates role via prisma.user.update when only role changes", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", role: "admin" }));
    expect(res.status).toBe(200);

    expect(adjustWalletTo).not.toHaveBeenCalled();
    expect(prisma.user.update).toHaveBeenCalledTimes(1);
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "admin" },
    });
  });

  it("handles both role and credits in a single request", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", credits: 250, role: "admin" }));
    expect(res.status).toBe(200);

    expect(adjustWalletTo).toHaveBeenCalledWith("u1", 250, expect.stringContaining("Admin"), "admin1");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { role: "admin" },
    });
  });

  it("still rejects negative credits with 400 and never calls adjustWalletTo", async () => {
    const res = await PATCH(jsonReq({ userId: "u1", credits: -5 }));
    expect(res.status).toBe(400);
    expect(adjustWalletTo).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("still logs the audit entry with credits, role, and adminId", async () => {
    await PATCH(jsonReq({ userId: "u1", credits: 250, role: "admin" }));
    expect(logAudit).toHaveBeenCalledWith(
      "admin_edit_user",
      "user",
      "u1",
      { credits: 250, role: "admin", adminId: "admin1" },
      expect.anything()
    );
  });
});
