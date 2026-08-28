/* eslint-disable @typescript-eslint/no-explicit-any */
import * as docx from "docx";

type DocxCtor = new (opts: any) => any;

type DocxAPI = {
  Document: DocxCtor;
  Packer: { toBuffer: (doc: any) => Promise<Buffer> };
  Paragraph: DocxCtor;
  TextRun: DocxCtor;
  Table: DocxCtor;
  TableRow: DocxCtor;
  TableCell: DocxCtor;
  WidthType: { DXA: string };
  BorderStyle: { SINGLE: string };
  AlignmentType: Record<string, string>;
  VerticalAlign: Record<string, string>;
  ShadingType: { CLEAR: string };
  Footer: DocxCtor;
  PageNumber: { CURRENT: string; TOTAL_PAGES: string };
  PageOrientation: { PORTRAIT: string };
  HeadingLevel: Record<string, string>;
  TableLayoutType: { FIXED: string; AUTOFIT: string };
};

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
  ShadingType,
  Footer,
  PageNumber,
  PageOrientation,
  HeadingLevel,
  TableLayoutType,
} = docx as unknown as DocxAPI;

export { TableLayoutType };

export {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  VerticalAlign,
  ShadingType,
  Footer,
  PageNumber,
  PageOrientation,
  HeadingLevel,
};

export const TABLE_BORDERS = {
  top: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  left: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  right: { style: BorderStyle.SINGLE, size: 1, color: "999999" },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
};

export const A4_SECTION = {
  page: {
    size: {
      orientation: PageOrientation.PORTRAIT,
      width: 11906,
      height: 16838,
    },
    margin: { top: 1440, right: 1134, bottom: 1440, left: 1134 },
  },
};

export function pageFooter(): InstanceType<DocxCtor> {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120 },
        children: [
          new TextRun({ text: "Sayfa ", size: 18, color: "666666" }),
          new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "666666" }),
        ],
      }),
    ],
  });
}

export function heading(
  text: string,
  level: string = HeadingLevel.HEADING_1
): InstanceType<DocxCtor> {
  return new Paragraph({
    heading: level,
    spacing: { before: 280, after: 120 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: level === HeadingLevel.HEADING_1 ? 32 : 26,
        color: "1A1A1A",
      }),
    ],
  });
}

export function subheading(text: string): InstanceType<DocxCtor> {
  return heading(text, HeadingLevel.HEADING_2);
}

export function bodyParagraph(
  text: string,
  opts?: { bold?: boolean; spacingAfter?: number }
): InstanceType<DocxCtor> {
  return new Paragraph({
    spacing: { after: opts?.spacingAfter ?? 160 },
    children: [new TextRun({ text, size: 22, bold: opts?.bold })],
  });
}

export function kvRow(label: string, value: string): InstanceType<DocxCtor> {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: 3200, type: WidthType.DXA },
        shading: { fill: "F4F7F7", type: ShadingType.CLEAR },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20 })] })],
      }),
      new TableCell({
        width: { size: 5800, type: WidthType.DXA },
        children: [new Paragraph({ children: [new TextRun({ text: value, size: 20 })] })],
      }),
    ],
  });
}

export function kvTable(rows: Array<[string, string]>): InstanceType<DocxCtor> {
  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: TABLE_BORDERS,
    rows: rows.map(([l, v]) => kvRow(l, v)),
  });
}

function cellText(
  text: string,
  opts?: { bold?: boolean; align?: string; header?: boolean }
): InstanceType<DocxCtor> {
  return new TableCell({
    verticalAlign: VerticalAlign.CENTER,
    shading: opts?.header ? { fill: "0F5F63", type: ShadingType.CLEAR } : undefined,
    children: [
      new Paragraph({
        alignment: opts?.align ?? AlignmentType.LEFT,
        children: [
          new TextRun({
            text,
            bold: opts?.bold ?? opts?.header,
            size: 18,
            color: opts?.header ? "FFFFFF" : "1A1A1A",
          }),
        ],
      }),
    ],
  });
}

