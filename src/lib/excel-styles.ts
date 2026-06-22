/**
 * Shared Excel styling helper — uses xlsx-js-style cell `.s` property.
 * Call applyStyles() after aoa_to_sheet() and before book_append_sheet().
 */
import * as XLSX from "xlsx-js-style";

export interface SheetLayout {
  metaEnd:    number;     // last row (inclusive) of title/meta section → brand bg
  headerRow:  number;     // column-header row
  dataStart:  number;     // first data row
  dataEnd:    number;     // last data row
  totalRow?:  number;     // grand-total row (optional)
  amountCols: number[];   // 0-indexed columns holding SAR numbers
  accent:     string;     // 6-char hex WITHOUT # — used for total row accent
  colCount:   number;     // total number of columns in this sheet
}

// ── colour palette ──────────────────────────────────────────────────────────
const BRAND     = "1B3A6B";   // navy
const WHITE     = "FFFFFF";
const ALT_ROW   = "EEF2FF";   // soft indigo tint for even data rows
const TOTAL_BG  = "E8F0FE";   // light blue for grand-total row

// ── border helpers ──────────────────────────────────────────────────────────
type BS = { style: "thin" | "medium"; color: { rgb: string } };
const thin   = (c = "CBD5E1"): BS => ({ style: "thin",   color: { rgb: c } });
const medium = (c = BRAND):    BS => ({ style: "medium", color: { rgb: c } });
const box    = (c = "CBD5E1")  => ({ top: thin(c), bottom: thin(c), left: thin(c), right: thin(c) });

// ── main function ───────────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyStyles(ws: Record<string, any>, layout: SheetLayout): void {
  // set row heights
  if (!ws["!rows"]) ws["!rows"] = [];
  ws["!rows"][0]                = { hpt: 32 };   // title row taller
  ws["!rows"][layout.headerRow] = { hpt: 22 };

  const maxRow = Math.max(layout.dataEnd, layout.totalRow ?? 0) + 2;

  for (let R = 0; R <= maxRow; R++) {
    for (let C = 0; C < layout.colCount; C++) {
      const ref = XLSX.utils.encode_cell({ r: R, c: C });

      // ensure the cell exists (empty cells need a style too for bg fill)
      if (!ws[ref]) ws[ref] = { t: "s", v: "" };
      const cell = ws[ref];
      const isAmt = layout.amountCols.includes(C);

      // ── title / metadata rows ───────────────────────────────────────────
      if (R <= layout.metaEnd) {
        cell.s = {
          fill: { patternType: "solid", fgColor: { rgb: BRAND } },
          font: {
            bold:  R === 0,
            color: { rgb: WHITE },
            sz:    R === 0 ? 13 : 10,
            name:  "Calibri",
          },
          alignment: { horizontal: "left", vertical: "center", wrapText: true },
        };

      // ── column header row ───────────────────────────────────────────────
      } else if (R === layout.headerRow) {
        cell.s = {
          fill:      { patternType: "solid", fgColor: { rgb: BRAND } },
          font:      { bold: true, color: { rgb: WHITE }, sz: 10, name: "Calibri" },
          alignment: { horizontal: C === 0 ? "center" : isAmt ? "right" : "left", vertical: "center" },
          border:    box("9CA3AF"),
        };

      // ── data rows ───────────────────────────────────────────────────────
      } else if (R >= layout.dataStart && R <= layout.dataEnd) {
        const alt = (R - layout.dataStart) % 2 === 1;
        cell.s = {
          fill:      { patternType: "solid", fgColor: { rgb: alt ? ALT_ROW : WHITE } },
          font:      { sz: 10, name: "Calibri" },
          alignment: { horizontal: C === 0 ? "center" : isAmt ? "right" : "left", vertical: "center" },
          border:    box(),
        };
        if (isAmt && typeof cell.v === "number") {
          cell.t = "n";
          cell.z = "#,##0.00";
        }

      // ── grand-total row ─────────────────────────────────────────────────
      } else if (layout.totalRow !== undefined && R === layout.totalRow) {
        cell.s = {
          fill:      { patternType: "solid", fgColor: { rgb: TOTAL_BG } },
          font: {
            bold:  true,
            sz:    11,
            name:  "Calibri",
            color: { rgb: isAmt ? layout.accent : "1E293B" },
          },
          alignment: { horizontal: C === 0 ? "left" : isAmt ? "right" : "left", vertical: "center" },
          border: {
            top:    medium(layout.accent),
            bottom: thin(),
            left:   thin(),
            right:  thin(),
          },
        };
        if (isAmt && typeof cell.v === "number") {
          cell.t = "n";
          cell.z = "#,##0.00";
        }
      }
    }
  }
}
