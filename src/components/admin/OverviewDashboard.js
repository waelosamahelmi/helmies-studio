"use client";

/* ══════════════════════════════════════════════════════════════════════════
   ADMIN — OVERVIEW
   ──────────────────────────────────────────────────────────────────────────
   One request: /api/admin/analytics. It returns lifetime totals plus two
   30-day rollups (by tool, by model). Nothing here is estimated or padded —
   if the number is not in the payload it is not on the screen.
   ══════════════════════════════════════════════════════════════════════════ */

import {
  Empty, Fault, Panel, Reload, Rows, Stats, Table,
  asArray, eur, num, useResource,
} from "./AdminPanel";
import { IcGrid } from "@/components/studio/kit/Icons";

function Bars({ rows, valueOf, labelOf, format }) {
  const max = Math.max(1, ...rows.map(valueOf));
  return (
    <div className="hs-stack" style={{ gap: "var(--s-3)" }}>
      {rows.map((r) => {
        const v = valueOf(r);
        return (
          <div key={labelOf(r)} className="hs-row" style={{ gap: "var(--s-3)" }}>
            <span style={{ fontSize: "var(--t-tiny)", minWidth: 116, color: "var(--tx-dim)" }}>
              {labelOf(r)}
            </span>
            <span className="hs-progress" style={{ flex: 1 }}>
              <i style={{ width: `${(v / max) * 100}%` }} />
            </span>
            <span className="hs-mono" style={{ fontSize: "var(--t-tiny)", minWidth: 72, textAlign: "right" }}>
              {format(v)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OverviewDashboard() {
  const { data, loading, error, reload } = useResource("/api/admin/analytics");

  const t = data?.totals || {};
  const byTool = asArray(data?.byTool);
  const marginByTool = asArray(data?.marginByTool);
  const modelMargins = asArray(data?.modelMargins);

  const profitTone = (t.profit || 0) >= 0 ? "var(--signal)" : "var(--fault)";

  return (
    <div className="hs-stack" style={{ gap: "var(--s-5)" }}>
      <Fault>{error}</Fault>

      <Panel title="Overview" badge="Lifetime · 30-day rollups" action={<Reload onClick={reload} />}>
        {loading ? <Rows n={2} h={92} /> : (
          <Stats
            items={[
              { label: "Users",          value: num(t.users) },
              { label: "Generations",    value: num(t.generations), sub: `${num(t.completed)} done · ${num(t.failed)} failed` },
              { label: "Success rate",   value: `${t.successRate || 0}%`, tone: parseFloat(t.successRate) >= 90 ? "var(--signal)" : "var(--caution)" },
              { label: "Credits sold",   value: num(t.creditsGranted) },
              { label: "Credits burned", value: num(t.creditsUsed) },
              { label: "Retail value",   value: eur(t.retailValue) },
              { label: "Provider cost",  value: eur(t.providerCost) },
              { label: "Gross margin",   value: eur(t.profit), tone: profitTone, sub: `${t.marginPct || 0}%` },
            ]}
          />
        )}
      </Panel>

      <Panel title="Usage by tool" badge="Last 30 days">
        {loading ? <Rows n={5} h={20} /> : byTool.length === 0 ? (
          <Empty icon={IcGrid} title="No generations in the last 30 days">
            The moment someone renders something, the split by tool lands here.
          </Empty>
        ) : (
          <Bars
            rows={[...byTool].sort((a, b) => (b._count || 0) - (a._count || 0))}
            labelOf={(r) => r.tool}
            valueOf={(r) => r._count || 0}
            format={(v) => num(v)}
          />
        )}
      </Panel>

      <Panel title="Margin by tool" badge="Last 30 days">
        {loading ? <Rows /> : marginByTool.length === 0 ? (
          <Empty icon={IcGrid} title="Nothing to price out yet">
            Revenue and provider cost per tool appear once generations start running.
          </Empty>
        ) : (
          <Table
            caption="Revenue against provider cost, by tool, last 30 days"
            head={[
              "Tool",
              { key: "Gens", num: true },
              { key: "Revenue", num: true },
              { key: "Cost", num: true },
              { key: "Margin", num: true },
              { key: "Margin %", num: true },
            ]}
          >
            {marginByTool.map((r) => (
              <tr key={r.tool}>
                <td style={{ color: "var(--tx)", fontWeight: 500 }}>{r.tool}</td>
                <td className="hs-num">{num(r.generations)}</td>
                <td className="hs-num">{eur(r.revenue)}</td>
                <td className="hs-num">{eur(r.cost)}</td>
                <td className="hs-num" style={{ color: r.margin >= 0 ? "var(--signal)" : "var(--fault)" }}>
                  {eur(r.margin)}
                </td>
                <td className="hs-num">{r.marginPct}%</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>

      <Panel title="Margin by model" badge="Top 20 · last 30 days">
        {loading ? <Rows /> : modelMargins.length === 0 ? (
          <Empty icon={IcGrid} title="No completed generations yet">
            Per-model economics need at least one completed job to compute.
          </Empty>
        ) : (
          <Table
            caption="Revenue against provider cost, by model, last 30 days"
            head={[
              "Model",
              { key: "Gens", num: true },
              { key: "Revenue", num: true },
              { key: "Cost", num: true },
              { key: "Margin", num: true },
              { key: "Margin %", num: true },
            ]}
          >
            {modelMargins.map((m) => (
              <tr key={m.model}>
                <td className="hs-mono" style={{ color: "var(--tx)" }}>{m.model}</td>
                <td className="hs-num">{num(m.generations)}</td>
                <td className="hs-num">{eur(m.revenue)}</td>
                <td className="hs-num">{eur(m.cost)}</td>
                <td className="hs-num" style={{ color: m.margin >= 0 ? "var(--signal)" : "var(--fault)" }}>
                  {eur(m.margin)}
                </td>
                <td className="hs-num">{m.marginPct}%</td>
              </tr>
            ))}
          </Table>
        )}
      </Panel>
    </div>
  );
}
