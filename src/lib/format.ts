const rm = new Intl.NumberFormat('en-MY', { maximumFractionDigits: 0 });

export const ASK_FOR_PRICE = 'Ask for price';

/** 42000 → "RM 42,000"; null → null (callers decide what to show). */
export function formatRM(value: number | null): string | null {
  return value === null ? null : `RM ${rm.format(value)}`;
}

/** Flat-rate hire purchase estimate (the usual Malaysian car-loan calculation). */
export function monthlyInstalment(price: number, downPercent: number, ratePercent: number, years: number): number {
  const loan = price * (1 - downPercent / 100);
  const interest = loan * (ratePercent / 100) * years;
  return (loan + interest) / (years * 12);
}

/**
 * Longest loan period (years) a lender allows for a car, using TnB's rule:
 * car age + loan period must stay within `maxCarAgePlusTenure`, capped at `maxTenureYears`.
 * Car age counts from the year of manufacture. 0 means this lender cannot finance the car.
 */
export function maxTenure(carYear: number, maxCarAgePlusTenure: number, maxTenureYears: number, nowYear: number): number {
  const age = Math.max(0, nowYear - carYear);
  return Math.max(0, Math.min(maxTenureYears, maxCarAgePlusTenure - age));
}