export function dataTable(
  headers: string[],
  rows: string[][],
  totalRow?: string[]
): InstanceType<DocxCtor> {
  const tableRows: InstanceType<DocxCtor>[] = [
    new TableRow({
      tableHeader: true,
      children: headers.map((h) => cellText(h, { header: true, bold: true })),
    }),
    ...rows.map(
      (row) =>
        new TableRow({
          children: row.map((cell, i) =>
            cellText(cell, { align: i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT })
          ),
        })
    ),
  ];

  if (totalRow) {
    tableRows.push(
      new TableRow({
        children: totalRow.map((cell, i) =>
          cellText(cell, {
            bold: true,
            align: i > 0 ? AlignmentType.RIGHT : AlignmentType.LEFT,
          })
        ),
      })
    );
  }

  return new Table({
    width: { size: 9000, type: WidthType.DXA },
    borders: TABLE_BORDERS,
    rows: tableRows,
  });
}

/** Dikey A4 — işleyecek dönem cetveli (9 fiziksel kolon, TARİH gridSpan=2) */
const FUTURE_TABLE_WIDTH = 9638;
const FUTURE_COL_PCTS = [10, 10, 8, 14, 14, 10, 14, 8, 12] as const;
const FUTURE_COL_WIDTHS = (() => {
  const widths = FUTURE_COL_PCTS.map((pct) => Math.round((FUTURE_TABLE_WIDTH * pct) / 100));
  const drift = FUTURE_TABLE_WIDTH - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1]! += drift;
  return widths;
})();
const FUTURE_COL_COUNT = FUTURE_COL_WIDTHS.length;
const FUTURE_CELL_MARGIN = { top: 40, bottom: 40, left: 50, right: 50 };
const FUTURE_BODY_SIZE = 16; // 8 pt
const FUTURE_HEADER_SIZE = 16; // 8 pt

type FutureHeaderSpec = { colStart: number; colSpan: number; lines: string[] };

const FUTURE_HEADER_SPECS: readonly FutureHeaderSpec[] = [
  { colStart: 0, colSpan: 2, lines: ["TARİH"] },
  { colStart: 2, colSpan: 1, lines: ["GÜN SAYISI"] },
  { colStart: 3, colSpan: 1, lines: ["%10 ARTIŞ", "ÇARPANI KN"] },
  { colStart: 4, colSpan: 1, lines: ["%10 İSKONTO", "ÇARPANI (1/KN)"] },
  { colStart: 5, colSpan: 1, lines: ["GÜNLÜK ÜCRET"] },
  { colStart: 6, colSpan: 1, lines: ["İSKONTOLU", "DÖNEM GELİRİ"] },
  { colStart: 7, colSpan: 1, lines: ["maluliyet oranı"] },
  { colStart: 8, colSpan: 1, lines: ["iskontolu", "Dönem gelirleri"] },
];

function futureColWidthSum(colStart: number, colSpan: number): number {
  return FUTURE_COL_WIDTHS.slice(colStart, colStart + colSpan).reduce((a, b) => a + b, 0);
}

function futureBodyAlign(colIndex: number): string {
  if (colIndex <= 1) return AlignmentType.CENTER;
  if (colIndex === 2) return AlignmentType.CENTER;
  if (colIndex === 3 || colIndex === 4) return AlignmentType.CENTER;
  if (colIndex === 7) return AlignmentType.CENTER;
  return AlignmentType.RIGHT;
}

const FUTURE_BORDER_LINE = { style: BorderStyle.SINGLE, size: 1, color: "D9E5E3" };
const FUTURE_TABLE_BORDERS = {
  top: FUTURE_BORDER_LINE,
  bottom: FUTURE_BORDER_LINE,
  left: FUTURE_BORDER_LINE,
  right: FUTURE_BORDER_LINE,
  insideHorizontal: FUTURE_BORDER_LINE,
  insideVertical: FUTURE_BORDER_LINE,
};

