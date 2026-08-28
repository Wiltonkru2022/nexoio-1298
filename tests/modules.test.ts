import { describe, expect, it } from 'vitest';
import { MODULE_DEPENDENCIES, SEGMENT_MODULES, SITE_ONLY_MODULES } from '@nexoio/core';

describe('módulos por segmento',()=>{
  it('não habilita agenda para restaurantes',()=>expect(SEGMENT_MODULES.restaurant).not.toContain('schedule'));
  it('habilita pedidos para restaurantes',()=>expect(SEGMENT_MODULES.restaurant).toContain('orders'));
  it('usa ordens de serviço em assistência técnica',()=>expect(SEGMENT_MODULES.technical_assistance).toContain('service_orders'));
  it('mantém os módulos clínicos separados',()=>expect(SEGMENT_MODULES.clinic).toEqual(expect.arrayContaining(['patients','procedures','professionals'])));
  it('declara dependências operacionais',()=>{expect(MODULE_DEPENDENCIES.kitchen).toContain('orders');expect(MODULE_DEPENDENCIES.classes).toContain('plans')});
  it('mantém contas somente-site sem módulos operacionais',()=>{expect(SITE_ONLY_MODULES).toEqual(['overview','settings','public_site']);expect(SITE_ONLY_MODULES).not.toContain('cash')});
  it('oferece página pública para todos os segmentos',()=>{for(const modules of Object.values(SEGMENT_MODULES))expect(modules).toContain('public_site')});
});
