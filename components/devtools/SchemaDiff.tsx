"use client";

import { useState, useEffect } from "react";
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Clock, Info } from "lucide-react";
import type { ParsedSchema, PrismaField, PrismaModel } from "@/app/api/devtools/schema-diff/route";

// ── Prototype type definitions (sourced from /tmp/prototype-ref/src/app/types/index.ts) ──
// Keep in sync when Hannah pushes updates to the prototype repo.

interface ProtoField {
  name: string;
  type: string;
  isOptional: boolean;
  isFuture: boolean; // commented-out in prototype, planned for later
  note?: string;
}

interface ProtoModel {
  name: string;
  fields: ProtoField[];
}

const PROTOTYPE_MODELS: ProtoModel[] = [
  {
    name: "Project",
    fields: [
      { name: "id",                 type: "string",        isOptional: false, isFuture: false },
      { name: "projectName",        type: "string",        isOptional: false, isFuture: false },
      { name: "siteLocation",       type: "string",        isOptional: false, isFuture: false },
      { name: "status",             type: "ProjectStatus", isOptional: false, isFuture: false, note: "Union: 'Active'|'Completed'|'Planning'|'On Hold'" },
      { name: "startDate",          type: "string (ISO)",  isOptional: false, isFuture: false, note: "ISO date string YYYY-MM-DD" },
      { name: "salesforceId",       type: "string",        isOptional: false, isFuture: false },
      { name: "installManagerId",   type: "string",        isOptional: false, isFuture: false },
      { name: "projectManagerId",   type: "string",        isOptional: false, isFuture: false },
      { name: "installManagerName", type: "string",        isOptional: false, isFuture: false, note: "Denormalized display name" },
      { name: "projectManagerName", type: "string",        isOptional: false, isFuture: false, note: "Denormalized display name" },
      // Future fields (commented-out in prototype)
      { name: "completionDate",     type: "string (ISO)",  isOptional: true,  isFuture: true,  note: "Only for completed projects" },
      { name: "estimatedEndDate",   type: "string (ISO)",  isOptional: true,  isFuture: true },
      { name: "budget",             type: "number",        isOptional: true,  isFuture: true },
      { name: "unitCount",          type: "number",        isOptional: true,  isFuture: true },
      { name: "streetAddress",      type: "string",        isOptional: true,  isFuture: true },
      { name: "city",               type: "string",        isOptional: true,  isFuture: true },
      { name: "state",              type: "string",        isOptional: true,  isFuture: true },
      { name: "zipCode",            type: "string",        isOptional: true,  isFuture: true },
      { name: "clientName",         type: "string",        isOptional: true,  isFuture: true },
      { name: "notes",              type: "string",        isOptional: true,  isFuture: true },
      { name: "createdAt",          type: "string (ISO)",  isOptional: true,  isFuture: true },
      { name: "updatedAt",          type: "string (ISO)",  isOptional: true,  isFuture: true },
    ],
  },
];

// ── Diff logic ────────────────────────────────────────────────────────────────

type DiffStatus =
  | "match"       // Field exists in both, types are compatible
  | "type-diff"   // Field exists in both but types differ
  | "db-only"     // Field in our DB but not in prototype (production addition)
  | "proto-only"  // Field in prototype but missing from our DB
  | "future";     // Future field in prototype (not yet implemented anywhere)

interface FieldDiff {
  name: string;
  status: DiffStatus;
  protoType?: string;
  dbType?: string;
  protoNote?: string;
  dbNote?: string;
}

interface ModelDiff {
  modelName: string;
  fields: FieldDiff[];
  summary: { match: number; typeDiff: number; dbOnly: number; protoOnly: number; future: number };
}

// Rough type compatibility mapping between TS prototype types and Prisma scalar types
function typesCompatible(protoType: string, dbType: string): boolean {
  const p = protoType.toLowerCase();
  const d = dbType.toLowerCase();

  if (p === d) return true;
  if ((p.includes("string") || p === "projectstatus") && d === "string") return true;
  if (p === "number" && (d === "int" || d === "float" || d === "decimal" || d === "bigint")) return true;
  if (p === "boolean" && d === "boolean") return true;

  // date strings vs DateTime — intentional mismatch (prototype uses string, DB uses DateTime)
  return false;
}