function futureHeaderParagraph(lines: string[]): InstanceType<DocxCtor> {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 0, line: 240 },
    children: lines.flatMap((line, i) => [
      new TextRun({ text: line, bold: true, size: FUTURE_HEADER_SIZE, color: "6B7280" }),
      ...(i < lines.length - 1 ? [new TextRun({ break: 1 })] : []),
    ]),
  });
}

function futureHeaderCell(spec: FutureHeaderSpec): InstanceType<DocxCtor> {
  return new TableCell({
    columnSpan: spec.colSpan > 1 ? spec.colSpan : undefined,
    width: { size: futureColWidthSum(spec.colStart, spec.colSpan), type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: FUTURE_CELL_MARGIN,
    borders: FUTURE_TABLE_BORDERS,
    shading: { fill: "F4F7F7", type: ShadingType.CLEAR },
    children: [futureHeaderParagraph(spec.lines)],
  });
}

function futureHeaderRow(): InstanceType<DocxCtor> {
  return new TableRow({
    tableHeader: true,
    children: FUTURE_HEADER_SPECS.map((spec) => futureHeaderCell(spec)),
  });
}

function futureBodyCell(
  text: string,
  colIndex: number,
  opts?: { bold?: boolean }
): InstanceType<DocxCtor> {
  const align = futureBodyAlign(colIndex);

  return new TableCell({
    width: { size: FUTURE_COL_WIDTHS[colIndex], type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: FUTURE_CELL_MARGIN,
    borders: FUTURE_TABLE_BORDERS,
    shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
    children: [
      new Paragraph({
        alignment: align,
        spacing: { before: 0, after: 0, line: 240 },
        keepLines: colIndex >= 3 && colIndex <= 4,
        wordWrap: colIndex >= 3 && colIndex <= 4 ? false : undefined,
        children: [
          new TextRun({
            text,
            bold: opts?.bold,
            size: FUTURE_BODY_SIZE,
            color: "1A1A1A",
          }),
        ],
      }),
    ],
  });
}

function futurePhaseRow(label: string): InstanceType<DocxCtor> {
  return new TableRow({
    children: [
      new TableCell({
        columnSpan: FUTURE_COL_COUNT,
        width: { size: FUTURE_TABLE_WIDTH, type: WidthType.DXA },
        verticalAlign: VerticalAlign.CENTER,
        margins: FUTURE_CELL_MARGIN,
        borders: FUTURE_TABLE_BORDERS,
        shading: { fill: "E8F0EF", type: ShadingType.CLEAR },
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 0, after: 0, line: 240 },
            children: [new TextRun({ text: label, bold: true, size: FUTURE_BODY_SIZE, color: "0F5F63" })],
          }),
        ],
      }),
    ],
  });
}

export type FuturePeriodTableRow =
  | { kind: "data"; cells: string[] }
  | { kind: "phase"; label: string };

export function futurePeriodTable(tableRows: FuturePeriodTableRow[], totalRow?: string[]): InstanceType<DocxCtor> {
  const bodyRows: InstanceType<DocxCtor>[] = [];
  for (const row of tableRows) {
    if (row.kind === "phase") {
      bodyRows.push(futurePhaseRow(row.label));
    } else {
      bodyRows.push(
        new TableRow({
          children: row.cells.map((cell, i) => futureBodyCell(cell, i)),
        })
      );
    }
  }

  if (totalRow) {
    bodyRows.push(
      new TableRow({
        children: totalRow.map((cell, i) => futureBodyCell(cell, i, { bold: true })),
      })
    );
  }

  return new Table({
    width: { size: FUTURE_TABLE_WIDTH, type: WidthType.DXA },
    columnWidths: [...FUTURE_COL_WIDTHS],
    layout: TableLayoutType.FIXED,
    borders: FUTURE_TABLE_BORDERS,
    rows: [futureHeaderRow(), ...bodyRows],
  });
}
