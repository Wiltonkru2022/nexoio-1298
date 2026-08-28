export const BUSINESS_TYPES = ['beauty','health','retail','restaurant','technical_assistance','automotive','fitness','education','professional_services','general'] as const;
export const MODULES = ['customers','crm','products','services','inventory','sales','cash','appointments','professionals','commissions','service_orders','finance','restaurant','delivery','ecommerce','campaigns','public_site'] as const;
export const RESERVED_SLUGS = new Set(['www','app','admin','api','mail','smtp','ftp','cdn','assets','static','support','status','billing','auth','login','dashboard']);

export function slugifyBusiness(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function isAllowedSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) && !RESERVED_SLUGS.has(slug);
}

export function uuidv7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const now = BigInt(Date.now());
  for (let i = 5; i >= 0; i--) bytes[5 - i] = Number((now >> BigInt(i * 8)) & 0xffn);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
