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
