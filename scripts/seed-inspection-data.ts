/**
 * scripts/seed-inspection-data.ts
 *
 * Seeds realistic inspection data across all local projects. LOCAL DEV ONLY.
 *
 * Rules:
 * - Only seeds on scopes that are Install + Complete (the gate the app enforces).
 * - Primarily seeds Clear Inspections:
 *     70% → 1 attempt, PASS (inspectionStatus → PASSED)
 *     30% → 1–3 attempts, all FAIL (inspectionStatus → FAILED)
 * - ~40% of scopes also get 1 "other" inspection (2 Area Clear or Field Verification).
 * - TemplateSnapshot is stored as a proper FormTemplate so reviews render correctly.
 * - Fully idempotent: re-running skips already-seeded scopes.
 *
 * Usage:
 *   npm run seed:inspections             — create data (idempotent)
 *   npm run seed:inspections:reset       — wipe all seeded data, then re-seed
 */

import "dotenv/config";
import { PrismaClient, FormStatus, InspectionOutcome } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { randomUUID } from "crypto";

// ─── Production guard ─────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");
if (process.env.NODE_ENV === "production") {
  console.error("⛔  Cannot run in NODE_ENV=production.");
  process.exit(1);
}

const dbHost = (() => {
  try { return new URL(connectionString).hostname; } catch { return connectionString; }
})();

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const isReset = process.argv.includes("--reset");
const isResetOnly = process.argv.includes("--reset-only");

// ─── Constants ────────────────────────────────────────────────────────────────

const SEED_AUTHOR = "Seed Script";
const SEED_PREFIX = "[SEED] ";

// ─── Question / section builders ──────────────────────────────────────────────

interface SeedQuestion {
  id: string;
  title: string;
  description: string;
  responseType: string;
  required: boolean;
  photoRequired: boolean;
  deficiencyPhotoRequired: boolean;
  options: string[];
}

interface SeedSection {
  id: string;
  title: string;
  questions: SeedQuestion[];
}

