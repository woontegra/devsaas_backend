/**
 * TRAFFIC_DEATH rapor düzeni. Word ve PDF aynı blok sırasını, tablo bölünmelerini ve
 * sütun ağırlıklarını buradan alır; tasarım iki çıktıda ayrışmaz.
 */
import type { ReportGrid, TrafficDeathReportModel } from "./trafficDeathReportModel.js";

export interface TableBlock {
  kind: "table";
  grid: ReportGrid;
  /** Bu indeksten itibaren sütunlar sağa hizalanır. */
  alignRightFrom: number;
  weights: number[];
}

export type ReportBlock =
  | { kind: "title"; lines: string[] }
  | { kind: "heading"; text: string }
  | { kind: "subheading"; text: string }
  | { kind: "caption"; text: string }
  | { kind: "paragraph"; text: string; bold?: boolean; formula?: boolean }
  | { kind: "kv"; rows: Array<[string, string]> }
  | TableBlock
  /** Sayfaya sığıyorsa bölünmeden aynı sayfada tutulur. */
  | { kind: "group"; blocks: ReportBlock[] }
  | { kind: "signature"; lines: string[] };

/** Bu satır sayısına kadar tablolar bölünmez; daha uzun tablolarda başlık tekrar eder. */
export const KEEP_TOGETHER_ROWS = 14;

const NO_RIGHT = 99;

function table(grid: ReportGrid, alignRightFrom: number, weights: number[]): TableBlock {
  return { kind: "table", grid, alignRightFrom, weights };
}

