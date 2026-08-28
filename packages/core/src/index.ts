export const BUSINESS_TYPES = ['salon','beauty','barbershop','restaurant','snackbar','retail','technical_assistance','service_provider','gym','studio','clinic','other'] as const;
export type BusinessSegment = typeof BUSINESS_TYPES[number];
export const MODULES = ['overview','customers','sales','cash','finance','team','settings','schedule','products','services','inventory','orders','tables','commands','menu','kitchen','delivery','service_orders','equipment','quotes','suppliers','classes','checkin','plans','patients','procedures','professionals'] as const;
export type ModuleKey = typeof MODULES[number];
export const CORE_MODULES: ModuleKey[] = ['overview','customers','sales','cash','finance','team','settings'];
export const MODULE_DEPENDENCIES: Partial<Record<ModuleKey, ModuleKey[]>> = { kitchen:['orders'],tables:['orders'],commands:['orders'],delivery:['orders'],service_orders:['customers'],classes:['plans'] };
export const SEGMENT_MODULES: Record<BusinessSegment, ModuleKey[]> = {
  salon:['overview','customers','schedule','services','sales','products','cash','finance','team','settings'],beauty:['overview','customers','schedule','services','sales','products','cash','finance','team','settings'],barbershop:['overview','customers','schedule','services','sales','products','cash','finance','team','settings'],
  restaurant:['overview','orders','tables','commands','menu','kitchen','delivery','cash','inventory','finance','team','settings'],snackbar:['overview','orders','commands','menu','kitchen','delivery','cash','inventory','finance','team','settings'],
  retail:['overview','products','sales','inventory','customers','cash','finance','suppliers','team','settings'],technical_assistance:['overview','service_orders','customers','equipment','products','inventory','quotes','cash','finance','team','settings'],
  service_provider:['overview','customers','services','quotes','service_orders','finance','settings'],gym:['overview','customers','plans','classes','schedule','checkin','finance','team','settings'],studio:['overview','customers','plans','classes','schedule','checkin','finance','team','settings'],
  clinic:['overview','patients','schedule','procedures','professionals','finance','team','settings'],other:CORE_MODULES
};
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
