export const BUSINESS_TYPES = ['salon','beauty','barbershop','restaurant','snackbar','retail','technical_assistance','service_provider','gym','studio','clinic','other'] as const;
export type BusinessSegment = typeof BUSINESS_TYPES[number];
export const MODULES = ['overview','public_site','customers','sales','cash','finance','team','settings','schedule','products','services','inventory','orders','tables','commands','menu','kitchen','delivery','service_orders','equipment','quotes','suppliers','classes','checkin','plans','patients','procedures','professionals','commissions','business_hours','categories','addons','combos','pickup','coupons','delivery_fees','variations','parts','warranties','students','memberships','teachers','notices','medical_records','insurance','documents','promotions','barcode'] as const;
export type ModuleKey = typeof MODULES[number];
export const CORE_MODULES: ModuleKey[] = ['overview','customers','sales','cash','finance','team','settings','public_site'];
export const SITE_ONLY_MODULES: ModuleKey[] = ['overview','settings','public_site'];
export const MODULE_DEPENDENCIES: Partial<Record<ModuleKey, ModuleKey[]>> = { kitchen:['orders'],tables:['orders'],commands:['orders','tables'],delivery:['orders'],pickup:['orders'],addons:['menu'],combos:['menu'],delivery_fees:['delivery'],variations:['products'],barcode:['products'],parts:['inventory'],warranties:['service_orders'],service_orders:['customers'],classes:['plans'],memberships:['plans'],teachers:['team'],medical_records:['patients'],insurance:['patients'],commissions:['team'] };
export const SEGMENT_MODULES: Record<BusinessSegment, ModuleKey[]> = {
  salon:['overview','public_site','customers','schedule','services','professionals','commissions','business_hours','sales','products','cash','finance','team','settings'],beauty:['overview','public_site','customers','schedule','services','professionals','commissions','business_hours','sales','products','cash','finance','team','settings'],barbershop:['overview','public_site','customers','schedule','services','professionals','commissions','business_hours','sales','products','cash','finance','team','settings'],
  restaurant:['overview','public_site','orders','tables','commands','menu','categories','addons','combos','kitchen','delivery','pickup','coupons','delivery_fees','business_hours','customers','cash','inventory','finance','team','settings'],snackbar:['overview','public_site','orders','tables','commands','menu','categories','addons','combos','kitchen','delivery','pickup','coupons','delivery_fees','business_hours','customers','cash','inventory','finance','team','settings'],
  retail:['overview','public_site','products','categories','variations','barcode','promotions','sales','inventory','customers','cash','finance','suppliers','business_hours','team','settings'],technical_assistance:['overview','public_site','service_orders','customers','equipment','products','parts','inventory','quotes','warranties','cash','finance','team','settings'],
  service_provider:['overview','public_site','customers','services','quotes','service_orders','schedule','business_hours','finance','team','settings'],gym:['overview','public_site','students','plans','memberships','classes','teachers','schedule','checkin','finance','notices','team','settings'],studio:['overview','public_site','students','plans','memberships','classes','teachers','schedule','checkin','finance','notices','team','settings'],
  clinic:['overview','public_site','patients','schedule','procedures','professionals','medical_records','insurance','documents','finance','team','settings'],other:CORE_MODULES
};

