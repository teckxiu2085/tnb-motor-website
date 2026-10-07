import { company } from '../data/company';
import type { Vehicle } from '../data/vehicles';

/** wa.me link to the company number, or null while the number is not provided (buttons then stay hidden). */
export function waLink(message: string): string | null {
  if (!company.whatsapp) return null;
  return `https://wa.me/${company.whatsapp}?text=${encodeURIComponent(message)}`;
}

export const messages = {
  general: () => `Hi ${company.brandName}, I'd like to ask about your cars.`,
  car: (car: Vehicle, url: string) => `Hi ${company.brandName}, I'm interested in the ${car.label}. ${url}`,
  photos: (car: Vehicle, url: string) =>
    `Hi ${company.brandName}, could you send me photos of the ${car.label}? ${url}`,
  sell: () => `Hi ${company.brandName}, I'd like to sell / consign my car.\nModel:\nYear:`,
  team: (name: string) => `Hi ${company.brandName}, I'd like to speak with ${name}.`,
};
