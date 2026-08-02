import { describe, it, expect, afterEach } from "vitest";
import { buildBackupPath, prunableFiles, pgEnvFromUrl } from "../../scripts/backup-db.mjs";
import { assertRestoreTargetAllowed, parseLegacyIPv4, resolveHostIps } from "../../scripts/restore-db.mjs";

// scripts/backup-db.mjs / scripts/restore-db.mjs — pure argument/guard logic
// only, so this suite needs no database. The real rehearsed backup+restore
// (seed -> dump -> drop/recreate -> restore -> prove the rows came back) is
// documented with exact commands and before/after row counts in
// docs/runbook-backup.md, not re-run here.

describe("buildBackupPath — deterministic for a fixed clock", () => {
  it("formats helmies-studio-<ISO-date>-<HHMM>.dump in UTC", () => {
    const now = new Date("2026-08-02T14:30:07.123Z");
    const result = buildBackupPath(now, "/backups");
    expect(result.endsWith("helmies-studio-2026-08-02-1430.dump")).toBe(true);
    expect(result).toContain("backups");
  });

  it("uses ISO slicing so single-digit hour/minute never lose their leading zero", () => {
    const now = new Date("2026-01-05T03:05:00.000Z");
    const result = buildBackupPath(now, "/backups");
    expect(result.endsWith("helmies-studio-2026-01-05-0305.dump")).toBe(true);
  });

  it("is identical for two calls at the exact same instant, differing only by dir", () => {
    const now = new Date("2026-08-02T14:30:07.123Z");
    const a = buildBackupPath(now, "/a");
    const b = buildBackupPath(now, "/b");
    expect(a.endsWith("helmies-studio-2026-08-02-1430.dump")).toBe(true);
    expect(b.endsWith("helmies-studio-2026-08-02-1430.dump")).toBe(true);
  });
});

describe("prunableFiles — retention window, never the newest", () => {
  const now = new Date("2026-08-02T00:00:00.000Z");
  const days = (n) => n * 24 * 60 * 60 * 1000;

  it("selects only files strictly older than the retention window", () => {
    const oldFile = { name: "old.dump", mtime: new Date(now.getTime() - days(20)) };
    const recentFile = { name: "recent.dump", mtime: new Date(now.getTime() - days(5)) };
    expect(prunableFiles([oldFile, recentFile], now, 14)).toEqual([oldFile]);
  });

  it("never prunes the single newest file, even if it is itself older than retention", () => {
    const onlyFile = { name: "only.dump", mtime: new Date(now.getTime() - days(30)) };
    expect(prunableFiles([onlyFile], now, 14)).toEqual([]);
  });

  it("with several old files, prunes all but the newest", () => {
    const files = [
      { name: "a.dump", mtime: new Date(now.getTime() - days(30)) },
      { name: "b.dump", mtime: new Date(now.getTime() - days(20)) }, // newest of the three
      { name: "c.dump", mtime: new Date(now.getTime() - days(25)) },
    ];
    const pruned = prunableFiles(files, now, 14)
      .map((f) => f.name)
      .sort();
    expect(pruned).toEqual(["a.dump", "c.dump"]);
  });

  it("returns [] for an empty file list", () => {
    expect(prunableFiles([], now, 14)).toEqual([]);
  });

  it("does not prune a file exactly at the retention boundary (strictly-older only)", () => {
    const boundaryFile = { name: "boundary.dump", mtime: new Date(now.getTime() - days(14)) };
    const newerFile = { name: "newer.dump", mtime: new Date(now.getTime() - days(1)) };
    expect(prunableFiles([boundaryFile, newerFile], now, 14)).toEqual([]);
  });

  it("accepts epoch-ms mtimes as well as Date objects", () => {
    const oldFile = { name: "old.dump", mtime: now.getTime() - days(20) };
    const newFile = { name: "new.dump", mtime: now.getTime() - days(1) };
    expect(prunableFiles([oldFile, newFile], now, 14)).toEqual([oldFile]);
  });
});

