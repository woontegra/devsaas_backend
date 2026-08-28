/** Türkçe rapor formatları — yalnızca görüntüleme; hesap yok. */

export function formatMoney(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return `${amount.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL`;
}

/** Word cetvel hücreleri — TL başlıkta, değer tek satır */
export function formatMoneyPlain(amount: number | null | undefined): string {
  if (amount == null || !Number.isFinite(amount)) return "—";
  return amount
    .toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    .replace(/\./g, "\u202F");
}

export function formatDateIso(iso: string | null | undefined): string {
  if (!iso) return "—";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `%${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatKn(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

/** KN / iskonto — referans cetvel 8 ondalık (kesme) */
function truncateToDecimals(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.trunc(value * factor) / factor;
}

export function formatKn8(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const t = truncateToDecimals(value, 8);
  return t.toLocaleString("tr-TR", { minimumFractionDigits: 8, maximumFractionDigits: 8 });
}

export function formatDecimalYears(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} yıl`;
}

export function formatTrhYmd(entry: { year: number; month: number; day: number }): string {
  const parts: string[] = [];
  if (entry.year > 0) parts.push(`${entry.year} yıl`);
  if (entry.month > 0) parts.push(`${entry.month} ay`);
  if (entry.day > 0) parts.push(`${entry.day} gün`);
  return parts.length > 0 ? parts.join(" ") : "—";
}

export function formatAgeYmd(
  entry: { years: number; months: number; days: number } | null | undefined
): string {
  if (!entry) return "—";
  const parts: string[] = [];
  if (entry.years > 0) parts.push(`${entry.years} yıl`);
  if (entry.months > 0) parts.push(`${entry.months} ay`);
  if (entry.days > 0) parts.push(`${entry.days} gün`);
  return parts.length > 0 ? parts.join(" ") : "0 gün";
}

export function formatReportTimestamp(d = new Date()): string {
  return d.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
