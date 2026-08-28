import type { DefendantParty, DefendantType, IncomeMode, TrafficInjuryDraft } from "../../calculations/types.js";
import type { TrafficInjuryCalculationResult, TrafficInjuryPeriodRow, InsuranceDeductionGroup } from "../../calculations/trafficInjury/types.js";
import { isGarameEnabled } from "../../calculations/trafficInjury/insuranceGarame.js";
import {
  A4_SECTION,
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TextRun,
  bodyParagraph,
  dataTable,
  futurePeriodTable,
  heading,
  kvTable,
  pageFooter,
  subheading,
  type FuturePeriodTableRow,
} from "./docxLayout.js";
import {
  formatDateIso,
  formatDecimalYears,
  formatAgeYmd,
  formatKn8,
  formatMoney,
  formatMoneyPlain,
  formatPercent,
  formatReportTimestamp,
  formatTrhYmd,
} from "./reportFormat.js";

const DEFENDANT_LABELS: Record<DefendantType, string> = {
  INDIVIDUAL_DRIVER: "Gerçek Kişi Şoför",
  INDIVIDUAL_VEHICLE_OWNER: "Gerçek Kişi Araç Sahibi",
  CORPORATE_VEHICLE_OWNER: "Tüzel Kişi Araç Sahibi",
  COMPULSORY_TRAFFIC_INSURER: "Zorunlu Trafik Sigortacısı",
  CASCO_INSURER: "Kasko Sigortacısı",
};

const INCOME_MODE_LABELS: Record<IncomeMode, string> = {
  minWage: "Net asgari ücret",
  fixed: "Sabit net gelir",
  average: "Ortalama net gelir",
};

function defendantDisplayName(d: DefendantParty): string {
  const typeLabel = DEFENDANT_LABELS[d.type] ?? d.type;
  const name =
    d.organizationName?.trim() ||
    [d.firstName, d.lastName].filter(Boolean).join(" ").trim() ||
    "—";
  return `${name} (${typeLabel})`;
}

function plaintiffName(draft: TrafficInjuryDraft): string {
  const p = draft.parties.plaintiff;
  return [p.firstName, p.lastName].filter(Boolean).join(" ").trim() || "—";
}

function genderLabel(g: string): string {
  if (g === "FEMALE") return "Kadın";
  if (g === "MALE") return "Erkek";
  return "—";
}

function tempPeriodsSummary(draft: TrafficInjuryDraft): string {
  const filled = draft.temporaryIncapacityPeriods.filter((p) => p.startDate && p.endDate);
  if (filled.length === 0) return "Geçici iş göremezlik dönemi girilmemiştir.";
  return filled
    .map((p) => `${formatDateIso(p.startDate)} – ${formatDateIso(p.endDate)}`)
    .join("; ");
}

function incomeMethodDescription(draft: TrafficInjuryDraft, result: TrafficInjuryCalculationResult): string {
  const mode = result.resolvedIncome.incomeMode;
  const label = INCOME_MODE_LABELS[mode] ?? mode;
  const lines = [label];
  if (mode === "fixed" && draft.accidentIncome.fixedAmount != null) {
    lines.push(`Beyan edilen sabit aylık net: ${formatMoney(draft.accidentIncome.fixedAmount)}`);
  }
  if (mode === "average" && draft.accidentIncome.averageNetResult != null) {
    lines.push(`Hesaplanan ortalama aylık net: ${formatMoney(draft.accidentIncome.averageNetResult)}`);
  }
  return lines.join(". ");
}

function periodicWagesDescription(result: TrafficInjuryCalculationResult): string {
  const amounts = new Set<number>();
  if (result.resolvedIncome.monthlyNetAtEvent > 0) {
    amounts.add(result.resolvedIncome.monthlyNetAtEvent);
  }
  if (result.resolvedIncome.monthlyNetAtCalculation > 0) {
    amounts.add(result.resolvedIncome.monthlyNetAtCalculation);
  }
  for (const row of result.processedPeriods) {
    if (row.monthlyNetIncome > 0) amounts.add(row.monthlyNetIncome);
  }
  if (amounts.size === 0) return "—";
  return [...amounts]
    .sort((a, b) => a - b)
    .map((a) => formatMoney(a))
    .join("; ");
}

function coefficientDescription(result: TrafficInjuryCalculationResult): string {
  const c = result.resolvedIncome.coefficient;
  if (c == null || !Number.isFinite(c) || Math.abs(c - 1) < 0.0001) {
    return "Asgari ücret üstü katsayı uygulanmamıştır.";
  }
  return `Kaza tarihindeki net asgari ücrete göre hesaplanan katsayı: ${c.toLocaleString("tr-TR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}. Hesap tarihindeki aylık net gelir bu katsayı ile kaza tarihi asgari ücret dönemine uyarlanmıştır.`;
}