export function buildTrafficDeathReportBlocks(model: TrafficDeathReportModel): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  const push = (...items: ReportBlock[]) => blocks.push(...items);

  push({ kind: "title", lines: model.titleLines }, { kind: "kv", rows: model.metaRows });

  push({ kind: "heading", text: "1. OLAY VE HESAPLAMA ÖZETİ" }, { kind: "paragraph", text: model.summary });

  push({ kind: "heading", text: "2. HESAPLAMAYA ESAS MÜTEVEFFA BİLGİLERİ" }, { kind: "kv", rows: model.deceasedRows });

  push(
    { kind: "heading", text: "3. GELİR VE KUSUR ESASLARI" },
    { kind: "subheading", text: "3.1 Gelir Bilgileri" },
    { kind: "kv", rows: model.incomeRows },
    { kind: "paragraph", text: model.incomeNote },
    { kind: "subheading", text: "3.2 Kusur ve Sorumluluk" },
    table({ columns: ["Taraf", "Oran"], rows: model.faultRows }, 1, [2, 1])
  );

  push(
    { kind: "heading", text: "4. HAK SAHİPLERİ VE DESTEK SÜRELERİ" },
    { kind: "subheading", text: "4.1 Hak Sahibi ve Yaşam Bilgileri" },
    table(model.claimantLives, NO_RIGHT, [1.45, 0.85, 0.75, 0.95, 1.3, 1.3]),
    { kind: "subheading", text: "4.2 Destek Süreleri" },
    table(model.claimantSupport, NO_RIGHT, [1.6, 1, 1, 1.3])
  );

  push(
    { kind: "heading", text: "5. PAYLAŞTIRMA ESASLARI" },
    { kind: "paragraph", text: model.shareIntro },
    { kind: "subheading", text: "A) Pay Dağılımı" },
    table(model.shareDistribution, NO_RIGHT, [1.4, 1.6, 0.8]),
    { kind: "subheading", text: "B) Yüzdesel Pay Dağılımı" },
    table(model.sharePercentages, NO_RIGHT, [1.4, 1.6, 0.8])
  );

  push({ kind: "heading", text: "6. İŞLEMİŞ DÖNEM HESABI" });
  if (model.processed) {
    push(
      { kind: "subheading", text: "6.1 İşlemiş Dönem Gelir Cetveli" },
      table(model.processed.income, 1, [2.1, 0.6, 1.15, 1.1, 1.2]),
      { kind: "subheading", text: "6.2 İşlemiş Dönem Hak Sahibi Dağılımı" },
      table(model.processed.distribution, 2, [2.1, 1.9, 0.9, 1.25])
    );
  } else if (model.processedEmpty) {
    push({ kind: "paragraph", text: model.processedEmpty });
  }

  push({ kind: "heading", text: "7. İŞLEYECEK DÖNEM HESABI" });
  if (model.future) {
    push(
      { kind: "subheading", text: "7.1 İşleyecek Dönem Hesap Cetveli" },
      table(model.future.income, 1, [2.1, 0.6, 1.1, 1.1, 1.05, 1.3]),
      { kind: "subheading", text: "7.2 İşleyecek Dönem Hak Sahibi Dağılımı" },
      table(model.future.distribution, 2, [2.1, 1.9, 0.9, 1.25])
    );
  } else if (model.futureEmpty) {
    push({ kind: "paragraph", text: model.futureEmpty });
  }

  push({ kind: "heading", text: "8. EVLENME İHTİMALİ İNDİRİMİ" });
  if (model.marriage.applied && model.marriage.main && model.marriage.summary) {
    push({
      kind: "group",
      blocks: [
        table(model.marriage.main, NO_RIGHT, [1.5, 1.35, 0.8, 0.75, 0.85, 0.85, 0.75]),
        { kind: "caption", text: "Evlenme İhtimali Hesap Özeti" },
        table(model.marriage.summary, NO_RIGHT, [0.8, 0.8, 1, 1.05, 1.35]),
        ...model.marriage.formulas.map((text): ReportBlock => ({ kind: "paragraph", text, formula: true })),
      ],
    });
  } else {
    push({ kind: "paragraph", text: model.marriage.message ?? "Evlenme ihtimali indirimi uygulanmamıştır." });
  }

  push({ kind: "heading", text: "9. SİGORTA VE KASKO MAHSUP HESABI" });
  if (model.insuranceEmpty) push({ kind: "paragraph", text: model.insuranceEmpty });
  for (const payment of model.insurance) {
    const paymentBlocks: ReportBlock[] = [
      { kind: "subheading", text: payment.title },
      { kind: "caption", text: "Ödeme Bilgileri" },
      table(
        {
          columns: ["Hak Sahibi", "Ödeme Türü", "Ana Ödeme", "Ödeme Tarihi", "Hesap Tarihi"],
          rows: [[payment.claimant, payment.kind, payment.principal, payment.paymentDate, payment.calculationDate]],
        },
        2,
        [1.6, 0.9, 1.1, 1, 1]
      ),
    ];
    if (payment.segments.length > 0) {
      paymentBlocks.push(
        { kind: "caption", text: "Faiz Dönemleri" },
        table(
          {
            columns: ["Başlangıç", "Bitiş", "Gün", "Oran", "Faiz Tutarı"],
            rows: payment.segments.map((segment) => [
              segment.start,
              segment.end,
              segment.days,
              segment.rate,
              segment.interest,
            ]),
          },
          2,
          [1, 1, 0.6, 0.7, 1.1]
        ),
        ...payment.segments.map((segment): ReportBlock => ({ kind: "paragraph", text: segment.formula, formula: true }))
      );
    }
    paymentBlocks.push(
      { kind: "paragraph", text: payment.totalInterest, formula: true },
      { kind: "paragraph", text: payment.principalLine, formula: true },
      { kind: "paragraph", text: payment.updatedLine, formula: true, bold: true }
    );
    push({ kind: "group", blocks: paymentBlocks });
  }

  push(
    { kind: "heading", text: "10. HAK SAHİBİ BAZLI DESTEKTEN YOKSUN KALMA ZARARI" },
    { kind: "subheading", text: "10.1 Hak Sahibi Bazlı Zarar Hesabı" },
    table(model.lossCalculation, 1, [1.15, 1, 1, 1, 1.08, 1.08]),
    { kind: "subheading", text: "10.2 Sigorta Mahsupları ve Kalan Zarar" },
    table(model.lossInsurance, 1, [1.6, 1, 1, 1.1])
  );

  if (model.otherItems) {
    push({ kind: "heading", text: "11. DİĞER HESAP KALEMLERİ" }, { kind: "kv", rows: model.otherItems });
  }

  push(
    { kind: "heading", text: model.conclusionTitle },
    {
      kind: "group",
      blocks: [
        table(model.finals, 3, [1.6, 0.8, 0.8, 1.2]),
        { kind: "paragraph", text: model.closing },
        { kind: "signature", lines: model.signatureLines },
      ],
    }
  );

  return blocks;
}
