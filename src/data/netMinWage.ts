export interface MinWagePeriod {
  startDate: string;
  endDate: string;
  netAmount: number;
}

/** Frontend `netMinWage.ts` ile birebir — validation için paylaşılan tablo */
export const NET_MIN_WAGE_PERIODS: MinWagePeriod[] = [
  { startDate: "2010-01-01", endDate: "2010-06-30", netAmount: 576.57 },
  { startDate: "2010-07-01", endDate: "2010-12-31", netAmount: 599.12 },
  { startDate: "2011-01-01", endDate: "2011-06-30", netAmount: 629.96 },
  { startDate: "2011-07-01", endDate: "2011-12-31", netAmount: 658.95 },
  { startDate: "2012-01-01", endDate: "2012-06-30", netAmount: 701.13 },
  { startDate: "2012-07-01", endDate: "2012-12-31", netAmount: 739.79 },
  { startDate: "2013-01-01", endDate: "2013-06-30", netAmount: 773.01 },
  { startDate: "2013-07-01", endDate: "2013-12-31", netAmount: 803.68 },
  { startDate: "2014-01-01", endDate: "2014-06-30", netAmount: 846.0 },
  { startDate: "2014-07-01", endDate: "2014-12-31", netAmount: 891.03 },
  { startDate: "2015-01-01", endDate: "2015-06-30", netAmount: 949.07 },
  { startDate: "2015-07-01", endDate: "2015-12-31", netAmount: 1000.54 },
  { startDate: "2016-01-01", endDate: "2016-12-31", netAmount: 1300.99 },
  { startDate: "2017-01-01", endDate: "2017-12-31", netAmount: 1404.06 },
  { startDate: "2018-01-01", endDate: "2018-12-31", netAmount: 1603.12 },
  { startDate: "2019-01-01", endDate: "2019-12-31", netAmount: 2020.9 },
  { startDate: "2020-01-01", endDate: "2020-12-31", netAmount: 2324.71 },
  { startDate: "2021-01-01", endDate: "2021-12-31", netAmount: 2825.9 },
  { startDate: "2022-01-01", endDate: "2022-06-30", netAmount: 4253.4 },
  { startDate: "2022-07-01", endDate: "2022-12-31", netAmount: 5500.35 },
  { startDate: "2023-01-01", endDate: "2023-06-30", netAmount: 8506.8 },
  { startDate: "2023-07-01", endDate: "2023-12-31", netAmount: 11402.32 },
  { startDate: "2024-01-01", endDate: "2024-12-31", netAmount: 17002.12 },
  { startDate: "2025-01-01", endDate: "2025-12-31", netAmount: 22104.67 },
  { startDate: "2026-01-01", endDate: "2026-12-31", netAmount: 28075.5 },
];

export function getNetMinWageForDate(dateStr: string): number | null {
  if (!dateStr) return null;
  for (const p of NET_MIN_WAGE_PERIODS) {
    if (dateStr >= p.startDate && dateStr <= p.endDate) {
      return p.netAmount;
    }
  }
  return null;
}
