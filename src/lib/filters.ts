import type { Vehicle } from '../data/vehicles';

/** Cash budget steps shown in the filters and the home page quick search. */
export const BUDGETS = [10000, 20000, 30000, 50000, 80000, 100000];

/** "2020 or newer" style steps, only those that match at least one car. */
export function yearSteps(vehicles: Vehicle[]): number[] {
  const thisYear = new Date().getFullYear();
  return [2, 4, 6, 8, 11, 16].map((n) => thisYear - n).filter((y) => vehicles.some((v) => v.year >= y));
}
