/* eslint-disable @typescript-eslint/no-explicit-any */
import * as docx from "docx";

type DocxAPI = {
  Document: new (opts: any) => any;
  Packer: { toBuffer: (doc: any) => Promise<Buffer> };
  Paragraph: new (opts: any) => any;
  TextRun: new (opts: any) => any;
  Table: new (opts: any) => any;
  TableRow: new (opts: any) => any;
  TableCell: new (opts: any) => any;
  WidthType: { DXA: string };
  BorderStyle: { SINGLE: string };
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
} = docx as unknown as DocxAPI;

export interface ReportData {
  [key: string]: string | number | undefined;
}

export async function generateDocxReport(resultJson: ReportData): Promise<Buffer> {
  const rows = [
    new TableRow({
      children: [
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: "Parameter", bold: true })] })],
        }),
        new TableCell({
          width: { size: 3000, type: WidthType.DXA },
          children: [new Paragraph({ children: [new TextRun({ text: "Value", bold: true })] })],
        }),
      ],
    }),
    ...Object.entries(resultJson).map(
      ([key, value]) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              children: [new Paragraph(key)],
            }),
            new TableCell({
              width: { size: 3000, type: WidthType.DXA },
              children: [new Paragraph(String(value ?? ""))],
            }),
          ],
        })
    ),
  ];

  const table = new Table({
    width: { size: 6000, type: WidthType.DXA },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1 },
      bottom: { style: BorderStyle.SINGLE, size: 1 },
      left: { style: BorderStyle.SINGLE, size: 1 },
      right: { style: BorderStyle.SINGLE, size: 1 },
    },
    rows,
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: "Actuarial Calculation Report", bold: true, size: 32 })],
            spacing: { after: 400 },
          }),
          new Paragraph({
            children: [new TextRun({ text: "Results", bold: true, size: 28 })],
            spacing: { after: 200 },
          }),
          table,
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
