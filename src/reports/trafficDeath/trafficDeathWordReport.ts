/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as docx from "docx";
import type { TrafficDeathReportModel } from "./trafficDeathReportModel.js";
import {
  buildTrafficDeathReportBlocks,
  KEEP_TOGETHER_ROWS,
  type ReportBlock,
  type TableBlock,
} from "./trafficDeathReportLayout.js";

type Ctor = new (opts: any) => any;

const api = docx as unknown as {
  Document: Ctor;
  Packer: { toBuffer: (doc: any) => Promise<Buffer> };
  Paragraph: Ctor;
  TextRun: Ctor;
  Table: Ctor;
  TableRow: Ctor;
  TableCell: Ctor;
  WidthType: { DXA: string };
  BorderStyle: { SINGLE: string };
  AlignmentType: Record<string, string>;
  VerticalAlign: Record<string, string>;
  Footer: Ctor;
  PageNumber: { CURRENT: string; TOTAL_PAGES: string };
  PageOrientation: { PORTRAIT: string };
  HeadingLevel: Record<string, string>;
  TableLayoutType: { FIXED: string };
  ImageRun: Ctor;
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
  Footer,
  PageNumber,
  PageOrientation,
  HeadingLevel,
  TableLayoutType,
  ImageRun,
} = api;

const PAGE_WIDTH = 11906;
const PAGE_HEIGHT = 16838;
const MARGIN_X = 1000;
const MARGIN_Y = 900;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN_X * 2;

const TEXT = "1A1A1A";
const RULE = "7F7F7F";

/** Yarım punto. */
const SIZE = { title: 30, heading: 25, subheading: 21, caption: 18, body: 21, formula: 20, table: 17, kv: 18, footer: 16 };

const thin = { style: BorderStyle.SINGLE, size: 4, color: RULE };
const TABLE_BORDERS = {
  top: thin,
  bottom: thin,
  left: thin,
  right: thin,
  insideHorizontal: thin,
  insideVertical: thin,
};

function assetPath(name: string): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, "assets", name),
    path.resolve(here, "../../../src/reports/trafficDeath/assets", name),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function pageFooter() {
  const run = (value: string | string[]) =>
    typeof value === "string"
      ? new TextRun({ text: value, size: SIZE.footer, color: "595959" })
      : new TextRun({ children: value, size: SIZE.footer, color: "595959" });
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          run("Aktüerya Hesaplama  ·  Sayfa "),
          run([PageNumber.CURRENT]),
          run(" / "),
          run([PageNumber.TOTAL_PAGES]),
        ],
      }),
    ],
  });
}

function para(
  text: string,
  opts?: { bold?: boolean; size?: number; after?: number; before?: number; center?: boolean; keepNext?: boolean }
) {
  return new Paragraph({
    keepNext: opts?.keepNext,
    keepLines: true,
    alignment: opts?.center ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { before: opts?.before ?? 0, after: opts?.after ?? 100 },
    children: [new TextRun({ text, bold: opts?.bold, size: opts?.size ?? SIZE.body, color: TEXT })],
  });
}

function heading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    keepNext: true,
    keepLines: true,
    spacing: { before: 260, after: 100 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "404040", space: 2 } },
    children: [new TextRun({ text, bold: true, size: SIZE.heading, color: TEXT })],
  });
}

function subheading(text: string) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    keepNext: true,
    keepLines: true,
    spacing: { before: 160, after: 60 },
    children: [new TextRun({ text, bold: true, size: SIZE.subheading, color: TEXT })],
  });
}

function caption(text: string) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 80, after: 40 },
    children: [new TextRun({ text, bold: true, size: SIZE.caption, color: TEXT })],
  });
}

function widths(total: number, weights: number[]): number[] {
  const sum = weights.reduce((acc, value) => acc + value, 0);
  const out = weights.map((weight) => Math.floor((total * weight) / sum));
  out[out.length - 1] += total - out.reduce((acc, value) => acc + value, 0);
  return out;
}

type RowRole = "header" | "body" | "total" | "firstTotal";

function cell(text: string, width: number, role: RowRole, align: string, size: number, keepNext: boolean) {
  const bold = role !== "body";
  const borders =
    role === "header"
      ? { bottom: { style: BorderStyle.SINGLE, size: 10, color: "333333" } }
      : role === "firstTotal"
        ? { top: { style: BorderStyle.SINGLE, size: 12, color: "000000" } }
        : undefined;
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 30, bottom: 30, left: 60, right: 60 },
    borders,
    children: [
      new Paragraph({
        keepNext,
        alignment: align,
        children: [new TextRun({ text: text || " ", bold, size, color: TEXT })],
      }),
    ],
  });
}

/**
 * chain: tablo bir grubun ortasında, sonraki blokla birlikte kalır.
 * auto: küçük tablo bölünmez; uzun tabloda başlık ilk satırla, son satır toplamla kalır.
 */