function legalInterestDeductionBlock(title: string, group: InsuranceDeductionGroup): Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> {
  if (group.rows.length === 0) return [];

  const blocks: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    subheading(title),
    bodyParagraph("Ana Para × Yasal Faiz Oranı × Gün Sayısı / 36500 = Faiz", { spacingAfter: 80 }),
  ];

  group.rows.forEach((row, index) => {
    blocks.push(
      bodyParagraph(`Ödeme ${index + 1}`, { spacingAfter: 60 }),
      kvTable([
        ["Ödeme tarihi", formatDateIso(row.paymentDate)],
        ["Hesap tarihi", formatDateIso(row.calculationDate)],
        ["Ana para", formatMoney(row.principalAmount)],
        ["Toplam gün", String(row.calendarDayCount)],
        ["Toplam faiz", formatMoney(row.interestAmount)],
        ["Faizli toplam", formatMoney(row.principalPlusInterest)],
      ])
    );

    if (row.interestSegments.length > 0) {
      blocks.push(
        dataTable(
          ["Dönem", "Oran", "Gün", "Segment faizi"],
          row.interestSegments.map((seg) => [
            `${formatDateIso(seg.startDate)} – ${formatDateIso(seg.endDate)}`,
            formatPercent(seg.annualRatePercent),
            String(seg.calendarDayCount),
            formatMoney(seg.interestAmount),
          ])
        )
      );
    }
  });

  blocks.push(
    kvTable([
      ["Ana para toplamı", formatMoney(group.principalTotal)],
      ["Faiz toplamı", formatMoney(group.interestTotal)],
      ["Mahsup toplamı", formatMoney(group.deductionTotal)],
    ])
  );

  return blocks;
}

function buildConclusionParagraph(draft: TrafficInjuryDraft, result: TrafficInjuryCalculationResult): string {
  const c = draft.common;
  const ins = result.insuranceDeductions;
  const hasInsurance = ins.zmts.deductionTotal > 0 || ins.casco.deductionTotal > 0;
  const insurancePart = hasInsurance
    ? `ZMTS faizli mahsup ${formatMoney(ins.zmts.deductionTotal)}, Kasko faizli mahsup ${formatMoney(ins.casco.deductionTotal)} düşülmesi sonucunda sigorta ödemeleri sonrası tazminat ${formatMoney(result.finalCompensationAfterInsurance)} olarak hesaplanmıştır. `
    : "";
  return (
    `Yukarıda ${formatDateIso(c.eventDate)} kaza tarihi ve ${formatDateIso(c.calculationDate)} hesap tarihi esas alınarak, ` +
    `TRH-2010 yaşam tablosu ve girilen gelir/maluliyet verileri çerçevesinde yapılan aktüerya hesabında; ` +
    `geçici iş göremezlik zararı ${formatMoney(result.temporaryIncapacityTotal)}, ` +
    `işlemiş dönem sürekli iş göremezlik zararı ${formatMoney(result.processedPermanentTotal)}, ` +
    `işleyecek dönem sürekli iş göremezlik zararı ${formatMoney(result.futurePermanentTotal)} olmak üzere ` +
    `toplam zarar ${formatMoney(result.totalDamageBeforeFault)} olarak hesaplanmıştır. ` +
    `Davacı kusur oranı ${formatPercent(result.injuredFaultRate)} uygulanması sonucunda kusur sonrası zarar ${formatMoney(result.totalAfterFault)}, ` +
    `toplam ${formatMoney(result.psdTotal)} tutarındaki pasif dönem geliri (PSD) mahsup edilmesi sonucunda ` +
    `PSD sonrası zarar ${formatMoney(result.totalAfterPSD)}; sigorta/garame öncesi nihai tazminat ${formatMoney(result.finalCompensationBeforeInsurance)} olarak tespit edilmiştir. ` +
    insurancePart +
    `Bu rapor, hesap motoru çıktısının özetidir; kullanıcı gerekli gördüğü hallerde metni düzenleyebilir.`
  );
}

function tempTable(result: TrafficInjuryCalculationResult): InstanceType<typeof Table> {
  const rows = result.temporaryIncapacityPeriods;
  if (rows.length === 0) {
    return dataTable(
      ["Başlangıç", "Bitiş", "Gün", "Aylık net", "Günlük net", "Oran", "Dönem zararı"],
      [["—", "—", "—", "—", "—", "—", "Dönem yok"]]
    );
  }
  return dataTable(
    ["Başlangıç", "Bitiş", "Gün", "Aylık net", "Günlük net", "Oran", "Dönem zararı"],
    rows.map((r) => tempRowCells(r)),
    ["", "", "", "", "", "Alt toplam", formatMoney(result.temporaryIncapacityTotal)]
  );
}

