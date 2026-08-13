"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { FileText, Image, Loader2, ExternalLink, ChevronDown, Search, X } from "lucide-react";
import { PROJECT_HUB_CARD_STYLE, ProjectHubCardHeader } from "@/components/projects/ProjectHubCardHeader";

interface UnifierDocument {
  id: string;
  projectId: string | null;
  title: string | null;
  fileName: string | null;
  revisionNo: string | null;
  issueDate: string | null;
  createDate: string | null;
  uploadDate: string | null;
  fileSize: number | null;
  createdBy: string | null;
  uploadBy: string | null;
  docTag: string | null;
  downloadUrl: string | null;
  nodeType: string | null;
}

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff", "tif", "svg", "heic", "heif"]);

function getExt(name: string | null): string | null {
  return name?.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase() ?? null;
}

function isImage(doc: UnifierDocument): boolean {
  const ext = getExt(doc.title ?? doc.fileName);
  return ext != null && IMAGE_EXTENSIONS.has(ext);
}

type TabId = "docs" | "images";

/** Strip file extension and clean up underscores/dashes for a readable display name. */
function humanizeName(raw: string | null): string {
  if (!raw) return "";
  return raw
    .replace(/\.[a-zA-Z0-9]{2,5}$/, "") // strip extension
    .replace(/[_]+/g, " ")              // underscores → spaces
    .trim();
}

/**
 * Best-effort label for Unifier NODE_TYPE numeric codes.
 * Values observed so far are numeric; we'll show a tag and let unknown codes
 * display as-is so we can learn new values over time.
 */
function nodeTypeLabel(code: string | null): string | null {
  if (!code) return null;
  const map: Record<string, string> = {
    "1": "Folder",
    "2": "Document",
    "3": "Web Link",
    "4": "Shortcut",
  };
  return map[code] ?? `Type ${code}`;
}

interface ProjectDocumentsProps {
  unifierPid: string | null;
  /** Unifier project number (e.g. 24-00967). Tried as fallback for document lookup. */
  unifierProjectNumber?: string | null;
  /** Base URL for Unifier (e.g. https://us2.unifier.oraclecloud.com/cpbuild) — used for document links */
  unifierBaseUrl?: string | null;
}

