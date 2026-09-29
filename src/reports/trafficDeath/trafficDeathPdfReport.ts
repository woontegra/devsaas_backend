import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import type { TrafficDeathReportModel } from "./trafficDeathReportModel.js";
import {
  buildTrafficDeathReportBlocks,
  KEEP_TOGETHER_ROWS,
  type ReportBlock,
  type TableBlock,
} from "./trafficDeathReportLayout.js";

const require = createRequire(import.meta.url);
const PDFDocument = require("pdfkit") as new (opts: Record<string, unknown>) => PdfDoc;

interface PdfDoc {
  page: { width: number; height: number; margins: { top: number; bottom: number; left: number; right: number } };
  x: number;
  y: number;
  font(name: string): PdfDoc;
  fontSize(size: number): PdfDoc;
  fillColor(color: string): PdfDoc;
  strokeColor(color: string): PdfDoc;
  lineWidth(width: number): PdfDoc;
  text(value: string, x?: number, y?: number, opts?: Record<string, unknown>): PdfDoc;
  heightOfString(value: string, opts?: Record<string, unknown>): number;
  rect(x: number, y: number, w: number, h: number): PdfDoc;
  stroke(color?: string): PdfDoc;
  image(src: string, x: number, y: number, opts?: Record<string, unknown>): PdfDoc;
  addPage(opts?: Record<string, unknown>): PdfDoc;
  registerFont(name: string, src: string): PdfDoc;
  bufferedPageRange(): { start: number; count: number };
  switchToPage(index: number): PdfDoc;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  on(event: string, cb: (value?: unknown) => void): PdfDoc;
  end(): void;
}

const MARGIN = { top: 46, bottom: 48, left: 50, right: 50 };
const TEXT = "#1A1A1A";
const RULE = "#7F7F7F";
const SIZE = { title: 14.5, heading: 12, subheading: 10.2, caption: 8.8, body: 10, formula: 9.6, table: 8.5, kv: 9 };
const CELL_PAD_X = 2.5;
const CELL_PAD_Y = 3.5;
const TABLE_GAP = 8;