/** Clear Inspection form — realistic questions for final scope sign-off. */
function buildClearInspectionSections(scopeCode: string): SeedSection[] {
  return [
    {
      id: randomUUID(),
      title: `Clear Inspection — ${scopeCode}`,
      questions: [
        {
          id: randomUUID(),
          title: "Overall installation quality",
          description: "Does the completed work meet spec and quality standards?",
          responseType: "PASS_FAIL",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Any deficiencies requiring correction?",
          description: "Document each deficiency found before clearing the scope.",
          responseType: "PASS_FAIL_DEFICIENCIES",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Is the area ready for the next phase?",
          description: "",
          responseType: "YES_NO",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Inspector notes",
          description: "Summary of findings or conditions noted.",
          responseType: "SHORT_ANSWER",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Additional observations",
          description: "Provide any context for the inspector record.",
          responseType: "PARAGRAPH",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Quality rating",
          description: "Rate the overall quality of the completed work.",
          responseType: "RATING",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      ],
    },
  ];
}

/** 2 Area Clear — two-room pre-install walkthrough. */
function buildTwoAreaClearSections(scopeCode: string): SeedSection[] {
  return [
    {
      id: randomUUID(),
      title: `2 Area Clear — ${scopeCode}`,
      questions: [
        {
          id: randomUUID(),
          title: "Area 1 condition",
          description: "",
          responseType: "PASS_FAIL",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Area 2 condition",
          description: "",
          responseType: "PASS_FAIL",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Both areas clear for installation?",
          description: "",
          responseType: "YES_NO",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Notes",
          description: "",
          responseType: "SHORT_ANSWER",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      ],
    },
  ];
}

/** Field Verification — pre-install site conditions check. */
function buildFieldVerificationSections(scopeCode: string): SeedSection[] {
  return [
    {
      id: randomUUID(),
      title: `Field Verification — ${scopeCode}`,
      questions: [
        {
          id: randomUUID(),
          title: "Substrate conditions acceptable?",
          description: "",
          responseType: "YES_NO",
          required: true,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
        {
          id: randomUUID(),
          title: "Existing conditions",
          description: "Select all conditions observed.",
          responseType: "CHECKBOXES",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: ["Level", "Clean", "Dry", "Damage noted", "Previous install present"],
        },
        {
          id: randomUUID(),
          title: "Installation method",
          description: "How will the scope be installed?",
          responseType: "MULTIPLE_CHOICE",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: ["Standard", "Floating", "Direct glue", "Nail-down", "Mechanical"],
        },
        {
          id: randomUUID(),
          title: "Field notes",
          description: "",
          responseType: "PARAGRAPH",
          required: false,
          photoRequired: false,
          deficiencyPhotoRequired: false,
          options: [],
        },
      ],
    },
  ];
}

// ─── Seed media helpers ───────────────────────────────────────────────────────

/**
 * Deterministic picsum image URLs — use a stable seed string so different
 * questions always get different images across re-runs.
 *
 * These URLs render real JPEG photos every time, giving a realistic
 * "many photos attached" look in the inspection record UI.
 */
function seedImages(seedPrefix: string, count: number): { localUrl: string; mimeType: string }[] {
  return Array.from({ length: count }, (_, i) => ({
    localUrl: `https://picsum.photos/seed/${seedPrefix}-${i}/800/600`,
    mimeType: "image/jpeg",
  }));
}

/** A short public MP4 sample — used for the occasional video attachment. */
const SAMPLE_VIDEO = {
  localUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
  mimeType: "video/mp4",
};

// ─── Payload builders ─────────────────────────────────────────────────────────

/**
 * All payload builders must produce values in the AnswerState format that
 * FormFillClient expects:
 *   PASS_FAIL / YES_NO / MULTIPLE_CHOICE  → { choice: string } (lowercase values)
 *   PASS_FAIL_DEFICIENCIES                → { choice: string, deficiencies?: [...] }
 *   CHECKBOXES                            → { choices: string[] }
 *   SHORT_ANSWER / PARAGRAPH              → { text: string }
 *   NUMBER                                → { number: string }
 *   RATING                                → { rating: number }
 *
 * capturedFiles arrays are added to questions and deficiencies so the inspection
 * record UI shows realistic photo/video thumbnails. The `file` property (a live
 * File blob) is intentionally absent — it is only present during an active fill
 * session and is never serialised to the DB.
 */
function buildClearPayload(
  sections: SeedSection[],
  outcome: InspectionOutcome,
  scopeSeed: string,
): Record<string, unknown> {
  const pass = outcome === "PASS" || outcome === "COMPLETE";
  const payload: Record<string, unknown> = {};
  let qIdx = 0;
  for (const section of sections) {
    for (const q of section.questions) {
      const seed = `${scopeSeed}-q${qIdx++}`;
      switch (q.responseType) {
        case "PASS_FAIL":
          payload[q.id] = {
            choice: pass ? "pass" : "fail",
            capturedFiles: pass
              ? seedImages(`${seed}-pass`, 2)
              : [...seedImages(`${seed}-fail`, 3), SAMPLE_VIDEO],
          };
          break;
        case "PASS_FAIL_DEFICIENCIES":
          if (pass) {
            payload[q.id] = {
              choice: "pass",
              capturedFiles: seedImages(`${seed}-pf-pass`, 2),
            };
          } else {
            payload[q.id] = {
              choice: "fail",
              capturedFiles: seedImages(`${seed}-pf-overview`, 3),
              deficiencies: [
                {
                  id: randomUUID(),
                  description: "Tile lippage exceeds tolerance at transition strip. Must be re-seated and grouted.",
                  severity: "Major",
                  capturedFiles: seedImages(`${seed}-def0`, 4),
                },
                {
                  id: randomUUID(),
                  description: "Grout missing in corner joints — potential moisture ingress risk.",
                  severity: "Minor",
                  capturedFiles: seedImages(`${seed}-def1`, 2),
                },
              ],
            };
          }
          break;
        case "YES_NO":
          payload[q.id] = {
            choice: pass ? "yes" : "no",
            capturedFiles: seedImages(`${seed}-yn`, pass ? 1 : 2),
          };
          break;
        case "SHORT_ANSWER":
          payload[q.id] = {
            text: pass
              ? "Scope meets all requirements. Cleared for next phase."
              : "Deficiencies noted. Work must be corrected before re-inspection.",
          };
          break;
        case "PARAGRAPH":
          payload[q.id] = {
            text: pass
              ? "Installation completed to spec. All quality checkpoints passed. No corrective action required."
              : "Multiple issues observed during walkthrough. Installer notified. Scope must be corrected and re-submitted for clearance.",
          };
          break;
        case "RATING":
          payload[q.id] = { rating: pass ? 4 : 2 };
          break;
      }
    }
  }

  // Inspector-level media attached to the whole inspection (AUTO_MEDIA_KEY section).
  // Pass: 3 overview photos. Fail: 5 deficiency overview photos + video.
  payload["__inspector_media__"] = {
    capturedFiles: pass
      ? seedImages(`${scopeSeed}-inspector`, 3)
      : [...seedImages(`${scopeSeed}-inspector-fail`, 5), SAMPLE_VIDEO],
  };
  if (!pass) {
    payload["__inspector_notes__"] = {
      text: "Multiple deficiencies documented above. Photos uploaded at each fail point. Scope must be corrected and re-submitted.",
    };
  } else {
    payload["__inspector_notes__"] = {
      text: "All quality checkpoints passed. Photos attached for the record.",
    };
  }

  return payload;
}

function buildTwoAreaPayload(sections: SeedSection[], scopeSeed: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  let qIdx = 0;
  for (const section of sections) {
    for (const q of section.questions) {
      const seed = `${scopeSeed}-2a-q${qIdx++}`;
      switch (q.responseType) {
        case "PASS_FAIL":
          payload[q.id] = { choice: "pass", capturedFiles: seedImages(`${seed}-pass`, 2) };
          break;
        case "YES_NO":
          payload[q.id] = { choice: "yes", capturedFiles: seedImages(`${seed}-yn`, 1) };
          break;
        case "SHORT_ANSWER":
          payload[q.id] = { text: "Both areas verified and ready for installation." };
          break;
      }
    }
  }
  payload["__inspector_media__"] = { capturedFiles: seedImages(`${scopeSeed}-2a-inspector`, 3) };
  payload["__inspector_notes__"] = { text: "Pre-install walkthrough complete. Both areas clear." };
  return payload;
}

function buildFieldVerPayload(sections: SeedSection[], scopeSeed: string): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  let qIdx = 0;
  for (const section of sections) {
    for (const q of section.questions) {
      const seed = `${scopeSeed}-fv-q${qIdx++}`;
      switch (q.responseType) {
        case "YES_NO":
          payload[q.id] = { choice: "yes", capturedFiles: seedImages(`${seed}-yn`, 2) };
          break;
        case "CHECKBOXES":
          payload[q.id] = { choices: ["Level", "Clean", "Dry"] };
          break;
        case "MULTIPLE_CHOICE":
          payload[q.id] = { choice: "Standard" };
          break;
        case "PARAGRAPH":
          payload[q.id] = { text: "Site conditions verified. Materials staged. Installation can proceed." };
          break;
      }
    }
  }
  payload["__inspector_media__"] = {
    capturedFiles: [...seedImages(`${scopeSeed}-fv-inspector`, 4), SAMPLE_VIDEO],
  };
  payload["__inspector_notes__"] = { text: "Substrate level and dry. Site is ready. Video walkthrough attached." };
  return payload;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`🌱  Inspection seed script — host: ${dbHost}\n`);

  // ── Reset ──────────────────────────────────────────────────────────────────
  if (isReset || isResetOnly) {
    console.log("🗑   Resetting seeded data...");

    // 1. Find all seeded forms so we can delete ALL submissions referencing them
    //    (not just the ones submitted by SEED_AUTHOR).
    const seededForms = await db.form.findMany({
      where: { name: { startsWith: SEED_PREFIX } },
      select: { id: true },
    });
    const seededFormIds = seededForms.map((f) => f.id);

    // 2. Gather affected scope row IDs before deleting
    const seededScopeRowIds = await db.inspectionSubmission.findMany({
      where: seededFormIds.length > 0 ? { formId: { in: seededFormIds } } : { id: { in: [] } },
      select: { scopeRowId: true },
    });
    const scopeIdsToReset = [
      ...new Set(seededScopeRowIds.map((s) => s.scopeRowId).filter(Boolean) as string[]),
    ];

    // 3. Delete all submissions referencing seeded forms (covers any author)
    const deletedSubs = await db.inspectionSubmission.deleteMany({
      where: seededFormIds.length > 0 ? { formId: { in: seededFormIds } } : { id: { in: [] } },
    });
    console.log(`     Deleted ${deletedSubs.count} submission(s).`);

    // 4. Now safe to delete the forms
    const deletedForms = await db.form.deleteMany({
      where: { name: { startsWith: SEED_PREFIX } },
    });
    console.log(`     Deleted ${deletedForms.count} form(s).`);

    // 5. Clear inspectionStatus on affected scope rows
    if (scopeIdsToReset.length > 0) {
      const cleared = await db.projectRow.updateMany({
        where: { id: { in: scopeIdsToReset } },
        data: { inspectionStatus: null },
      });
      console.log(`     Cleared inspectionStatus on ${cleared.count} scope row(s).\n`);
    } else {
      console.log();
    }

    if (isResetOnly) {
      console.log("✅  All seeded inspection data removed. Nothing re-seeded.");
      return;
    }
  }

  // ── Find admin user ────────────────────────────────────────────────────────
  const adminUser = await db.user.findFirst({
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  if (!adminUser) { console.error("❌  No users found."); process.exit(1); }
  console.log(`👤  Using "${adminUser.name}" for form authorship.\n`);

  // ── Find Install+Complete scope rows ───────────────────────────────────────
  const scopeRows = await db.projectRow.findMany({
    where: {
      scopeTypeId: { not: null },
      scopeStage: "INSTALL",
      scopeStatus: "COMPLETE",
    },
    select: {
      id: true,
      projectId: true,
      inspectionStatus: true,
      scopeType: {
        select: {
          code: true,
          name: true,
          canonicalScopeType: { select: { code: true, displayName: true } },
        },
      },
    },
    orderBy: { rowIndex: "asc" },
  });

  console.log(`📋  Found ${scopeRows.length} Install+Complete scope row(s).\n`);
  if (scopeRows.length === 0) {
    console.log("   No eligible scopes. Set some scopes to Install+Complete first.");
    return;
  }

  // Collect distinct canonical codes
  const canonicalCodeSet = new Set<string>();
  for (const row of scopeRows) {
    const code = row.scopeType?.canonicalScopeType?.code ?? row.scopeType?.code;
    if (code) canonicalCodeSet.add(code);
  }
  const canonicalCodes = [...canonicalCodeSet].sort();
  console.log(`    Canonical codes: ${canonicalCodes.join(", ")}\n`);

  // ── Create forms ───────────────────────────────────────────────────────────
  type FormCategory = "CLEAR_INSPECTION" | "TWO_AREA_CLEAR" | "FIELD_VERIFICATION";

  interface FormDef {
    category: FormCategory;
    label: string;
    buildSections: (code: string) => SeedSection[];
  }

  const FORM_DEFS: FormDef[] = [
    { category: "CLEAR_INSPECTION",  label: "Clear Inspection",  buildSections: buildClearInspectionSections },
    { category: "TWO_AREA_CLEAR",    label: "2 Area Clear",      buildSections: buildTwoAreaClearSections },
    { category: "FIELD_VERIFICATION",label: "Field Verification",buildSections: buildFieldVerificationSections },
  ];

  interface FormEntry {
    formId: string;
    versionId: string;
    sections: SeedSection[];
    formName: string;
    category: FormCategory;
  }

  // formKey = `${category}::${canonicalCode}`
  const formMap = new Map<string, FormEntry>();

  console.log(`📝  Creating ${FORM_DEFS.length} × ${canonicalCodes.length} = ${FORM_DEFS.length * canonicalCodes.length} form(s)...`);

  for (const def of FORM_DEFS) {
    for (const code of canonicalCodes) {
      const formName = `${SEED_PREFIX}${def.label} — ${code}`;
      const formKey = `${def.category}::${code}`;

      const existing = await db.form.findFirst({
        where: { name: formName },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } },
      });

      if (existing && existing.versions[0]) {
        formMap.set(formKey, {
          formId: existing.id,
          versionId: existing.versions[0].id,
          sections: existing.versions[0].sections as unknown as SeedSection[],
          formName,
          category: def.category,
        });
        process.stdout.write("·");
        continue;
      }

      const sections = def.buildSections(code);
      const form = await db.form.create({
        data: {
          name: formName,
          level: "scope",
          category: def.category,
          scopeTypeCodes: [code],
          status: FormStatus.PUBLISHED,
          draftSections: sections as unknown as import("@prisma/client").Prisma.InputJsonValue,
          createdById: adminUser.id,
        },
      });
      const version = await db.formVersion.create({
        data: { formId: form.id, versionNumber: 1, sections: sections as unknown as import("@prisma/client").Prisma.InputJsonValue, publishedById: adminUser.id },
      });

      formMap.set(formKey, {
        formId: form.id,
        versionId: version.id,
        sections,
        formName,
        category: def.category,
      });
      process.stdout.write("✚");
    }
  }
  console.log(`\n    Forms ready: ${formMap.size}\n`);

  // ── Check which scopes are already seeded ──────────────────────────────────
  const existingSeeded = await db.inspectionSubmission.findMany({
    where: {
      form: { name: { startsWith: SEED_PREFIX } },
    },
    select: { scopeRowId: true },
  });
  const alreadySeededScopeIds = new Set(
    existingSeeded.map((s) => s.scopeRowId).filter(Boolean),
  );
  console.log(`    ${alreadySeededScopeIds.size} scope row(s) already seeded — skipping.\n`);

  // ── Build submissions batch ────────────────────────────────────────────────
  console.log("📊  Building submissions...");

  interface SubData {
    formId: string;
    formVersionId: string;
    templateSnapshot: object;
    projectId: string;
    unitId: string;
    scopeRowId: string;
    scopeTypeCode: string;
    outcome: InspectionOutcome;
    deficiencyCount: number;
    payload: object;
    submittedAt: Date;
  }

  const submissions: SubData[] = [];
  // For updating inspectionStatus after insert:
  const inspectionStatusUpdates: Array<{ rowId: string; status: "PASSED" | "FAILED" }> = [];

  const nowMs = Date.now();

  for (let i = 0; i < scopeRows.length; i++) {
    const scopeRow = scopeRows[i];
    if (alreadySeededScopeIds.has(scopeRow.id)) continue;

    const canonicalCode =
      scopeRow.scopeType?.canonicalScopeType?.code ?? scopeRow.scopeType?.code;
    if (!canonicalCode) continue;

    const clearKey = `CLEAR_INSPECTION::${canonicalCode}`;
    const clearForm = formMap.get(clearKey);
    if (!clearForm) continue;

    // ── Determine clear inspection outcome pattern ──────────────────────────
    // 70% pass first attempt, 30% fail (1–3 attempts).
    const roll = i % 10;
    let clearOutcomes: InspectionOutcome[];
    let finalInspectionStatus: "PASSED" | "FAILED";

    if (roll < 7) {
      // 70%: pass on first attempt
      clearOutcomes = ["PASS"];
      finalInspectionStatus = "PASSED";
    } else if (roll === 7) {
      // 10%: 1 failed attempt, still open
      clearOutcomes = ["FAIL"];
      finalInspectionStatus = "FAILED";
    } else if (roll === 8) {
      // 10%: 2 failed attempts
      clearOutcomes = ["FAIL", "FAIL"];
      finalInspectionStatus = "FAILED";
    } else {
      // 10%: 3 failed attempts
      clearOutcomes = ["FAIL", "FAIL", "FAIL"];
      finalInspectionStatus = "FAILED";
    }

    // Space clear inspection attempts ~2 days apart, ending recently
    const clearStartMs = nowMs - (clearOutcomes.length - 1) * 2 * 24 * 60 * 60 * 1000;

    for (let run = 0; run < clearOutcomes.length; run++) {
      const outcome = clearOutcomes[run];
      submissions.push({
        formId: clearForm.formId,
        formVersionId: clearForm.versionId,
        templateSnapshot: {
          id: clearForm.formId,
          name: clearForm.formName,
          description: "",
          status: "published",
          level: "scope",
          category: clearForm.category,
          scopeTypeCodes: [canonicalCode],
          sections: clearForm.sections,
          versionNumber: 1,
          latestVersionId: clearForm.versionId,
        },
        projectId: scopeRow.projectId,
        unitId: scopeRow.id,
        scopeRowId: scopeRow.id,
        scopeTypeCode: canonicalCode,
        outcome,
        deficiencyCount: outcome === "PASS" ? 0 : 2,
        payload: buildClearPayload(clearForm.sections, outcome, `${scopeRow.id}-run${run}`),
        submittedAt: new Date(clearStartMs + run * 2 * 24 * 60 * 60 * 1000),
      });
    }

    inspectionStatusUpdates.push({ rowId: scopeRow.id, status: finalInspectionStatus });

    // ── Other inspection types (~40% of scopes) ────────────────────────────
    // Even index → 2 Area Clear; every 5th → Field Verification
    if (i % 5 === 0) {
      const twoAreaKey = `TWO_AREA_CLEAR::${canonicalCode}`;
      const twoAreaForm = formMap.get(twoAreaKey);
      if (twoAreaForm) {
        // Performed before the clear inspection, ~5 days ago
        submissions.push({
          formId: twoAreaForm.formId,
          formVersionId: twoAreaForm.versionId,
          templateSnapshot: {
            id: twoAreaForm.formId,
            name: twoAreaForm.formName,
            description: "",
            status: "published",
            level: "scope",
            category: twoAreaForm.category,
            scopeTypeCodes: [canonicalCode],
            sections: twoAreaForm.sections,
            versionNumber: 1,
            latestVersionId: twoAreaForm.versionId,
          },
          projectId: scopeRow.projectId,
          unitId: scopeRow.id,
          scopeRowId: scopeRow.id,
          scopeTypeCode: canonicalCode,
          outcome: "PASS",
          deficiencyCount: 0,
          payload: buildTwoAreaPayload(twoAreaForm.sections, scopeRow.id),
          submittedAt: new Date(clearStartMs - 5 * 24 * 60 * 60 * 1000),
        });
      }
    } else if (i % 5 === 2) {
      const fvKey = `FIELD_VERIFICATION::${canonicalCode}`;
      const fvForm = formMap.get(fvKey);
      if (fvForm) {
        submissions.push({
          formId: fvForm.formId,
          formVersionId: fvForm.versionId,
          templateSnapshot: {
            id: fvForm.formId,
            name: fvForm.formName,
            description: "",
            status: "published",
            level: "scope",
            category: fvForm.category,
            scopeTypeCodes: [canonicalCode],
            sections: fvForm.sections,
            versionNumber: 1,
            latestVersionId: fvForm.versionId,
          },
          projectId: scopeRow.projectId,
          unitId: scopeRow.id,
          scopeRowId: scopeRow.id,
          scopeTypeCode: canonicalCode,
          outcome: "PASS",
          deficiencyCount: 0,
          payload: buildFieldVerPayload(fvForm.sections, scopeRow.id),
          submittedAt: new Date(clearStartMs - 7 * 24 * 60 * 60 * 1000),
        });
      }
    }
  }

  // ── Bulk insert submissions ────────────────────────────────────────────────
  console.log(`    Inserting ${submissions.length} submission(s) in chunks...`);
  const CHUNK = 200;
  let inserted = 0;
  for (let start = 0; start < submissions.length; start += CHUNK) {
    const chunk = submissions.slice(start, start + CHUNK);
    await db.inspectionSubmission.createMany({ data: chunk });
    inserted += chunk.length;
    process.stdout.write(`\r    Inserted ${inserted}/${submissions.length}...`);
  }
  console.log(`\n    Done.\n`);

  // ── Update inspectionStatus on scope rows ─────────────────────────────────
  console.log(`🔧  Updating inspectionStatus on ${inspectionStatusUpdates.length} scope row(s)...`);
  let updated = 0;
  for (const { rowId, status } of inspectionStatusUpdates) {
    await db.projectRow.update({
      where: { id: rowId },
      data: { inspectionStatus: status },
    });
    updated++;
  }
  console.log(`    Updated ${updated} row(s).\n`);

  const clearSubs = submissions.filter((s) => {
    const key = `CLEAR_INSPECTION::${s.scopeTypeCode}`;
    return formMap.get(key)?.formId === s.formId;
  });
  const otherSubs = submissions.filter((s) => {
    const key = `CLEAR_INSPECTION::${s.scopeTypeCode}`;
    return formMap.get(key)?.formId !== s.formId;
  });

  console.log(`✅  Seed complete!`);
  console.log(`    ${clearSubs.length} clear inspection submissions`);
  console.log(`    ${otherSubs.length} other inspection submissions`);
  console.log(`    ${inspectionStatusUpdates.filter(u => u.status === "PASSED").length} scopes → PASSED`);
  console.log(`    ${inspectionStatusUpdates.filter(u => u.status === "FAILED").length} scopes → FAILED`);
}

main()
  .catch((err) => { console.error("\n❌  Seed failed:", err); process.exit(1); })
  .finally(() => db.$disconnect());
