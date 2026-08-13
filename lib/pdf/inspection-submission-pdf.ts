import {
  inferFieldMediaMimeType,
  isImageMimeType,
  storageKeyFromFieldMediaUrl,
} from "@/lib/pdf/field-media-mime-infer";
import { launchPdfPuppeteerBrowser } from "@/lib/pdf/puppeteer-launch";
import { prefetchPdfImageCache, type PdfImageFetchContext } from "@/lib/pdf/fetch-image-for-pdf";
import type { FieldMediaReference } from "@/lib/field-media-resolve";
import {
  fetchPdfImageRef,
  mediaCacheKey,
} from "@/lib/pdf/field-media-pdf-helpers";
import type {
  Deficiency,
  FormQuestion,
  FormSection,
  FormTemplate,
} from "@/components/forms/formTypes";
import {
  AUTO_MEDIA_KEY,
  AUTO_NOTES_KEY,
  INSPECTION_CATEGORY_LABELS,
} from "@/components/forms/formTypes";
import { isDocumentationForm } from "@/lib/forms/form-purpose-rules";
import {
  activeFollowUpEntries,
  readFollowUpAnswer,
  type ChoiceFollowUpTrigger,
} from "@/lib/forms/choice-follow-ups";
import type { AnswerState } from "@/components/forms/FormFillClient";
import {
  isFailedPassFailAnswer,
  isPassFailQuestionType,
} from "@/lib/inspections/inspection-failed-items-filter";
import {
  FailedOnlyExportEmptyError,
  INSPECTION_PDF_NO_FAILED_ITEMS_HTML,
  isEmptyFailedOnlyExportBody,
} from "@/lib/inspections/inspection-failed-items-export";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BuildInspectionSubmissionPdfOptions {
  template: FormTemplate;
  payload: Record<string, unknown>;
  projectName: string;
  formName: string;
  outcome: string;
  submittedAt: Date;
  submittedBy: string;
  exportedAt: Date;
  /** Optional location line (building / level / unit) */
  locationLine?: string;
  /** Forward session cookies for same-origin field-media URLs (local dev). */
  pdfImageFetch?: PdfImageFetchContext;
  /** When true, omit pass/fail questions answered Pass from the shared PDF body. */
  shareOnlyFailedItems?: boolean;
}

export interface BuildInspectionRecordBodyOptions {
  shareOnlyFailedItems?: boolean;
}