describe("pgEnvFromUrl — parses a postgres URL into libpq PG* env vars, never argv", () => {
  it("extracts host/port/user/database, and password when present", () => {
    expect(pgEnvFromUrl("postgresql://postgres:test@localhost:55432/test")).toEqual({
      PGHOST: "localhost",
      PGPORT: "55432",
      PGUSER: "postgres",
      PGDATABASE: "test",
      PGPASSWORD: "test",
    });
  });

  it("defaults PGPORT to 5432 and omits PGPASSWORD when the URL has none", () => {
    expect(pgEnvFromUrl("postgresql://postgres@db.internal/prod")).toEqual({
      PGHOST: "db.internal",
      PGPORT: "5432",
      PGUSER: "postgres",
      PGDATABASE: "prod",
    });
  });
});

// ── parseLegacyIPv4 — the manual BSD inet_aton-style normalizer ────────────
// dns.lookup does NOT resolve these forms on every platform (empirically
// confirmed to ENOTFOUND all three of "127.1"/"2130706433"/"0177.0.0.1" on
// this dev machine's resolver) — this parser is what actually catches them.
describe("parseLegacyIPv4", () => {
  it("normalizes the 2-part shorthand ('127.1' -> 127.0.0.1)", () => {
    expect(parseLegacyIPv4("127.1")).toBe("127.0.0.1");
  });

  it("normalizes a single 32-bit decimal integer (2130706433 -> 127.0.0.1)", () => {
    expect(parseLegacyIPv4("2130706433")).toBe("127.0.0.1");
  });

  it("normalizes a zero-padded octal octet ('0177.0.0.1' -> 127.0.0.1)", () => {
    expect(parseLegacyIPv4("0177.0.0.1")).toBe("127.0.0.1");
  });

  it("normalizes a hex octet ('0x7f.0.0.1' -> 127.0.0.1)", () => {
    expect(parseLegacyIPv4("0x7f.0.0.1")).toBe("127.0.0.1");
  });

  it("normalizes the 3-part shorthand ('127.0.1' -> 127.0.0.1)", () => {
    expect(parseLegacyIPv4("127.0.1")).toBe("127.0.0.1");
  });

  it("passes canonical dotted-quad through unchanged", () => {
    expect(parseLegacyIPv4("127.0.0.1")).toBe("127.0.0.1");
    expect(parseLegacyIPv4("10.0.0.5")).toBe("10.0.0.5");
  });

  it("returns null for an ordinary hostname (never misclassifies a real DNS name)", () => {
    expect(parseLegacyIPv4("prod-db.example.com")).toBeNull();
    expect(parseLegacyIPv4("localhost")).toBeNull();
  });

  it("returns null for an out-of-range octet or too many parts", () => {
    expect(parseLegacyIPv4("256.0.0.1")).toBeNull();
    expect(parseLegacyIPv4("1.2.3.4.5")).toBeNull();
  });
});

describe("resolveHostIps", () => {
  it("resolves 'localhost' to include 127.0.0.1 via DNS", async () => {
    const ips = await resolveHostIps("localhost");
    expect(ips.has("127.0.0.1")).toBe(true);
  });

  it("resolves a legacy-form literal via the manual parser even though DNS itself can't", async () => {
    const ips = await resolveHostIps("127.1");
    expect(ips.has("127.0.0.1")).toBe(true);
  });

  it("returns an empty set for a non-existent hostname, without throwing", async () => {
    const ips = await resolveHostIps("this-host-should-not-exist.invalid.test");
    expect(ips.size).toBe(0);
  });
});