export function ProjectDocuments({ unifierPid, unifierProjectNumber, unifierBaseUrl }: ProjectDocumentsProps) {
  const t = useTranslations("projects");
  // Stable DOM ids from unifierPid — avoids useId() hydration drift when upstream
  // client components allocate a different number of React ids on server vs client.
  const idSuffix = unifierPid ?? "none";
  const contentId = `project-documents-${idSuffix}-content`;
  const searchId = `project-documents-${idSuffix}-search`;
  const [collapsed, setCollapsed] = useState(true);
  const [documents, setDocuments] = useState<UnifierDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState<TabId>("docs");

  const docKey = `${unifierPid ?? ""}|${unifierProjectNumber ?? ""}`;
  useEffect(() => {
    if (!unifierPid) {
      queueMicrotask(() => {
        setDocuments([]);
        setLoading(false);
      });
      return;
    }
    queueMicrotask(() => {
      setLoading(true);
      setError(null);
    });
    const url = new URL(`/api/unifier/projects/${encodeURIComponent(unifierPid)}/documents`, window.location.origin);
    if (unifierProjectNumber) url.searchParams.set("projectNumber", unifierProjectNumber);
    fetch(url.toString())
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load documents");
        return res.json();
      })
      .then((data) => {
        setDocuments(data.documents ?? []);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load documents");
        setDocuments([]);
      })
      .finally(() => setLoading(false));
  }, [docKey]);

  const docList = useMemo(() => documents.filter((d) => !isImage(d)), [documents]);
  const imageList = useMemo(() => documents.filter(isImage), [documents]);
  const activeList = activeTab === "images" ? imageList : docList;

  const filtered = useMemo(() => {
    if (!query.trim()) return activeList;
    const q = query.toLowerCase();
    return activeList.filter((d) =>
      (d.title ?? d.fileName ?? "").toLowerCase().includes(q) ||
      (d.nodeType ?? "").toLowerCase().includes(q)
    );
  }, [activeList, query]);

  if (!unifierPid) return null;

  return (
    <div style={PROJECT_HUB_CARD_STYLE}>
      <ProjectHubCardHeader
        icon={FileText}
        title={t("unifierDocuments")}
        marginBottom={collapsed ? 0 : "var(--space-3)"}
        actions={
          <>
            {!loading && documents.length > 0 && (
              <span style={{ fontSize: "var(--text-caption)", fontWeight: 400, color: "var(--neutral-500)" }}>
                ({documents.length})
              </span>
            )}
            <button
              type="button"
              aria-expanded={!collapsed}
              aria-controls={contentId}
              aria-label={collapsed ? t("showDocuments") : t("hideDocuments")}
              onClick={() => setCollapsed((c) => !c)}
              style={{
                background: "none",
                border: "none",
                padding: "2px",
                cursor: "pointer",
                color: "var(--neutral-500)",
                display: "flex",
                alignItems: "center",
                borderRadius: "var(--radius-sm)",
                transition: "color 0.15s",
              }}
            >
              <ChevronDown
                size={16}
                aria-hidden
                style={{
                  transform: collapsed ? "rotate(0deg)" : "rotate(180deg)",
                  transition: "transform 0.2s ease",
                }}
              />
            </button>
          </>
        }
      />

      {/* Collapsible content */}
      {!collapsed && (
        <div id={contentId}>
          {loading && (
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", color: "var(--neutral-500)", fontSize: "var(--text-caption)" }}>
              <Loader2 size={14} className="animate-spin" aria-hidden />
              {t("loadingDocuments")}
            </div>
          )}

          {error && (
            <p style={{ fontSize: "var(--text-caption)", color: "var(--error-600)", margin: 0 }}>
              {error}
            </p>
          )}

          {!loading && !error && documents.length === 0 && (
            <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-500)", margin: 0 }}>
              {t("noDocuments")}
            </p>
          )}

          {!loading && !error && documents.length > 0 && (
            <>
              {/* Tabs */}
              <div
                role="tablist"
                aria-label="Document categories"
                style={{
                  display: "flex",
                  gap: 2,
                  marginBottom: "var(--space-3)",
                  borderBottom: "1px solid var(--neutral-200)",
                }}
              >
                {(
                  [
                    { id: "docs" as TabId, label: "Documents", icon: <FileText size={13} aria-hidden />, count: docList.length },
                    { id: "images" as TabId, label: "Images", icon: <Image size={13} aria-hidden />, count: imageList.length },
                  ] as const
                ).map(({ id, label, icon, count }) => (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={activeTab === id}
                    onClick={() => { setActiveTab(id); setQuery(""); }}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 5,
                      padding: "6px 12px",
                      fontSize: "var(--text-caption)",
                      fontWeight: activeTab === id ? 600 : 400,
                      color: activeTab === id ? "var(--primary-600)" : "var(--neutral-500)",
                      background: "none",
                      border: "none",
                      borderBottom: activeTab === id ? "2px solid var(--primary-600)" : "2px solid transparent",
                      marginBottom: -1,
                      cursor: "pointer",
                      transition: "color 0.15s",
                    }}
                  >
                    {icon}
                    {label}
                    {count > 0 && (
                      <span style={{
                        fontSize: 10,
                        fontWeight: 600,
                        padding: "1px 5px",
                        borderRadius: 10,
                        backgroundColor: activeTab === id ? "rgba(124,58,237,0.1)" : "var(--neutral-100)",
                        color: activeTab === id ? "var(--primary-600)" : "var(--neutral-500)",
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search box */}
              <div style={{ position: "relative", marginBottom: "var(--space-3)" }}>
                <Search
                  size={14}
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 10,
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--neutral-400)",
                    pointerEvents: "none",
                  }}
                />
                <input
                  id={searchId}
                  type="search"
                  placeholder="Search documents…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{
                    width: "100%",
                    paddingLeft: 32,
                    paddingRight: query ? 32 : 10,
                    paddingTop: 6,
                    paddingBottom: 6,
                    border: "1px solid var(--neutral-200)",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "var(--text-caption)",
                    color: "var(--neutral-800)",
                    backgroundColor: "var(--neutral-50)",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Clear search"
                    onClick={() => setQuery("")}
                    style={{
                      position: "absolute",
                      right: 8,
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      padding: 0,
                      color: "var(--neutral-400)",
                      display: "flex",
                    }}
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {filtered.length === 0 && (
                <p style={{ fontSize: "var(--text-caption)", color: "var(--neutral-400)", margin: 0, fontStyle: "italic" }}>
                  No documents match &ldquo;{query}&rdquo;.
                </p>
              )}

              <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
                {filtered.map((doc) => {
                  const rawName = doc.title || doc.fileName || doc.id;
                  const displayName = humanizeName(rawName);
                  const ext = rawName?.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toUpperCase() ?? null;
                  const typeLabel = nodeTypeLabel(doc.nodeType);
                  const docUrl = doc.downloadUrl
                    ?? (unifierBaseUrl ? `${unifierBaseUrl.replace(/\/$/, "")}/dm/document/${doc.id}` : null);
                  return (
                    <li
                      key={doc.id}
                      style={{
                        padding: "var(--space-2) 0",
                        borderBottom: "1px solid var(--neutral-100)",
                        fontSize: "var(--text-caption)",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexWrap: "wrap" }}>
                        {docUrl ? (
                          <a
                            href={docUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              color: "var(--primary-600)",
                              textDecoration: "none",
                              fontWeight: 500,
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 4,
                              flexShrink: 1,
                              minWidth: 0,
                            }}
                          >
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {displayName}
                            </span>
                            <ExternalLink size={12} aria-hidden style={{ flexShrink: 0 }} />
                          </a>
                        ) : (
                          <span style={{ fontWeight: 500, color: "var(--neutral-800)" }}>{displayName}</span>
                        )}
                        {ext && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                            padding: "1px 5px",
                            borderRadius: 3,
                            backgroundColor: "var(--neutral-100)",
                            color: "var(--neutral-600)",
                            flexShrink: 0,
                          }}>
                            {ext}
                          </span>
                        )}
                        {typeLabel && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 500,
                            padding: "1px 5px",
                            borderRadius: 3,
                            backgroundColor: "rgba(124,58,237,0.08)",
                            color: "#7C3AED",
                            flexShrink: 0,
                          }}>
                            {typeLabel}
                          </span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}
