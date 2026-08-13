"use client";

import type { UPMValidationError } from "@/lib/upm-parse";

export interface UpmPreviewTableProps {
  headers: string[];
  rows: Record<string, string>[];
  validationErrors: UPMValidationError[];
  rowNumberHeader: string;
  /** When true, cells are read-only text (no inputs). */
  readOnly?: boolean;
  onCellEdit?: (rowIndex: number, col: string, value: string) => void;
}

const STICKY_BG_HEADER = "var(--neutral-100)";
const STICKY_BG_ROW = "var(--neutral-0)";
const STICKY_BG_ROW_ERROR = "var(--error-50, #fef2f2)";

/** Sticky header row (top) + sticky row# column (left); corner cell needs highest z-index. */
const Z_HEADER_CORNER = 5;
const Z_HEADER_CELL = 4;
const Z_BODY_ROW_LABEL = 2;

/**
 * Full editable grid for pasted/uploaded Location Builder rows. Row numbers match
 * 1-based indices in validation messages (row N = rows[N - 1]).
 */
export function UpmPreviewTable({
  headers,
  rows,
  validationErrors,
  rowNumberHeader,
  readOnly = false,
  onCellEdit,
}: UpmPreviewTableProps) {
  return (
    <div
      data-testid="upm-preview-table"
      style={{
        border: "1px solid var(--neutral-200)",
        borderRadius: "var(--radius-sm, 6px)",
        overflow: "auto",
        maxHeight: "min(max(40vh, 320px), 560px)",
      }}
    >
      <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
        <thead>
          <tr style={{ backgroundColor: STICKY_BG_HEADER }}>
            <th
              scope="col"
              style={{
                position: "sticky",
                left: 0,
                top: 0,
                zIndex: Z_HEADER_CORNER,
                padding: "8px 10px",
                textAlign: "right",
                fontWeight: 600,
                color: "var(--neutral-700)",
                borderBottom: "1px solid var(--neutral-200)",
                borderRight: "1px solid var(--neutral-200)",
                whiteSpace: "nowrap",
                minWidth: 44,
                width: 48,
                backgroundColor: STICKY_BG_HEADER,
                boxSizing: "border-box",
                boxShadow: "0 1px 0 var(--neutral-200)",
              }}
            >
              {rowNumberHeader}
            </th>
            {headers.map((col, colIdx) => (
              <th
                key={colIdx}
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: Z_HEADER_CELL,
                  padding: "8px 10px",
                  textAlign: "left",
                  fontWeight: 600,
                  color: "var(--neutral-700)",
                  borderBottom: "1px solid var(--neutral-200)",
                  whiteSpace: "nowrap",
                  minWidth: 90,
                  backgroundColor: STICKY_BG_HEADER,
                  boxShadow: "0 1px 0 var(--neutral-200)",
                }}
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => {
            const rowHasError = validationErrors.some((e) => e.row === rowIndex + 1);
            const stickyBg = rowHasError ? STICKY_BG_ROW_ERROR : STICKY_BG_ROW;
            return (
              <tr
                key={rowIndex}
                style={{
                  borderBottom: rowIndex < rows.length - 1 ? "1px solid var(--neutral-100)" : "none",
                  backgroundColor: rowHasError ? "var(--error-50, #fef2f2)" : undefined,
                }}
              >
                <th
                  scope="row"
                  data-testid={`upm-preview-row-${rowIndex + 1}`}
                  style={{
                    position: "sticky",
                    left: 0,
                    zIndex: Z_BODY_ROW_LABEL,
                    padding: "6px 10px",
                    textAlign: "right",
                    fontWeight: 500,
                    fontSize: 11,
                    color: "var(--neutral-600)",
                    borderRight: "1px solid var(--neutral-200)",
                    minWidth: 44,
                    width: 48,
                    backgroundColor: stickyBg,
                    userSelect: "none",
                    verticalAlign: "middle",
                    boxSizing: "border-box",
                  }}
                >
                  {rowIndex + 1}
                </th>
                {headers.map((col, colIdx) => {
                  const hasError = validationErrors.some((e) => e.row === rowIndex + 1 && e.col === col);
                  const cellValue = row[col] ?? "";
                  return (
                    <td key={colIdx} style={{ padding: readOnly ? "6px 8px" : 2, verticalAlign: "middle" }}>
                      {readOnly ? (
                        <span
                          style={{
                            display: "block",
                            minWidth: 80,
                            fontSize: 11,
                            color: "var(--neutral-800)",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {cellValue}
                        </span>
                      ) : (
                        <input
                          type="text"
                          value={cellValue}
                          onChange={(e) => onCellEdit?.(rowIndex, col, e.target.value)}
                          style={{
                            width: "100%",
                            minWidth: 80,
                            padding: "4px 8px",
                            border: hasError ? "1px solid var(--error-400)" : "1px solid transparent",
                            borderRadius: 4,
                            fontSize: 11,
                            backgroundColor: hasError ? "var(--error-50)" : "transparent",
                            color: "var(--neutral-800)",
                            boxSizing: "border-box",
                          }}
                          aria-label={`${col} row ${rowIndex + 1}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