interface StoredAnswer {
  choice?: string;
  choices?: string[];
  text?: string;
  number?: string;
  rating?: number;
  /** Optional inspector comment when `commentsEnabled` on the question. */
  comment?: string;
  deficiencies?: Deficiency[];
  capturedFiles?: Array<{
    serverUrl?: string;
    storageUrl?: string;
    storageKey?: string | null;
    localUrl?: string;
    mimeType?: string;
  }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDateTime(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Cover metadata for a single inspection PDF (exported for unit tests). */
export function formatInspectionPdfCoverMeta(
  template: FormTemplate,
  submittedAt: Date,
): { dateTimeLine: string; showCategory: boolean; categoryLabel: string | null } {
  const dateTimeLine = fmtDateTime(submittedAt);
  const showCategory =
    !isDocumentationForm(template) &&
    template.category !== "OTHER" &&
    Boolean(template.category);
  const categoryLabel =
    showCategory && template.category in INSPECTION_CATEGORY_LABELS
      ? INSPECTION_CATEGORY_LABELS[template.category as keyof typeof INSPECTION_CATEGORY_LABELS]
      : null;
  return { dateTimeLine, showCategory, categoryLabel };
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function parseAnswer(raw: unknown): StoredAnswer | undefined {
  const o = asRecord(raw);
  if (!o) return undefined;
  const deficienciesRaw = o.deficiencies;
  const deficiencies = Array.isArray(deficienciesRaw)
    ? (deficienciesRaw.filter((d) => d && typeof d === "object") as Deficiency[])
    : undefined;
  const capturedFilesRaw = o.capturedFiles;
  const capturedFiles = Array.isArray(capturedFilesRaw)
    ? capturedFilesRaw.filter((x) => x && typeof x === "object") as StoredAnswer["capturedFiles"]
    : undefined;
  return {
    choice: typeof o.choice === "string" ? o.choice : undefined,
    choices: Array.isArray(o.choices) ? o.choices.filter((x) => typeof x === "string") as string[] : undefined,
    text: typeof o.text === "string" ? o.text : undefined,
    number:
      typeof o.number === "number"
        ? String(o.number)
        : typeof o.number === "string"
          ? o.number
          : undefined,
    rating: typeof o.rating === "number" ? o.rating : undefined,
    comment: typeof o.comment === "string" ? o.comment : undefined,
    deficiencies,
    capturedFiles,
  };
}

function commentHtml(answer: StoredAnswer | undefined): string {
  const text = answer?.comment?.trim();
  if (!text) return "";
  return `<p class="answer pre comment"><span class="comment-label">Comment:</span> ${escHtml(text)}</p>`;
}

function mediaRefFromCapturedFile(f: unknown): FieldMediaReference | null {
  const r = asRecord(f);
  if (!r) return null;
  const storageUrl =
    (typeof r.storageUrl === "string" && r.storageUrl.trim()) ||
    (typeof r.serverUrl === "string" && r.serverUrl.trim()) ||
    (typeof r.localUrl === "string" && r.localUrl.startsWith("http") ? r.localUrl.trim() : "") ||
    "";
  if (!storageUrl) return null;
  const storageKey =
    (typeof r.storageKey === "string" && r.storageKey.trim()) ||
    storageKeyFromFieldMediaUrl(storageUrl) ||
    null;
  const mimeType = inferFieldMediaMimeType({
    storageUrl,
    storageKey,
    mimeType: typeof r.mimeType === "string" ? r.mimeType : null,
  });
  return {
    storageUrl,
    storageKey,
    mimeType,
  };
}

function collectMediaRefs(payload: Record<string, unknown>): FieldMediaReference[] {
  const refs: FieldMediaReference[] = [];
  const addFromFiles = (files: unknown) => {
    if (!Array.isArray(files)) return;
    for (const f of files) {
      const ref = mediaRefFromCapturedFile(f);
      if (ref) refs.push(ref);
    }
  };

  for (const [, val] of Object.entries(payload)) {
    const a = parseAnswer(val);
    if (!a) continue;
    addFromFiles(a.capturedFiles);
    if (a.deficiencies) {
      for (const d of a.deficiencies) {
        addFromFiles(d.capturedFiles);
      }
    }
  }

  const byKey = new Map<string, FieldMediaReference>();
  for (const ref of refs) byKey.set(mediaCacheKey(ref), ref);
  return Array.from(byKey.values());
}

/** Image refs embedded in an inspection submission payload (deduped). */
export function listInspectionPayloadImageRefs(
  payload: Record<string, unknown>,
): FieldMediaReference[] {
  return collectMediaRefs(payload).filter((ref) => isImageMimeType(ref.mimeType));
}

/** Prefetch embedded images for one inspection payload (relational storageUrl or legacy serverUrl). */
export async function prefetchInspectionPayloadImages(
  payload: Record<string, unknown>,
  pdfImageFetch?: PdfImageFetchContext,
): Promise<Map<string, string | null>> {
  const refs = collectMediaRefs(payload);
  const byKey = new Map(refs.map((ref) => [mediaCacheKey(ref), ref]));
  return prefetchPdfImageCache(Array.from(byKey.keys()), (key) =>
    fetchPdfImageRef(byKey.get(key)!, pdfImageFetch),
  );
}

function isImageMime(m?: string): boolean {
  return isImageMimeType(m);
}

function mediaImgTags(
  files: StoredAnswer["capturedFiles"] | Deficiency["capturedFiles"] | undefined,
  imageCache: Map<string, string | null>,
): string {
  if (!files?.length) return "";
  const cells: string[] = [];
  const attachments: string[] = [];
  for (const f of files) {
    const ref = mediaRefFromCapturedFile(f);
    if (!ref) continue;
    if (isImageMime(ref.mimeType)) {
      const src = imageCache.get(mediaCacheKey(ref));
      if (src) {
        cells.push(`<div class="photo-cell"><img src="${src}" alt="" /></div>`);
      }
    } else if (ref.mimeType?.startsWith("video/") || ref.mimeType?.startsWith("audio/")) {
      attachments.push(
        `<p class="muted"><a href="${escHtml(ref.storageUrl)}">Media file</a> (${escHtml(ref.mimeType ?? "attachment")})</p>`,
      );
    } else if (ref.storageUrl.startsWith("http") || ref.storageUrl.startsWith("/")) {
      attachments.push(
        `<p class="muted"><a href="${escHtml(ref.storageUrl)}">Media file</a> (${escHtml(ref.mimeType ?? "attachment")})</p>`,
      );
    }
  }
  const grid = cells.length > 0 ? `<div class="photo-grid">${cells.join("")}</div>` : "";
  return grid + attachments.join("");
}

function formatChoiceLabel(
  responseType: FormQuestion["responseType"],
  choice: string | undefined,
): string {
  if (!choice) return "—";
  if (responseType === "PASS_FAIL" || responseType === "PASS_FAIL_DEFICIENCIES") {
    if (choice === "pass") return "Pass";
    if (choice === "fail") return "Fail";
    if (choice === "na") return "N/A";
  }
  if (responseType === "YES_NO") {
    if (choice === "yes") return "Yes";
    if (choice === "no") return "No";
  }
  return choice;
}

function deficienciesHtml(
  list: Deficiency[],
  imageCache: Map<string, string | null>,
): string {
  if (!list.length) return "";
  const blocks = list.map((d, i) => {
    const sev = d.severity ? escHtml(d.severity) : '<span class="muted">No severity</span>';
    const desc = d.description?.trim()
      ? escHtml(d.description)
      : '<span class="muted">No description</span>';
    const count = (d.count ?? 1) > 1 ? ` <span class="count">×${d.count}</span>` : "";
    const imgs = mediaImgTags(d.capturedFiles, imageCache);
    return `
      <div class="def">
        <div class="def-head"><strong>${i + 1}.</strong> ${sev}${count}</div>
        <div class="def-body">${desc}</div>
        ${imgs}
      </div>`;
  });
  return `<div class="def-list">${blocks.join("")}</div>`;
}

function questionAnswerHtml(
  q: FormQuestion,
  answer: StoredAnswer | undefined,
  _payload: Record<string, unknown>,
  imageCache: Map<string, string | null>,
): string {
  const { responseType } = q;
  if (!answer) {
    return '<p class="muted">Not answered</p>';
  }

  if (responseType === "PASS_FAIL" || responseType === "YES_NO") {
    const lbl = formatChoiceLabel(responseType, answer.choice);
    return `<p class="answer">${escHtml(lbl)}</p>`;
  }

  if (responseType === "PASS_FAIL_DEFICIENCIES") {
    if (answer.choice === undefined && (answer.deficiencies?.length || answer.capturedFiles?.length)) {
      return deficienciesHtml(answer.deficiencies ?? [], imageCache);
    }
    if (answer.choice === undefined) {
      return '<p class="muted">Not answered</p>';
    }
    const lbl = formatChoiceLabel(responseType, answer.choice);
    let inner = `<p class="answer">${escHtml(lbl)}</p>`;
    if (answer.choice === "fail" && answer.deficiencies?.length) {
      inner += deficienciesHtml(answer.deficiencies, imageCache);
    }
    return inner;
  }

  if (responseType === "SHORT_ANSWER" || responseType === "PARAGRAPH") {
    const t = answer.text?.trim();
    return t
      ? `<p class="answer pre">${escHtml(t)}</p>`
      : '<p class="muted">No answer</p>';
  }

  if (responseType === "NUMBER") {
    return `<p class="answer">${escHtml(answer.text ?? answer.number ?? "—")}</p>`;
  }

  if (responseType === "MULTIPLE_CHOICE") {
    return `<p class="answer">${escHtml(String(answer.choice ?? "—"))}</p>`;
  }

  if (responseType === "CHECKBOXES") {
    const selected = answer.choices ?? [];
    if (!selected.length) return '<p class="muted">None selected</p>';
    return `<p class="answer">${escHtml(selected.join(", "))}</p>`;
  }

  if (responseType === "RATING") {
    const r = answer.rating ?? 0;
    return `<p class="answer">${r} / 5</p>`;
  }

  return '<p class="muted">—</p>';
}

function followUpBadgeLabel(trigger: ChoiceFollowUpTrigger): string {
  switch (trigger) {
    case "yes":
      return "If yes";
    case "no":
      return "If no";
    case "na":
      return "If N/A";
    case "pass":
      return "If pass";
    case "fail":
      return "If fail";
    default:
      return "Follow-up";
  }
}

function followUpAnswerFromPayload(
  payload: Record<string, unknown>,
  parentQuestionId: string,
  trigger: ChoiceFollowUpTrigger,
  payloadKey: string,
): StoredAnswer | undefined {
  const fromHelper = readFollowUpAnswer(
    payload as Record<string, AnswerState | undefined>,
    parentQuestionId,
    trigger,
  );
  return parseAnswer(fromHelper ?? payload[payloadKey]);
}

function sectionHtml(
  section: FormSection,
  payload: Record<string, unknown>,
  imageCache: Map<string, string | null>,
  bare: boolean,
  isFirst: boolean,
  bodyOptions?: BuildInspectionRecordBodyOptions,
): string {
  const shareOnlyFailedItems = bodyOptions?.shareOnlyFailedItems === true;
  const showHeader = !bare && (section.title.trim().length > 0 || (section.description?.trim().length ?? 0) > 0);
  let head = "";
  if (showHeader) {
    const title = section.title.trim() || "Section";
    const desc = section.description?.trim()
      ? `<p class="sec-desc">${escHtml(section.description.trim())}</p>`
      : "";
    head = `
      <div class="sec-head ${isFirst ? "first" : ""}">
        <h2>${escHtml(title)}</h2>
        ${desc}
      </div>`;
  }

  const questionBlocks: string[] = [];
  for (let qi = 0; qi < section.questions.length; qi++) {
    const q = section.questions[qi]!;
    const answer = parseAnswer(payload[q.id]);
    if (shareOnlyFailedItems) {
      if (!isPassFailQuestionType(q.responseType)) continue;
      if (!isFailedPassFailAnswer(q.responseType, answer)) continue;
    }

    const isFirstQ = questionBlocks.length === 0 && (!showHeader || isFirst);
    let block = `
      <div class="q ${isFirstQ ? "q-first" : ""}">
        <h3>${escHtml(q.title.trim() || "Question")}${q.required ? ' <span class="req">*</span>' : ""}</h3>
        ${questionAnswerHtml(q, answer, payload, imageCache)}
        ${mediaImgTags(answer?.capturedFiles, imageCache)}
        ${commentHtml(answer)}
      </div>`;

    for (const { trigger, followUp, payloadKey } of activeFollowUpEntries(q, answer?.choice)) {
      const fuAns = followUpAnswerFromPayload(payload, q.id, trigger, payloadKey);
      if (!fuAns) continue;
      block += `
        <div class="followup">
          <div class="followup-badge">${escHtml(followUpBadgeLabel(trigger))}</div>
          <div class="q">
            <h3>${escHtml(followUp.title.trim() || "Follow-up")}${followUp.required ? ' <span class="req">*</span>' : ""}</h3>
            ${questionAnswerHtml(followUp, fuAns, payload, imageCache)}
            ${mediaImgTags(fuAns.capturedFiles, imageCache)}
            ${commentHtml(fuAns)}
          </div>
        </div>`;
    }
    questionBlocks.push(block);
  }

  if (questionBlocks.length === 0) return "";

  return `${head + questionBlocks.join("")}`;
}

function autoSectionHtml(
  payload: Record<string, unknown>,
  imageCache: Map<string, string | null>,
): string {
  const notes = parseAnswer(payload[AUTO_NOTES_KEY]);
  const media = parseAnswer(payload[AUTO_MEDIA_KEY]);
  const noteText = notes?.text?.trim();
  const hasMedia = Boolean(media?.capturedFiles?.length);
  if (!noteText && !hasMedia) return "";

  let h = '<div class="sec-head"><h2>Inspector notes &amp; media</h2></div>';
  if (noteText) {
    h += `<div class="q q-first"><h3>Notes</h3><p class="answer pre">${escHtml(noteText)}</p></div>`;
  }
  if (hasMedia) {
    h += `<div class="q"><h3>Attachments</h3>${mediaImgTags(media?.capturedFiles, imageCache)}</div>`;
  }
  return h;
}

function backfillHtml(payload: Record<string, unknown>): string {
  const note = typeof payload.note === "string" ? payload.note.trim() : "";
  if (note) {
    return `<div class="q q-first"><h3>Backfill note</h3><p class="answer pre">${escHtml(note)}</p></div>`;
  }
  return '<p class="muted">No form responses — backfill or legacy record.</p>';
}

/** Render form sections + auto notes for one inspection (no cover/footer wrapper). */
export function buildInspectionRecordBodyInner(
  template: FormTemplate,
  payload: Record<string, unknown>,
  imageCache: Map<string, string | null>,
  options?: BuildInspectionRecordBodyOptions,
): string {
  const shareOnlyFailedItems = options?.shareOnlyFailedItems === true;
  const sections = (template.sections ?? []).filter((s) => s.questions.length > 0);
  const bare = sections.length === 1 && !sections[0].title.trim();
  if (sections.length === 0) return backfillHtml(payload);
  const body =
    sections.map((s, si) => sectionHtml(s, payload, imageCache, bare, si === 0, options)).join("") +
    (shareOnlyFailedItems ? "" : autoSectionHtml(payload, imageCache));
  if (shareOnlyFailedItems && !body.trim()) {
    return INSPECTION_PDF_NO_FAILED_ITEMS_HTML;
  }
  return body;
}

export const INSPECTION_RECORD_PDF_STYLES = `
  * { box-sizing: border-box; }
  body {
    font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    font-size: 11pt;
    line-height: 1.45;
    color: #111;
    margin: 0;
    padding: 0 12px 24px;
  }
  .cover {
    padding: 28px 8px 20px;
    border-bottom: 2px solid #e5e7eb;
    margin-bottom: 18px;
  }
  .cover-project { font-size: 10pt; color: #6b7280; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 0.06em; }
  .cover-title { font-size: 20pt; font-weight: 800; margin: 0 0 8px; letter-spacing: -0.02em; }
  .cover-meta { font-size: 10pt; color: #374151; margin: 0 0 4px; }
  .cover-outcome {
    display: inline-block;
    margin-top: 10px;
    padding: 4px 12px;
    border-radius: 999px;
    font-weight: 700;
    font-size: 10pt;
    background: #ecfdf5;
    color: #166534;
  }
  .cover-outcome.fail { background: #fef2f2; color: #991b1b; }
  h2 { font-size: 13pt; font-weight: 800; margin: 0 0 6px; }
  h3 { font-size: 11pt; font-weight: 700; margin: 0 0 6px; color: #1f2937; }
  .sec-head { padding: 16px 0 8px; border-top: 1px solid #e5e7eb; }
  .sec-head.first { border-top: none; padding-top: 8px; }
  .sec-desc { margin: 4px 0 0; font-size: 10pt; color: #6b7280; }
  .q {
    padding: 12px 10px 14px;
    margin-bottom: 4px;
    background: #fafafa;
    border-radius: 8px;
    border: 1px solid #f3f4f6;
  }
  .q-first { margin-top: 0; }
  .answer { margin: 0; }
  .pre { white-space: pre-wrap; }
  .muted { color: #9ca3af; font-style: italic; margin: 0; }
  .req { color: #9ca3af; font-weight: 400; }
  .def-list { margin-top: 8px; }
  .def { border-left: 3px solid #f87171; padding-left: 10px; margin-bottom: 10px; }
  .def-head { font-size: 10pt; margin-bottom: 4px; }
  .def-body { font-size: 10pt; margin: 0 0 6px; }
  .count { font-weight: 700; color: #92400e; }
  .followup { margin: 8px 0 0 12px; padding-left: 12px; border-left: 3px solid #fcd34d; }
  .followup-badge {
    display: inline-block;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #92400e;
    background: #fef3c7;
    border: 1px solid #fde68a;
    border-radius: 999px;
    padding: 2px 8px;
    margin-bottom: 6px;
  }
  /* 2-up grid — ~3.5in per cell on A4; cap height so portraits don't dominate a page */
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    margin-top: 8px;
    margin-bottom: 4px;
  }
  .photo-cell img {
    width: 100%;
    max-height: 2.75in;
    height: auto;
    object-fit: contain;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
    display: block;
    background: #f9fafb;
  }
  .footer {
    margin-top: 24px;
    padding-top: 12px;
    border-top: 1px solid #e5e7eb;
    font-size: 8pt;
    color: #9ca3af;
  }
  @media print {
    body { padding: 8px 12px; }
    /* Allow question/deficiency blocks to split across pages — avoids huge blank gaps with photos */
    .q h3, .def-head, .sec-head, .record-header { break-inside: avoid; }
  }
`;

async function buildHtml(opts: BuildInspectionSubmissionPdfOptions): Promise<string> {
  const {
    template,
    payload,
    projectName,
    formName,
    outcome,
    submittedAt,
    submittedBy,
    exportedAt,
    locationLine,
    pdfImageFetch,
    shareOnlyFailedItems,
  } = opts;

  const imageCache = await prefetchInspectionPayloadImages(payload, pdfImageFetch);

  const { dateTimeLine, showCategory, categoryLabel } = formatInspectionPdfCoverMeta(
    template,
    submittedAt,
  );
  const primaryMetaLine = showCategory && categoryLabel
    ? `${categoryLabel} · ${dateTimeLine}`
    : dateTimeLine;

  const bodyInner = buildInspectionRecordBodyInner(template, payload, imageCache, {
    shareOnlyFailedItems,
  });
  if (shareOnlyFailedItems && isEmptyFailedOnlyExportBody(bodyInner)) {
    throw new FailedOnlyExportEmptyError();
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escHtml(formName)}</title>
<style>
${INSPECTION_RECORD_PDF_STYLES}
</style>
</head>
<body>
  <div class="cover">
    <p class="cover-project">${escHtml(projectName)}</p>
    <p class="cover-title">${escHtml(formName)}</p>
    <p class="cover-meta">${escHtml(primaryMetaLine)}</p>
    <p class="cover-meta">Submitted by: ${escHtml(submittedBy)}</p>
    ${locationLine ? `<p class="cover-meta">Location: ${escHtml(locationLine)}</p>` : ""}
    <span class="cover-outcome ${outcome === "FAIL" ? "fail" : ""}">Outcome: ${escHtml(outcome)}</span>
  </div>
  ${bodyInner}
  <p class="footer">Exported ${escHtml(fmtDateTime(exportedAt))} · Inspection record</p>
</body>
</html>`;
}

// ── Puppeteer ─────────────────────────────────────────────────────────────────

export async function buildInspectionSubmissionPdf(
  opts: BuildInspectionSubmissionPdfOptions,
): Promise<Buffer> {
  const html = await buildHtml(opts);
  const browser = await launchPdfPuppeteerBrowser();

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(50_000);
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await new Promise((r) => setTimeout(r, 400));
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