function resolveAsset(parts: string[]): string | null {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(here, ...parts),
    path.resolve(here, "../../../src/reports/trafficDeath", ...parts),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

class PdfLayout {
  constructor(private readonly doc: PdfDoc) {}

  get width(): number {
    return this.doc.page.width - this.doc.page.margins.left - this.doc.page.margins.right;
  }

  get left(): number {
    return this.doc.page.margins.left;
  }

  get bottom(): number {
    return this.doc.page.height - this.doc.page.margins.bottom;
  }

  get pageContentHeight(): number {
    return this.doc.page.height - MARGIN.top - MARGIN.bottom;
  }

  newPage(): void {
    this.doc.addPage({ size: "A4", layout: "portrait", margins: MARGIN });
    this.doc.x = this.left;
    this.doc.y = this.doc.page.margins.top;
  }

  ensure(height: number): void {
    if (this.doc.y + height <= this.bottom) return;
    if (this.doc.y <= this.doc.page.margins.top + 1) return;
    this.newPage();
  }

  textHeight(text: string, font: string, size: number, width = this.width): number {
    this.doc.font(font).fontSize(size);
    return this.doc.heightOfString(text || " ", { width });
  }

  columnWidths(weights: number[]): number[] {
    const sum = weights.reduce((acc, value) => acc + value, 0);
    const out = weights.map((weight) => Math.floor((this.width * weight) / sum));
    out[out.length - 1] += this.width - out.reduce((acc, value) => acc + value, 0);
    return out;
  }

  rowHeight(cells: string[], colWidths: number[], font: string, size: number): number {
    let max = 0;
    cells.forEach((value, index) => {
      const height = this.textHeight(value, font, size, Math.max(8, (colWidths[index] ?? 8) - CELL_PAD_X * 2));
      if (height > max) max = height;
    });
    return max + CELL_PAD_Y * 2;
  }

  paintRow(
    cells: string[],
    colWidths: number[],
    height: number,
    font: string,
    size: number,
    aligns: Array<"left" | "right" | "center">
  ): void {
    const { doc } = this;
    const y = doc.y;
    let x = this.left;
    cells.forEach((value, index) => {
      const width = colWidths[index] ?? 8;
      doc.lineWidth(0.5).strokeColor(RULE).rect(x, y, width, height).stroke();
      doc.font(font).fontSize(size).fillColor(TEXT);
      doc.text(value || " ", x + CELL_PAD_X, y + CELL_PAD_Y, {
        width: Math.max(8, width - CELL_PAD_X * 2),
        align: aligns[index] ?? "left",
        lineBreak: true,
      });
      x += width;
    });
    doc.x = this.left;
    doc.y = y + height;
  }

  rule(y: number, width: number, color: string): void {
    this.doc.lineWidth(width).strokeColor(color).moveTo(this.left, y).lineTo(this.left + this.width, y).stroke();
  }

  tableHeights(block: TableBlock): { header: number; rows: number[]; footers: number[] } {
    const colWidths = this.columnWidths(block.weights);
    return {
      header: this.rowHeight(block.grid.columns, colWidths, "bold", SIZE.table),
      rows: block.grid.rows.map((row) => this.rowHeight(row, colWidths, "body", SIZE.table)),
      footers: (block.grid.footer ?? []).map((row) => this.rowHeight(row, colWidths, "bold", SIZE.table)),
    };
  }

  kvHeights(rows: Array<[string, string]>): number[] {
    const colWidths = this.kvWidths();
    return rows.map((row) => this.rowHeight(row, colWidths, "body", SIZE.kv));
  }

  kvWidths(): number[] {
    const label = Math.round(this.width * 0.4);
    return [label, this.width - label];
  }

  /** Bloğun tamamının yüksekliği. */
  blockHeight(block: ReportBlock): number {
    switch (block.kind) {
      case "title":
        return 34 + block.lines.reduce((sum, line) => sum + this.textHeight(line, "bold", SIZE.title) + 2, 0) + 14;
      case "heading":
        return this.textHeight(block.text, "bold", SIZE.heading) + 20;
      case "subheading":
        return this.textHeight(block.text, "bold", SIZE.subheading) + 10;
      case "caption":
        return this.textHeight(block.text, "bold", SIZE.caption) + 6;
      case "paragraph":
        return this.textHeight(block.text, block.bold ? "bold" : "body", block.formula ? SIZE.formula : SIZE.body) +
          (block.formula ? 2 : 6);
      case "kv":
        return this.kvHeights(block.rows).reduce((sum, value) => sum + value, 0) + TABLE_GAP;
      case "table": {
        const heights = this.tableHeights(block);
        return heights.header + [...heights.rows, ...heights.footers].reduce((sum, value) => sum + value, 0) + TABLE_GAP;
      }
      case "signature":
        return 16 + block.lines.reduce((sum, line) => sum + this.textHeight(line, "body", SIZE.body) + 5, 0);
      case "group":
        return block.blocks.reduce((sum, child) => sum + this.blockHeight(child), 0) + 6;
    }
  }

  /** Önceki başlıkla aynı sayfada kalması gereken en az yükseklik. */
  keepHeight(blocks: ReportBlock[], index: number): number {
    const block = blocks[index];
    if (!block) return 0;
    switch (block.kind) {
      case "heading":
      case "subheading":
      case "caption":
        return this.blockHeight(block) + this.keepHeight(blocks, index + 1);
      case "kv": {
        const heights = this.kvHeights(block.rows);
        return heights.length <= 16
          ? heights.reduce((sum, value) => sum + value, 0)
          : (heights[0] ?? 0) + (heights[1] ?? 0);
      }
      case "table": {
        const heights = this.tableHeights(block);
        if (heights.rows.length + heights.footers.length <= KEEP_TOGETHER_ROWS) {
          return this.blockHeight(block) - TABLE_GAP;
        }
        return heights.header + (heights.rows[0] ?? 0);
      }
      case "group": {
        const full = this.blockHeight(block);
        return full <= this.pageContentHeight ? full : this.keepHeight(block.blocks, 0);
      }
      default:
        return this.blockHeight(block);
    }
  }
}

function drawTable(doc: PdfDoc, layout: PdfLayout, block: TableBlock): void {
  const { grid } = block;
  const colWidths = layout.columnWidths(block.weights);
  const heights = layout.tableHeights(block);
  const footers = grid.footer ?? [];
  const footersHeight = heights.footers.reduce((sum, value) => sum + value, 0);
  const aligns = grid.columns.map((_, index) => (index >= block.alignRightFrom ? "right" : "left")) as Array<
    "left" | "right"
  >;
  if (grid.rows.length + footers.length <= KEEP_TOGETHER_ROWS) {
    layout.ensure(layout.blockHeight(block) - TABLE_GAP);
  } else {
    layout.ensure(heights.header + (heights.rows[0] ?? 0));
  }
  const drawHeader = () => {
    layout.paintRow(grid.columns, colWidths, heights.header, "bold", SIZE.table, grid.columns.map(() => "center"));
    layout.rule(doc.y, 1, "#333333");
  };
  drawHeader();
  grid.rows.forEach((row, index) => {
    const height = heights.rows[index] ?? 0;
    const need = height + (index === grid.rows.length - 1 ? footersHeight : 0);
    if (doc.y + need > layout.bottom) {
      layout.newPage();
      drawHeader();
    }
    layout.paintRow(row, colWidths, height, "body", SIZE.table, aligns);
  });
  footers.forEach((row, index) => {
    const height = heights.footers[index] ?? 0;
    if (doc.y + height > layout.bottom) {
      layout.newPage();
      drawHeader();
    }
    const top = doc.y;
    layout.paintRow(row, colWidths, height, "bold", SIZE.table, aligns);
    if (index === 0) layout.rule(top, 1.2, "#000000");
  });
  doc.y += TABLE_GAP;
}

function drawKv(doc: PdfDoc, layout: PdfLayout, rows: Array<[string, string]>): void {
  const colWidths = layout.kvWidths();
  const heights = layout.kvHeights(rows);
  if (rows.length <= 16) layout.ensure(heights.reduce((sum, value) => sum + value, 0));
  rows.forEach((row, index) => {
    const height = heights[index] ?? 0;
    layout.ensure(height);
    layout.paintRow(row, colWidths, height, "body", SIZE.kv, ["left", "left"]);
  });
  doc.y += TABLE_GAP;
}

function drawText(doc: PdfDoc, layout: PdfLayout, text: string, font: string, size: number, after: number): void {
  doc.font(font).fontSize(size).fillColor(TEXT);
  doc.text(text, layout.left, doc.y, { width: layout.width, align: "left" });
  doc.y += after;
  doc.x = layout.left;
}

function drawBlocks(doc: PdfDoc, layout: PdfLayout, blocks: ReportBlock[]): void {
  blocks.forEach((block, index) => {
    switch (block.kind) {
      case "title": {
        const emblem = resolveAsset(["assets", "emblem.png"]);
        if (emblem) {
          doc.image(emblem, (doc.page.width - 26) / 2, doc.y, { width: 26, height: 26 });
          doc.y += 34;
        }
        for (const line of block.lines) {
          doc.font("bold").fontSize(SIZE.title).fillColor(TEXT);
          doc.text(line, layout.left, doc.y, { width: layout.width, align: "center" });
          doc.y += 2;
        }
        doc.y += 14;
        return;
      }
      case "heading": {
        layout.ensure(layout.blockHeight(block) + layout.keepHeight(blocks, index + 1));
        doc.y += 8;
        drawText(doc, layout, block.text, "bold", SIZE.heading, 0);
        layout.rule(doc.y + 2, 0.6, "#404040");
        doc.y += 10;
        return;
      }
      case "subheading":
        layout.ensure(layout.blockHeight(block) + layout.keepHeight(blocks, index + 1));
        doc.y += 4;
        drawText(doc, layout, block.text, "bold", SIZE.subheading, 6);
        return;
      case "caption":
        layout.ensure(layout.blockHeight(block) + layout.keepHeight(blocks, index + 1));
        drawText(doc, layout, block.text, "bold", SIZE.caption, 4);
        return;
      case "paragraph":
        layout.ensure(layout.blockHeight(block));
        drawText(
          doc,
          layout,
          block.text,
          block.bold ? "bold" : "body",
          block.formula ? SIZE.formula : SIZE.body,
          block.formula ? 2 : 6
        );
        return;
      case "kv":
        drawKv(doc, layout, block.rows);
        return;
      case "table":
        drawTable(doc, layout, block);
        return;
      case "signature":
        layout.ensure(layout.blockHeight(block));
        doc.y += 16;
        for (const line of block.lines) drawText(doc, layout, line, "body", SIZE.body, 5);
        return;
      case "group": {
        const full = layout.blockHeight(block);
        if (full <= layout.pageContentHeight) layout.ensure(full);
        drawBlocks(doc, layout, block.blocks);
        doc.y += 6;
        return;
      }
    }
  });
}

export async function generateTrafficDeathPdfReport(model: TrafficDeathReportModel): Promise<Buffer> {
  const regular = resolveAsset(["fonts", "DejaVuSans.ttf"]);
  const bold = resolveAsset(["fonts", "DejaVuSans-Bold.ttf"]);
  if (!regular || !bold) {
    throw new Error("PDF yazı tipi bulunamadı.");
  }
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margins: MARGIN,
    bufferPages: true,
    info: { Title: "Trafik Kazası Destekten Yoksun Kalma Tazminatı Hesap Raporu" },
  }) as PdfDoc;
  doc.registerFont("body", regular);
  doc.registerFont("bold", bold);

  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: unknown) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    });
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", (err: unknown) => reject(err));
  });

  drawBlocks(doc, new PdfLayout(doc), buildTrafficDeathReportBlocks(model));

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    const saved = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("body").fontSize(8).fillColor("#595959");
    doc.text(
      `Aktüerya Hesaplama  ·  Sayfa ${index - range.start + 1} / ${range.count}`,
      MARGIN.left,
      doc.page.height - 28,
      { width: doc.page.width - MARGIN.left - MARGIN.right, align: "center", lineBreak: false }
    );
    doc.page.margins.bottom = saved;
  }
  doc.end();
  return done;
}
