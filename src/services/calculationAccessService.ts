/**
 * CalculationAccessService — ödeme/kredi erişim kontrolü için yer tutucu.
 * Bu aşamada henüz ödeme sistemi yok; her zaman erişim yok döner.
 * Frontend'den gelen paid/credit bayraklarına güvenilmez.
 */

export interface AccessCheckResult {
  allowed: boolean;
  code: "CALCULATION_ACCESS_REQUIRED" | "ACCESS_GRANTED";
  message: string;
}

export class CalculationAccessService {
  /**
   * Kullanıcının hesap sonucu üretme hakkını kontrol eder.
   * İleride kredi/ödeme kaydı burada sorgulanacak.
   */
  async hasCalculationAccess(_userId: string): Promise<AccessCheckResult> {
    return {
      allowed: false,
      code: "CALCULATION_ACCESS_REQUIRED",
      message: "Hesaplama sonucunu oluşturmak için ödeme veya kredi hakkı gereklidir.",
    };
  }
}

export const calculationAccessService = new CalculationAccessService();