export type SegmentQuestion={key:string;label:string;kind:'boolean'|'number'|'select';options?:string[];enables?:ModuleKey[]};
export const SEGMENT_QUESTIONS:Partial<Record<BusinessSegment,SegmentQuestion[]>>={
  restaurant:[{key:'dineIn',label:'Atende clientes no local?',kind:'boolean',enables:['tables','commands']},{key:'tableCount',label:'Quantas mesas existem?',kind:'number'},{key:'delivery',label:'Faz entregas?',kind:'boolean',enables:['delivery','delivery_fees']},{key:'pickup',label:'Oferece retirada no balcão?',kind:'boolean',enables:['pickup']},{key:'onlineOrders',label:'Quer receber pedidos pela página pública?',kind:'boolean'},{key:'kitchenPrint',label:'Usa fluxo de produção na cozinha?',kind:'boolean',enables:['kitchen']}],
  snackbar:[{key:'dineIn',label:'Atende clientes no local?',kind:'boolean',enables:['tables','commands']},{key:'delivery',label:'Faz entregas?',kind:'boolean',enables:['delivery','delivery_fees']},{key:'pickup',label:'Oferece retirada no balcão?',kind:'boolean',enables:['pickup']}],
  salon:[{key:'professionals',label:'Trabalha com profissionais?',kind:'boolean',enables:['professionals','team']},{key:'commissions',label:'Paga comissão por serviço?',kind:'boolean',enables:['commissions']},{key:'onlineBooking',label:'Quer agendamento pela página pública?',kind:'boolean'},{key:'sellsProducts',label:'Também vende produtos?',kind:'boolean',enables:['products','sales']}],
  beauty:[{key:'professionals',label:'Trabalha com profissionais?',kind:'boolean',enables:['professionals','team']},{key:'commissions',label:'Paga comissão?',kind:'boolean',enables:['commissions']},{key:'onlineBooking',label:'Quer agendamento on-line?',kind:'boolean'}],
  barbershop:[{key:'professionals',label:'Trabalha com barbeiros?',kind:'boolean',enables:['professionals','team']},{key:'commissions',label:'Paga comissão?',kind:'boolean',enables:['commissions']},{key:'onlineBooking',label:'Quer agendamento on-line?',kind:'boolean'}],
  technical_assistance:[{key:'quoteApproval',label:'Quer aprovação de orçamento on-line?',kind:'boolean'},{key:'equipmentPhotos',label:'Registra fotos dos equipamentos?',kind:'boolean'},{key:'partsControl',label:'Controla peças em estoque?',kind:'boolean',enables:['parts','inventory']},{key:'warranty',label:'Oferece garantia do reparo?',kind:'boolean',enables:['warranties']}],
  clinic:[{key:'insurance',label:'Atende convênios?',kind:'boolean',enables:['insurance']},{key:'medicalRecords',label:'Usa prontuário e observações restritas?',kind:'boolean',enables:['medical_records']},{key:'onlineBooking',label:'Quer agendamento on-line?',kind:'boolean'}]
};
export function deriveSegmentModules(segment:BusinessSegment,answers:Record<string,string|number|boolean>={}):ModuleKey[]{const modules=new Set(SEGMENT_MODULES[segment]);for(const question of SEGMENT_QUESTIONS[segment]??[]){if(question.enables&&answers[question.key]===false)for(const key of question.enables)modules.delete(key);if(question.enables&&answers[question.key]===true)for(const key of question.enables)modules.add(key)}return [...modules]}
export const SEGMENT_INITIAL_RECORDS:Partial<Record<BusinessSegment,Array<{moduleCode:ModuleKey;name:string;details:string;status:string}>>>={restaurant:['Bebidas','Porções','Combos','Pratos','Sobremesas'].map(name=>({moduleCode:'categories',name,details:'Categoria inicial; edite ou remova conforme necessário.',status:'Ativa'})),snackbar:['Bebidas','Lanches','Porções','Combos','Sobremesas'].map(name=>({moduleCode:'categories',name,details:'Categoria inicial; edite ou remova conforme necessário.',status:'Ativa'})),salon:['Corte','Escova','Coloração','Manicure','Tratamentos'].map(name=>({moduleCode:'services',name,details:'Serviço inicial; configure duração e preço.',status:'Ativo'})),beauty:['Limpeza de pele','Massagem','Design de sobrancelhas','Depilação'].map(name=>({moduleCode:'services',name,details:'Serviço inicial; configure duração e preço.',status:'Ativo'})),barbershop:['Corte','Barba','Corte e barba','Acabamento'].map(name=>({moduleCode:'services',name,details:'Serviço inicial; configure duração e preço.',status:'Ativo'})),technical_assistance:['Celular','Notebook','Computador','Tablet','Televisão'].map(name=>({moduleCode:'equipment',name,details:'Tipo de equipamento atendido.',status:'Ativo'}))};
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