describe("assertRestoreTargetAllowed", () => {
  const prodUrl = "postgresql://user:pass@prod-db.example.com:5432/prod";

  it("throws when --target is missing", async () => {
    await expect(assertRestoreTargetAllowed(undefined, { yes: true, productionUrl: prodUrl })).rejects.toThrow(
      /--target is required/
    );
  });

  it("throws when --yes is missing, even for an otherwise-safe host", async () => {
    await expect(
      assertRestoreTargetAllowed("postgresql://postgres:test@some-other-host.example.com:55432/test", {
        yes: false,
        productionUrl: prodUrl,
      })
    ).rejects.toThrow(/--yes/);
  });

  it("throws for a target matching the production host, port, AND database", async () => {
    await expect(
      assertRestoreTargetAllowed("postgresql://user:pass@prod-db.example.com:5432/prod", {
        yes: true,
        productionUrl: prodUrl,
      })
    ).rejects.toThrow(/production/i);
  });

  it("is case-insensitive when comparing hostnames", async () => {
    await expect(
      assertRestoreTargetAllowed("postgresql://user:pass@PROD-DB.EXAMPLE.COM:5432/prod", {
        yes: true,
        productionUrl: prodUrl,
      })
    ).rejects.toThrow(/production/i);
  });

  it("allows a genuinely different host with --yes", async () => {
    await expect(
      assertRestoreTargetAllowed("postgresql://postgres:test@some-other-host.example.com:55432/test", {
        yes: true,
        productionUrl: prodUrl,
      })
    ).resolves.not.toThrow();
  });

  it("--allow-production bypasses the host check, but --yes is still required", async () => {
    await expect(
      assertRestoreTargetAllowed(prodUrl, { yes: true, allowProduction: true, productionUrl: prodUrl })
    ).resolves.not.toThrow();
    await expect(
      assertRestoreTargetAllowed(prodUrl, { yes: false, allowProduction: true, productionUrl: prodUrl })
    ).rejects.toThrow(/--yes/);
  });

  it("throws a clear error for a malformed --target URL rather than an unrelated TypeError", async () => {
    await expect(assertRestoreTargetAllowed("not-a-url", { yes: true, productionUrl: prodUrl })).rejects.toThrow(
      /not a valid Postgres connection URL/
    );
  });

  // CRITICAL 1 (executed-proof review finding) — same host, same database,
  // reached via a DIFFERENT string. A bare hostname-string compare
  // (targetHost === prodHost) misses every one of these; the guard now
  // resolves both sides to IP sets (plus a manual legacy-IPv4 parse, since
  // DNS alone doesn't normalize these forms on every platform) and compares
  // those too.
  describe("same-server bypass forms — all must be refused without --allow-production", () => {
    const prod = "postgresql://user:pass@localhost:5432/prod";

    it("127.0.0.1 vs localhost — the exact scenario an executed review proved bypassed the old string-only guard", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@127.0.0.1:5432/prod", { yes: true, productionUrl: prod })
      ).rejects.toThrow(/production/i);
    });

    it("127.1 (2-part shorthand)", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@127.1:5432/prod", { yes: true, productionUrl: prod })
      ).rejects.toThrow(/production/i);
    });

    it("2130706433 (32-bit decimal integer)", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@2130706433:5432/prod", { yes: true, productionUrl: prod })
      ).rejects.toThrow(/production/i);
    });

    it("0177.0.0.1 (zero-padded octal octet)", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@0177.0.0.1:5432/prod", { yes: true, productionUrl: prod })
      ).rejects.toThrow(/production/i);
    });

    it("a trailing-dot FQDN ('localhost.' vs 'localhost')", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@localhost.:5432/prod", { yes: true, productionUrl: prod })
      ).rejects.toThrow(/production/i);
    });

    it("still requires --allow-production to actually proceed with a bypass-form target", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@127.1:5432/prod", {
          yes: true,
          allowProduction: true,
          productionUrl: prod,
        })
      ).resolves.not.toThrow();
    });
  });

  // A same-host match must NOT block when the DATABASE NAME differs — a
  // same-host scratch restore is a legitimate, common pattern and must not
  // force operators into routinely reaching for --allow-production.
  it("allows a same-host target when the database name differs (same-host scratch restore)", async () => {
    await expect(
      assertRestoreTargetAllowed("postgresql://user:pass@127.0.0.1:5432/scratch_test", {
        yes: true,
        productionUrl: "postgresql://user:pass@localhost:5432/prod",
      })
    ).resolves.not.toThrow();
  });

  // A same-host, same-database match on a DIFFERENT port is a different
  // Postgres instance (e.g. a local test container mapped to a non-default
  // host port) and must not be blocked either.
  it("allows a same-host, same-database target when the port differs", async () => {
    await expect(
      assertRestoreTargetAllowed("postgresql://user:pass@localhost:55432/prod", {
        yes: true,
        productionUrl: "postgresql://user:pass@localhost:5432/prod",
      })
    ).resolves.not.toThrow();
  });

  // CRITICAL 3 (executed-proof review finding) — FAIL CLOSED. Every one of
  // these previously fell through to "prodHost is null/falsy -> skip the
  // check -> allow" — exactly backwards for a safety interlock on a
  // destructive operation.
  describe("fails closed when production's identity cannot be established", () => {
    const ORIGINAL_DATABASE_URL = process.env.DATABASE_URL;
    afterEach(() => {
      if (ORIGINAL_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = ORIGINAL_DATABASE_URL;
    });

    it("refuses when productionUrl is undefined (e.g. .env not loaded — CRITICAL 2) and process.env.DATABASE_URL is also unset", async () => {
      // productionUrl defaults to process.env.DATABASE_URL — this test
      // simulates the real CRITICAL-2 scenario (the env var itself is
      // unset) rather than relying on ambient test-process state, since
      // restore-db.mjs's own module-load-time dotenv call may have already
      // populated process.env.DATABASE_URL from this repo's real .env by
      // the time this test file runs.
      delete process.env.DATABASE_URL;
      await expect(
        assertRestoreTargetAllowed("postgresql://postgres:test@localhost:55432/test", { yes: true })
      ).rejects.toThrow(/DATABASE_URL is not set/);
    });

    it("refuses when productionUrl is an empty string", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://postgres:test@localhost:55432/test", {
          yes: true,
          productionUrl: "",
        })
      ).rejects.toThrow(/DATABASE_URL is not set/);
    });

    it("refuses when productionUrl is whitespace-only", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://postgres:test@localhost:55432/test", {
          yes: true,
          productionUrl: "   ",
        })
      ).rejects.toThrow(/DATABASE_URL is not set/);
    });

    it("refuses when productionUrl is unparseable", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://postgres:test@localhost:55432/test", {
          yes: true,
          productionUrl: "not-a-url-at-all",
        })
      ).rejects.toThrow(/DATABASE_URL could not be parsed/);
    });

    it("--allow-production still bypasses even when production's identity is unknown", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://postgres:test@localhost:55432/test", {
          yes: true,
          allowProduction: true,
          productionUrl: undefined,
        })
      ).resolves.not.toThrow();
    });
  });

  // Cases that must keep passing (no regression from the tightened guard).
  describe("no false positives", () => {
    it("a hostname that merely CONTAINS the production host as a substring is not the same host", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@prod-db.example.com.evil.test:5432/prod", {
          yes: true,
          productionUrl: prodUrl,
        })
      ).resolves.not.toThrow();
    });

    it("credentials containing the literal string 'localhost' never affect the host comparison", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://localhost:localhost@some-other-host.example.com:5432/prod", {
          yes: true,
          productionUrl: "postgresql://real-prod-host.example.com:5432/prod",
        })
      ).resolves.not.toThrow();
    });

    it("the production host as a prefix of a longer, different hostname is not the same host", async () => {
      await expect(
        assertRestoreTargetAllowed("postgresql://user:pass@prod-db.example.com.test:5432/prod", {
          yes: true,
          productionUrl: prodUrl,
        })
      ).resolves.not.toThrow();
    });
  });
});