function tempRowCells(r: TrafficInjuryPeriodRow): string[] {
  return [
    formatDateIso(r.startDate),
    formatDateIso(r.endDate),
    String(r.dayCount),
    formatMoney(r.monthlyNetIncome),
    formatMoney(r.dailyNetIncome),
    formatPercent(r.disabilityRate),
    formatMoney(r.periodDamage),
  ];
}

function processedTable(result: TrafficInjuryCalculationResult): InstanceType<typeof Table> {
  const rows = result.processedPeriods.filter((r) => r.periodKind === "processed_permanent");
  if (rows.length === 0) {
    return dataTable(
      ["Başlangıç", "Bitiş", "Gün", "Aylık net", "Günlük net", "Maluliyet %", "Dönem zararı"],
      [["—", "—", "—", "—", "—", "—", "Dönem yok"]]
    );
  }
  return dataTable(
    ["Başlangıç", "Bitiş", "Gün", "Aylık net", "Günlük net", "Maluliyet %", "Dönem zararı"],
    rows.map((r) => [
      formatDateIso(r.startDate),
      formatDateIso(r.endDate),
      String(r.dayCount),
      formatMoney(r.monthlyNetIncome),
      formatMoney(r.dailyNetIncome),
      formatPercent(r.disabilityRate),
      formatMoney(r.periodDamage),
    ]),
    ["", "", "", "", "", "Alt toplam", formatMoney(result.processedPermanentTotal)]
  );
}

function formatPhaseLabel(phase: "ACTIVE" | "PASSIVE" | undefined): string {
  if (phase === "ACTIVE") return "Aktif Dönem";
  if (phase === "PASSIVE") return "Pasif Dönem";
  return "—";
}

function buildFutureTableRows(rows: TrafficInjuryPeriodRow[]): FuturePeriodTableRow[] {
  const out: FuturePeriodTableRow[] = [];
  let lastPhase: "ACTIVE" | "PASSIVE" | undefined;

  for (const r of rows) {
    if (r.phase && r.phase !== lastPhase) {
      const hasBothPhases =
        rows.some((x) => x.phase === "ACTIVE") && rows.some((x) => x.phase === "PASSIVE");
      if (hasBothPhases) {
        out.push({ kind: "phase", label: formatPhaseLabel(r.phase) });
      }
      lastPhase = r.phase;
    }

    out.push({
      kind: "data",
      cells: [
        formatDateIso(r.startDate),
        formatDateIso(r.endDate),
        String(r.dayCount),
        formatKn8(r.kn),
        formatKn8(r.discountFactor),
        formatMoneyPlain(r.dailyNetIncome),
        formatMoneyPlain(r.discountedIncome),
        formatPercent(r.disabilityRate),
        formatMoneyPlain(r.periodDamage),
      ],
    });
  }

  return out;
}

function futureTable(result: TrafficInjuryCalculationResult): InstanceType<typeof Table> {
  const rows = result.futurePeriods;
  if (rows.length === 0) {
    return futurePeriodTable([
      {
        kind: "data",
        cells: ["—", "—", "—", "—", "—", "—", "—", "—", "Dönem yok"],
      },
    ]);
  }
  return futurePeriodTable(buildFutureTableRows(rows), [
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "Alt toplam",
    formatMoneyPlain(result.futurePermanentTotal),
  ]);
}