function computeDiff(proto: ProtoModel, dbModel: PrismaModel | undefined): ModelDiff {
  const fields: FieldDiff[] = [];

  if (!dbModel) {
    // Entire model missing from DB
    for (const pf of proto.fields.filter((f) => !f.isFuture)) {
      fields.push({ name: pf.name, status: "proto-only", protoType: pf.type, protoNote: pf.note });
    }
    for (const pf of proto.fields.filter((f) => f.isFuture)) {
      fields.push({ name: pf.name, status: "future", protoType: pf.type, protoNote: pf.note });
    }
  } else {
    const dbFieldMap = new Map<string, PrismaField>(dbModel.fields.map((f) => [f.name, f]));
    const accountedDbFields = new Set<string>();

    for (const pf of proto.fields) {
      if (pf.isFuture) {
        const dbField = dbFieldMap.get(pf.name);
        if (dbField) {
          // Future field already implemented in DB
          fields.push({
            name: pf.name,
            status: typesCompatible(pf.type, dbField.type) ? "match" : "type-diff",
            protoType: pf.type,
            dbType: dbField.type + (dbField.isOptional ? "?" : ""),
            protoNote: "Future field — implemented ahead in DB",
            dbNote: pf.note,
          });
          accountedDbFields.add(pf.name);
        } else {
          fields.push({ name: pf.name, status: "future", protoType: pf.type, protoNote: pf.note });
        }
        continue;
      }

      const dbField = dbFieldMap.get(pf.name);
      if (!dbField) {
        fields.push({ name: pf.name, status: "proto-only", protoType: pf.type, protoNote: pf.note });
      } else {
        accountedDbFields.add(pf.name);
        const compat = typesCompatible(pf.type, dbField.type);
        fields.push({
          name: pf.name,
          status: compat ? "match" : "type-diff",
          protoType: pf.type,
          dbType: dbField.type + (dbField.isOptional ? "?" : ""),
          protoNote: pf.note,
        });
      }
    }

    // Fields in DB not accounted for by the prototype
    for (const dbField of dbModel.fields) {
      if (!accountedDbFields.has(dbField.name) && !dbField.isRelation) {
        fields.push({
          name: dbField.name,
          status: "db-only",
          dbType: dbField.type + (dbField.isOptional ? "?" : ""),
          dbNote: "Production addition — not in prototype",
        });
      }
    }
  }

  const summary = {
    match:    fields.filter((f) => f.status === "match").length,
    typeDiff: fields.filter((f) => f.status === "type-diff").length,
    dbOnly:   fields.filter((f) => f.status === "db-only").length,
    protoOnly:fields.filter((f) => f.status === "proto-only").length,
    future:   fields.filter((f) => f.status === "future").length,
  };

  return { modelName: proto.name, fields, summary };
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SchemaDiff() {
  const [schema, setSchema] = useState<ParsedSchema | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSchema = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/devtools/schema-diff", { credentials: "include" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setSchema(data as ParsedSchema);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSchema(); }, []);

  const diffs: ModelDiff[] = schema
    ? PROTOTYPE_MODELS.map((proto) => {
        const dbModel = schema.models.find((m) => m.name === proto.name);
        return computeDiff(proto, dbModel);
      })
    : [];

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-1 overflow-auto" style={{ padding: "var(--space-6)" }}>

        {/* ── Header row ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 style={{ fontSize: "var(--text-heading)", fontWeight: "var(--font-weight-semibold)", color: "var(--neutral-900)" }}>
              Schema Diff
            </h3>
            <p style={{ fontSize: "var(--text-body)", color: "var(--neutral-500)", marginTop: "2px" }}>
              Prototype TypeScript types vs. our Prisma DB schema
            </p>
          </div>
          <button
            onClick={fetchSchema}
            disabled={loading}
            className="flex items-center gap-2 transition-colors duration-150"
            style={{
              padding: "0 var(--space-4)",
              height: "var(--button-height)",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--neutral-0)",
              border: "1px solid var(--neutral-300)",
              color: "var(--neutral-700)",
              fontSize: "var(--text-body)",
              fontWeight: "var(--font-weight-medium)",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* ── Legend ── */}
        <div
          className="flex flex-wrap gap-4 mb-6"
          style={{
            padding: "var(--space-3) var(--space-4)",
            backgroundColor: "var(--neutral-0)",
            border: "1px solid var(--neutral-300)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <LegendItem icon={<CheckCircle2 size={14} />} color="var(--success-600)" bg="var(--success-100)" label="Match" />
          <LegendItem icon={<AlertTriangle size={14} />} color="var(--warning-600)" bg="var(--warning-100)" label="Type difference" />
          <LegendItem icon={<XCircle size={14} />}       color="var(--error-600)"   bg="var(--error-100)"   label="Missing from DB" />
          <LegendItem icon={<Info size={14} />}          color="var(--primary-500)" bg="var(--primary-100)" label="DB only (production addition)" />
          <LegendItem icon={<Clock size={14} />}         color="var(--neutral-500)" bg="var(--neutral-100)" label="Future field (prototype roadmap)" />
        </div>

        {/* ── Error state ── */}
        {error && (
          <div
            style={{
              padding: "var(--space-4)",
              backgroundColor: "var(--error-100)",
              border: "1px solid var(--error-600)",
              borderRadius: "var(--radius-md)",
              color: "var(--error-600)",
              fontSize: "var(--text-body)",
              marginBottom: "var(--space-4)",
            }}
          >
            Failed to load schema: {error}
          </div>
        )}

        {/* ── Loading skeleton ── */}
        {loading && (
          <div className="flex flex-col gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                style={{
                  height: "48px",
                  backgroundColor: "var(--neutral-100)",
                  borderRadius: "var(--radius-sm)",
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        )}

        {/* ── Diff results ── */}
        {!loading && schema && diffs.map((diff) => (
          <ModelDiffCard key={diff.modelName} diff={diff} schema={schema} />
        ))}

        {/* ── DB-only models (in our schema but not tracked in prototype) ── */}
        {!loading && schema && (
          <DbOnlyModels schema={schema} trackedModels={PROTOTYPE_MODELS.map((m) => m.name)} />
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function LegendItem({ icon, color, bg, label }: { icon: React.ReactNode; color: string; bg: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span style={{ color, backgroundColor: bg, padding: "2px 6px", borderRadius: "4px", display: "flex", alignItems: "center" }}>
        {icon}
      </span>
      <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-700)" }}>{label}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: DiffStatus }) {
  const config: Record<DiffStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
    match:      { icon: <CheckCircle2 size={12} />, color: "var(--success-600)", bg: "var(--success-100)", label: "Match" },
    "type-diff":{ icon: <AlertTriangle size={12} />, color: "var(--warning-600)", bg: "var(--warning-100)", label: "Type diff" },
    "proto-only":{ icon: <XCircle size={12} />,     color: "var(--error-600)",   bg: "var(--error-100)",   label: "Missing from DB" },
    "db-only":  { icon: <Info size={12} />,         color: "var(--primary-500)", bg: "var(--primary-100)", label: "DB only" },
    future:     { icon: <Clock size={12} />,         color: "var(--neutral-500)", bg: "var(--neutral-100)", label: "Future" },
  };
  const c = config[status];
  return (
    <span
      className="flex items-center gap-1"
      style={{
        padding: "2px 8px",
        borderRadius: "99px",
        backgroundColor: c.bg,
        color: c.color,
        fontSize: "var(--text-caption)",
        fontWeight: "var(--font-weight-medium)",
        whiteSpace: "nowrap",
      }}
    >
      {c.icon}
      {c.label}
    </span>
  );
}

function ModelDiffCard({ diff, schema }: { diff: ModelDiff; schema: ParsedSchema }) {
  const [expanded, setExpanded] = useState(true);
  const totalIssues = diff.summary.typeDiff + diff.summary.protoOnly;
  const hasIssues = totalIssues > 0;

  // Find enum info for the model's status field
  const statusField = diff.fields.find((f) => f.name === "status");
  const dbEnum = schema.enums.find((e) =>
    statusField?.dbType?.replace("?", "") === e.name
  );

  return (
    <div
      className="mb-6"
      style={{
        backgroundColor: "var(--neutral-0)",
        border: `1px solid ${hasIssues ? "var(--warning-600)" : "var(--neutral-300)"}`,
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      {/* Model header */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between transition-colors duration-150"
        style={{
          padding: "var(--space-4)",
          backgroundColor: hasIssues ? "var(--warning-100)" : "var(--neutral-100)",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-semibold)", color: "var(--neutral-900)", fontFamily: "monospace" }}>
            {diff.modelName}
          </span>
          <div className="flex items-center gap-2">
            <SummaryPill count={diff.summary.match}    color="var(--success-600)" bg="var(--success-100)" label="match" />
            {diff.summary.typeDiff > 0  && <SummaryPill count={diff.summary.typeDiff}  color="var(--warning-600)" bg="var(--warning-100)" label="type diff" />}
            {diff.summary.protoOnly > 0 && <SummaryPill count={diff.summary.protoOnly} color="var(--error-600)"   bg="var(--error-100)"   label="missing" />}
            {diff.summary.dbOnly > 0    && <SummaryPill count={diff.summary.dbOnly}    color="var(--primary-500)" bg="var(--primary-100)" label="db-only" />}
            {diff.summary.future > 0    && <SummaryPill count={diff.summary.future}    color="var(--neutral-500)" bg="var(--neutral-100)" label="future" />}
          </div>
        </div>
        <span style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)" }}>{expanded ? "▲" : "▼"}</span>
      </button>

      {/* Field table */}
      {expanded && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "var(--text-body)" }}>
            <thead>
              <tr style={{ backgroundColor: "var(--neutral-100)", borderBottom: "1px solid var(--neutral-300)" }}>
                {["Field", "Prototype Type", "DB Type", "Status", "Notes"].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "var(--space-2) var(--space-4)",
                      textAlign: "left",
                      fontSize: "var(--text-caption)",
                      fontWeight: "var(--font-weight-semibold)",
                      color: "var(--neutral-500)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diff.fields.map((field, idx) => (
                <tr
                  key={field.name}
                  style={{
                    borderBottom: idx < diff.fields.length - 1 ? "1px solid var(--neutral-300)" : undefined,
                    backgroundColor: field.status === "future" ? "rgba(0,0,0,0.01)" : undefined,
                    opacity: field.status === "future" ? 0.7 : 1,
                  }}
                >
                  <td style={{ padding: "var(--space-3) var(--space-4)", fontFamily: "monospace", fontWeight: "var(--font-weight-medium)", color: "var(--neutral-900)", whiteSpace: "nowrap" }}>
                    {field.name}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", fontFamily: "monospace", color: "var(--neutral-700)", whiteSpace: "nowrap" }}>
                    {field.protoType ?? <span style={{ color: "var(--neutral-300)" }}>—</span>}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", fontFamily: "monospace", color: "var(--neutral-700)", whiteSpace: "nowrap" }}>
                    {field.dbType ?? <span style={{ color: "var(--neutral-300)" }}>—</span>}
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", whiteSpace: "nowrap" }}>
                    <StatusBadge status={field.status} />
                  </td>
                  <td style={{ padding: "var(--space-3) var(--space-4)", color: "var(--neutral-500)", fontSize: "var(--text-caption)" }}>
                    {field.protoNote ?? field.dbNote ?? ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Enum breakdown for status field */}
          {dbEnum && statusField && (
            <div
              style={{
                margin: "var(--space-3) var(--space-4)",
                padding: "var(--space-3)",
                backgroundColor: "var(--warning-100)",
                border: "1px solid var(--warning-600)",
                borderRadius: "var(--radius-sm)",
                fontSize: "var(--text-caption)",
                color: "var(--warning-600)",
              }}
            >
              <strong>Status enum note:</strong> Prototype uses string union{" "}
              <code>&apos;Active&apos; | &apos;Completed&apos; | &apos;Planning&apos; | &apos;On Hold&apos;</code> — our DB enum{" "}
              <code>{dbEnum.name}</code> uses <code>{dbEnum.values.join(" | ")}</code>.{" "}
              Note: <code>&quot;On Hold&quot;</code> → <code>OnHold</code> (no space). Handle this in the API layer when mapping.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryPill({ count, color, bg, label }: { count: number; color: string; bg: string; label: string }) {
  return (
    <span
      style={{
        padding: "1px 8px",
        borderRadius: "99px",
        backgroundColor: bg,
        color,
        fontSize: "var(--text-caption)",
        fontWeight: "var(--font-weight-medium)",
      }}
    >
      {count} {label}
    </span>
  );
}

function DbOnlyModels({ schema, trackedModels }: { schema: ParsedSchema; trackedModels: string[] }) {
  const untracked = schema.models.filter(
    (m) => !trackedModels.includes(m.name)
  );
  if (untracked.length === 0) return null;

  return (
    <div
      style={{
        backgroundColor: "var(--neutral-0)",
        border: "1px solid var(--neutral-300)",
        borderRadius: "var(--radius-md)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "var(--space-3) var(--space-4)",
          backgroundColor: "var(--primary-100)",
          borderBottom: "1px solid var(--neutral-300)",
        }}
      >
        <h4 style={{ fontSize: "var(--text-subheading)", fontWeight: "var(--font-weight-semibold)", color: "var(--primary-700)" }}>
          Production-Only Models
        </h4>
        <p style={{ fontSize: "var(--text-caption)", color: "var(--primary-500)", marginTop: "2px" }}>
          These models exist in our DB schema but have no equivalent in the Figma Make prototype (auth, infra, etc.)
        </p>
      </div>
      <div style={{ padding: "var(--space-4)", display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
        {untracked.map((m) => (
          <span
            key={m.name}
            style={{
              padding: "4px 12px",
              backgroundColor: "var(--primary-100)",
              color: "var(--primary-700)",
              borderRadius: "99px",
              fontSize: "var(--text-body)",
              fontFamily: "monospace",
              fontWeight: "var(--font-weight-medium)",
            }}
          >
            {m.name} <span style={{ opacity: 0.6, fontSize: "var(--text-caption)" }}>({m.fields.length} fields)</span>
          </span>
        ))}
      </div>
    </div>
  );
}