function gridTable(block: TableBlock, mode: "chain" | "auto"): any {
  const { grid } = block;
  const colWidths = widths(CONTENT_WIDTH, block.weights);
  const footers = grid.footer ?? [];
  const totalRows = grid.rows.length + footers.length;
  const small = totalRows <= KEEP_TOGETHER_ROWS;
  const alignOf = (index: number) => (index >= block.alignRightFrom ? AlignmentType.RIGHT : AlignmentType.LEFT);

  const header = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: grid.columns.map((label, index) =>
      cell(label, colWidths[index] ?? 100, "header", AlignmentType.CENTER, SIZE.table, true)
    ),
  });
  const body = grid.rows.map((row, rowIndex) => {
    const last = rowIndex === grid.rows.length - 1;
    const keepNext =
      mode === "chain" ||
      (small ? rowIndex < totalRows - 1 : rowIndex === 0 || (last && footers.length > 0));
    return new TableRow({
      cantSplit: true,
      children: row.map((value, index) =>
        cell(value, colWidths[index] ?? 100, "body", alignOf(index), SIZE.table, keepNext)
      ),
    });
  });
  const totals = footers.map((row, footerIndex) => {
    const keepNext = mode === "chain" || footerIndex < footers.length - 1;
    return new TableRow({
      cantSplit: true,
      children: row.map((value, index) =>
        cell(value, colWidths[index] ?? 100, footerIndex === 0 ? "firstTotal" : "total", alignOf(index), SIZE.table, keepNext)
      ),
    });
  });
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: colWidths,
    borders: TABLE_BORDERS,
    rows: [header, ...body, ...totals],
  });
}

function kvTable(rows: Array<[string, string]>, mode: "chain" | "auto") {
  const labelWidth = Math.round(CONTENT_WIDTH * 0.4);
  const valueWidth = CONTENT_WIDTH - labelWidth;
  const small = rows.length <= 16;
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    layout: TableLayoutType.FIXED,
    columnWidths: [labelWidth, valueWidth],
    borders: TABLE_BORDERS,
    rows: rows.map(([label, value], index) => {
      const keepNext = mode === "chain" || (small && index < rows.length - 1);
      return new TableRow({
        cantSplit: true,
        children: [
          cell(label, labelWidth, "body", AlignmentType.LEFT, SIZE.kv, keepNext),
          cell(value, valueWidth, "body", AlignmentType.LEFT, SIZE.kv, keepNext),
        ],
      });
    }),
  });
}

function spacer(keepNext: boolean) {
  return para("", { size: 8, after: 60, keepNext });
}

function renderBlock(block: ReportBlock, chain: boolean, out: any[]): void {
  switch (block.kind) {
    case "title": {
      const emblem = assetPath("emblem.png");
      if (emblem) {
        out.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [
              new ImageRun({ type: "png", data: fs.readFileSync(emblem), transformation: { width: 26, height: 26 } }),
            ],
          })
        );
      }
      block.lines.forEach((line, index) => {
        out.push(
          para(line, {
            bold: true,
            size: SIZE.title,
            center: true,
            after: index === block.lines.length - 1 ? 240 : 30,
            keepNext: true,
          })
        );
      });
      return;
    }
    case "heading":
      out.push(heading(block.text));
      return;
    case "subheading":
      out.push(subheading(block.text));
      return;
    case "caption":
      out.push(caption(block.text));
      return;
    case "paragraph":
      out.push(
        para(block.text, {
          bold: block.bold,
          size: block.formula ? SIZE.formula : SIZE.body,
          after: block.formula ? 20 : 100,
          before: 0,
          keepNext: chain,
        })
      );
      return;
    case "kv":
      out.push(kvTable(block.rows, chain ? "chain" : "auto"), spacer(chain));
      return;
    case "table":
      out.push(gridTable(block, chain ? "chain" : "auto"), spacer(chain));
      return;
    case "signature":
      out.push(para("", { size: 8, after: 160, keepNext: true }));
      block.lines.forEach((line, index) => {
        out.push(para(line, { after: 80, keepNext: chain || index < block.lines.length - 1 }));
      });
      return;
    case "group": {
      block.blocks.forEach((child, index) => {
        renderBlock(child, chain || index < block.blocks.length - 1, out);
      });
      if (!chain) out.push(para("", { size: 8, after: 80 }));
      return;
    }
  }
}

export async function generateTrafficDeathWordReport(model: TrafficDeathReportModel): Promise<Buffer> {
  const children: any[] = [];
  for (const block of buildTrafficDeathReportBlocks(model)) renderBlock(block, false, children);

  const document = new Document({
    styles: {
      default: {
        document: { run: { font: "Calibri", size: SIZE.body, color: TEXT } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { orientation: PageOrientation.PORTRAIT, width: PAGE_WIDTH, height: PAGE_HEIGHT },
            margin: { top: MARGIN_Y, right: MARGIN_X, bottom: MARGIN_Y, left: MARGIN_X },
          },
        },
        footers: { default: pageFooter() },
        children,
      },
    ],
  });
  return Packer.toBuffer(document);
}