function insuranceSection(
  draft: TrafficInjuryDraft,
  result: TrafficInjuryCalculationResult
): Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> {
  const zmts = draft.zmtsPayments.filter((p) => p.paymentDate || p.paymentAmount > 0);
  const casco = draft.cascoPayments.filter((p) => p.paymentDate || p.paymentAmount > 0);
  const hasGarame = [...zmts, ...casco].some(isGarameEnabled);

  if (zmts.length === 0 && casco.length === 0) {
    return [bodyParagraph("Girilen ZMTS/Kasko ödeme kaydı bulunmamaktadır.")];
  }

  const blocks: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    bodyParagraph(
      hasGarame
        ? "Aşağıdaki sigorta ödeme ve limit bilgileri dosya verisinden aktarılmıştır. Garame alt bölümleri yalnızca garame hesabı açık kayıtlar için gösterilir; nihai garame hesabı bu fazda uygulanmamaktadır."
        : "Aşağıdaki sigorta ödeme ve limit bilgileri dosya verisinden aktarılmıştır. Nihai sigorta mahsubu/garame hesabı bu fazda uygulanmamaktadır.",
      { spacingAfter: 120 }
    ),
  ];

  const garamePersonLabel = (entry: NonNullable<(typeof zmts)[0]["garameEntries"]>[0]) => {
    if (entry.subjectRef === "plaintiff") return "Davacı";
    return entry.externalPersonLabel?.trim() || "—";
  };

  const addPayments = (title: string, records: typeof zmts) => {
    if (records.length === 0) return;
    blocks.push(subheading(title));
    blocks.push(
      dataTable(
        ["Ödeme tarihi", "Ödeme tutarı", "Kişi başı limit", "Kaza başı limit", "Garame"],
        records.map((p) => [
          formatDateIso(p.paymentDate),
          formatMoney(p.paymentAmount),
          formatMoney(p.liabilityLimit),
          p.accidentLimit != null ? formatMoney(p.accidentLimit) : "—",
          isGarameEnabled(p) ? "Evet" : "Hayır",
        ])
      )
    );

    records.forEach((p, index) => {
      if (!isGarameEnabled(p)) return;
      const entries = p.garameEntries ?? [];
      blocks.push(subheading(`${title} — Garame (Kayıt ${index + 1})`));
      if (entries.length === 0) {
        blocks.push(bodyParagraph("Garame satırı girilmemiş.", { spacingAfter: 80 }));
        return;
      }
      blocks.push(
        dataTable(
          ["Kişi / tanım"],
          entries.map((e) => [garamePersonLabel(e)])
        )
      );
    });
  };

  addPayments("ZMTS Kayıtları", zmts);
  addPayments("Kasko Kayıtları", casco);

  blocks.push(...legalInterestDeductionBlock("ZMTS — Yasal Faiz Hesabı", result.insuranceDeductions.zmts));
  blocks.push(...legalInterestDeductionBlock("Kasko — Yasal Faiz Hesabı", result.insuranceDeductions.casco));

  return blocks;
}

