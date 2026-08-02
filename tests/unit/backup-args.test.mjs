import { describe, it, expect } from "vitest";
import { buildBackupPath, prunableFiles, pgEnvFromUrl } from "../../scripts/backup-db.mjs";
import { assertRestoreTargetAllowed } from "../../scripts/restore-db.mjs";

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

describe("assertRestoreTargetAllowed", () => {
  const prodUrl = "postgresql://user:pass@prod-db.example.com:5432/prod";

  it("throws when --target is missing", () => {
    expect(() => assertRestoreTargetAllowed(undefined, { yes: true, productionUrl: prodUrl })).toThrow(
      /--target is required/
    );
  });

  it("throws when --yes is missing, even for an otherwise-safe host", () => {
    expect(() =>
      assertRestoreTargetAllowed("postgresql://postgres:test@localhost:55432/test", {
        yes: false,
        productionUrl: prodUrl,
      })
    ).toThrow(/--yes/);
  });

  it("throws for a target hostname matching the production host", () => {
    expect(() =>
      assertRestoreTargetAllowed("postgresql://user:pass@prod-db.example.com:5432/test_copy", {
        yes: true,
        productionUrl: prodUrl,
      })
    ).toThrow(/production/i);
  });

  it("is case-insensitive when comparing hostnames", () => {
    expect(() =>
      assertRestoreTargetAllowed("postgresql://user:pass@PROD-DB.EXAMPLE.COM:5432/x", {
        yes: true,
        productionUrl: prodUrl,
      })
    ).toThrow(/production/i);
  });

  it("allows a non-production host with --yes", () => {
    expect(() =>
      assertRestoreTargetAllowed("postgresql://postgres:test@localhost:55432/test", {
        yes: true,
        productionUrl: prodUrl,
      })
    ).not.toThrow();
  });

  it("--allow-production bypasses the host check, but --yes is still required", () => {
    expect(() =>
      assertRestoreTargetAllowed(prodUrl, { yes: true, allowProduction: true, productionUrl: prodUrl })
    ).not.toThrow();
    expect(() =>
      assertRestoreTargetAllowed(prodUrl, { yes: false, allowProduction: true, productionUrl: prodUrl })
    ).toThrow(/--yes/);
  });

  it("throws a clear error for a malformed --target URL rather than an unrelated TypeError", () => {
    expect(() =>
      assertRestoreTargetAllowed("not-a-url", { yes: true, productionUrl: prodUrl })
    ).toThrow(/not a valid Postgres connection URL/);
  });

  it("skips the production check entirely when no productionUrl is configured", () => {
    expect(() =>
      assertRestoreTargetAllowed(prodUrl, { yes: true, productionUrl: undefined })
    ).not.toThrow();
  });
});
