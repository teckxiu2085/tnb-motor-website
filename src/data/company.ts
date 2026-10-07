import raw from '../../content/company.json';

/**
 * A value counts as filled only when TnB has really provided it.
 * `null`, empty strings and anything starting with "TODO" are treated as missing,
 * and every part of the site that depends on a missing value is hidden.
 */
export function isFilled(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '' && !/^todo\b/i.test(value.trim());
}

const pick = (value: unknown) => (isFilled(value) ? value.trim() : null);

export interface TeamMember {
  name: string;
  role: string | null;
  photo: string | null;
  languages: string[];
  initial: string;
}

const team: TeamMember[] = raw.team
  // Members with an open "_confirm" TODO stay off the site until TnB confirms them.
  .filter((m) => !('_confirm' in m && typeof m._confirm === 'string' && /^todo\b/i.test(m._confirm)))
  .map((m) => ({
    name: m.name,
    role: pick(m.role),
    photo: pick(m.photo),
    languages: 'languages' in m && Array.isArray(m.languages) ? m.languages : [],
    initial: m.name.trim().charAt(0).toUpperCase(),
  }));

const whatsapp = pick(raw.whatsappMain)?.replace(/\D/g, '') ?? null;
const phone = pick(raw.phone);

const social = Object.entries(raw.social)
  .map(([network, url]) => ({ network, url: pick(url) }))
  .filter((s): s is { network: string; url: string } => s.url !== null);

const estimator = raw.loanEstimator;

export const company = {
  legalName: raw.legalName,
  brandName: raw.brandName,
  tagline: raw.tagline,
  city: raw.city,
  state: raw.state,
  country: raw.country,
  whatsapp,
  phone,
  /** E.164 form for tel: links, e.g. +60104627388 (derived from the WhatsApp/phone number TnB gave). */
  phoneE164: phone ? `+60${phone.replace(/\D/g, '').replace(/^0/, '')}` : null,
  address: pick(raw.address),
  googleMapsUrl: pick(raw.googleMapsUrl),
  geo: raw.geo && typeof raw.geo.lat === 'number' ? { lat: raw.geo.lat, lng: raw.geo.lng } : null,
  openingHours: pick(raw.openingHours),
  openingHoursSchema: pick(raw.openingHoursSchema),
  social,
  team,
  pricingNotes: raw.pricingNotes.filter(isFilled),
  whyTnb: (raw.whyTnb as unknown[]).filter(isFilled),
  loanEstimator: {
    downPaymentPercent: estimator.downPaymentPercent,
    interestRatePercent: estimator.interestRatePercent,
    tenureYears: estimator.tenureYears,
  },
};

export const wazeUrl = company.geo
  ? `https://waze.com/ul?ll=${company.geo.lat},${company.geo.lng}&navigate=yes`
  : null;

export type Company = typeof company;