export function buildTrafficInjuryWordDocument(
  draft: TrafficInjuryDraft,
  result: TrafficInjuryCalculationResult
): InstanceType<typeof Document> {
  const le = result.lifeExpectancy;
  const liabilityLines =
    draft.liability.parties.length > 0
      ? draft.liability.parties.map((p) => `${p.name}: ${formatPercent(p.faultRatio)}`).join("; ")
      : "—";

  const children: Array<InstanceType<typeof Paragraph> | InstanceType<typeof Table>> = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "AKTÜERYA HESAP RAPORU", bold: true, size: 36, color: "0F5F63" })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
      children: [
        new TextRun({ text: "Hesap türü: Trafik Kazası Yaralanma", size: 24, color: "444444" }),
      ],
    }),

    heading("2. Dosya / Taraflar"),
    kvTable([
      ["Dosya adı", draft.common.internalFileName?.trim() || "—"],
      ["Mahkeme", draft.common.courtName?.trim() || "—"],
      ["Esas no", draft.common.caseNumber?.trim() || "—"],
      ["Davacı", plaintiffName(draft)],
      [
        "Davalılar",
        draft.parties.defendants.length > 0
          ? draft.parties.defendants.map(defendantDisplayName).join("; ")
          : "—",
      ],
      ["Kaza tarihi", formatDateIso(draft.common.eventDate)],
      ["Hesap tarihi", formatDateIso(draft.common.calculationDate)],
    ]),

    heading("3. Davacı Bilgileri"),
    kvTable([
      ["Ad soyad", plaintiffName(draft)],
      ["Doğum tarihi", formatDateIso(draft.parties.plaintiff.birthDate)],
      ["Cinsiyet", genderLabel(draft.parties.plaintiff.gender)],
      [
        "Kaza tarihindeki tamamlanmış yaş",
        formatAgeYmd(le.ageAtAccident),
      ],
    ]),

    heading("4. Kusur ve Maluliyet"),
    kvTable([
      ["Davacı kusur oranı", formatPercent(result.injuredFaultRate)],
      ["Davalı kusur oranları", liabilityLines],
      ["Maluliyet oranı", formatPercent(result.permanentDisabilityRate)],
      ["Maluliyet başlangıç tarihi", formatDateIso(draft.disability.disabilityStartDate)],
      ["Geçici iş göremezlik dönemleri", tempPeriodsSummary(draft)],
    ]),

    heading("5. Gelir Tespiti"),
    kvTable([
      ["Gelir yöntemi", incomeMethodDescription(draft, result)],
      ["Kaza tarihindeki aylık net gelir", formatMoney(result.resolvedIncome.monthlyNetAtEvent)],
      ["Hesap tarihindeki aylık net gelir", formatMoney(result.resolvedIncome.monthlyNetAtCalculation)],
      ["Kullanılan dönemsel net ücretler", periodicWagesDescription(result)],
      ["Günlük net ücret (hesap tarihi)", formatMoney(result.dailyNetIncome)],
      ["Katsayı / açıklama", coefficientDescription(result)],
    ]),

    heading("6. TRH-2010"),
    kvTable([
      ["Ondalıklı bakiye ömür", formatDecimalYears(le.decimalLifeExpectancy)],
      ["Yıl/ay/gün bakiye ömür", formatTrhYmd(le.lifeExpectancyYmd)],
      ["Muhtemel ömür sonu", formatDateIso(result.probableLifeEndDate)],
      ["Pasif dönem başlangıcı", formatDateIso(result.passivePhaseStartDate)],
    ]),

    heading("7. Geçici İş Göremezlik Cetveli"),
    tempTable(result),

    heading("8. İşlemiş Dönem Cetveli"),
    processedTable(result),

    heading("9. İşleyecek Dönem Cetveli"),
    futureTable(result),

    heading("10. Toplam ve İndirimler"),
    kvTable([
      ["Geçici İG toplamı", formatMoney(result.temporaryIncapacityTotal)],
      ["İşlemiş dönem toplamı", formatMoney(result.processedPermanentTotal)],
      ["İşleyecek dönem toplamı", formatMoney(result.futurePermanentTotal)],
      ["Toplam zarar", formatMoney(result.totalDamageBeforeFault)],
      [
        `Davacı kusur indirimi (${formatPercent(result.injuredFaultRate)})`,
        formatMoney(result.faultDeductionAmount),
      ],
      ["Kusur sonrası zarar", formatMoney(result.totalAfterFault)],
      ["Toplam PSD", formatMoney(result.psdTotal)],
      ["Kusur uygulanmış mahsup edilebilir PSD", formatMoney(result.psdDeductibleAfterFault)],
      ["PSD sonrası zarar", formatMoney(result.totalAfterPSD)],
      ["Sigorta/garame öncesi nihai tazminat", formatMoney(result.finalCompensationBeforeInsurance)],
      ["ZMTS ana para toplamı", formatMoney(result.insuranceDeductions.zmts.principalTotal)],
      ["ZMTS yasal faiz toplamı", formatMoney(result.insuranceDeductions.zmts.interestTotal)],
      ["ZMTS faizli mahsup toplamı", formatMoney(result.insuranceDeductions.zmts.deductionTotal)],
      ["Kasko ana para toplamı", formatMoney(result.insuranceDeductions.casco.principalTotal)],
      ["Kasko yasal faiz toplamı", formatMoney(result.insuranceDeductions.casco.interestTotal)],
      ["Kasko faizli mahsup toplamı", formatMoney(result.insuranceDeductions.casco.deductionTotal)],
      ["Sigorta ödemeleri sonrası nihai tazminat", formatMoney(result.finalCompensationAfterInsurance)],
    ]),

    heading("11. ZMTS / Kasko / Garame"),
    ...insuranceSection(draft, result),

    heading("12. Sonuç ve Kanaat"),
    bodyParagraph(buildConclusionParagraph(draft, result)),

    new Paragraph({
      spacing: { before: 400 },
      children: [
        new TextRun({
          text: `Rapor oluşturulma: ${formatReportTimestamp()}`,
          size: 18,
          italics: true,
          color: "666666",
        }),
      ],
    }),
  ];

  if (result.warnings.length > 0) {
    children.splice(
      2,
      0,
      bodyParagraph(`Motor uyarıları: ${result.warnings.join(" · ")}`, { spacingAfter: 200 })
    );
  }

  return new Document({
    sections: [
      {
        properties: A4_SECTION,
        footers: { default: pageFooter() },
        children,
      },
    ],
  });
}

export async function generateTrafficInjuryWordReport(
  draft: TrafficInjuryDraft,
  result: TrafficInjuryCalculationResult
): Promise<Buffer> {
  const doc = buildTrafficInjuryWordDocument(draft, result);
  return Packer.toBuffer(doc);
}

export function trafficInjuryReportFilename(draft: TrafficInjuryDraft): string {
  const base = draft.common.internalFileName?.trim() || "trafik-yaralanma";
  const safe = base.replace(/[^\w\u00C0-\u024F.-]+/gu, "-").replace(/-+/g, "-");
  const date = draft.common.calculationDate || new Date().toISOString().slice(0, 10);
  return `aktüerya-${safe}-${date}.docx`;
}
