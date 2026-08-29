import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { renderPublicSite, type PublicItem, type PublicSection, type PublicTheme } from '@nexoio/site-renderer';
import { error, requirePermission } from '../middleware';
import type { ApiEnv } from '../types';

export const sitePreviewRoutes=new Hono<ApiEnv>();
const rows=(r:any)=>r?.rows??r??[];
const editorSchema=z.object({headline:z.string().max(160),description:z.string().max(1000),whatsappUrl:z.string().max(500).optional().default(''),instagramUrl:z.string().max(500).optional().default(''),primaryColor:z.string().max(20),template:z.string().max(80),seoTitle:z.string().max(100).optional().default(''),seoDescription:z.string().max(300).optional().default(''),address:z.string().max(500).optional().default(''),design:z.record(z.string(),z.unknown()),pages:z.array(z.object({id:z.string(),name:z.string(),slug:z.string(),enabled:z.boolean(),blocks:z.array(z.record(z.string(),z.unknown()))})).min(1),activePageId:z.string().optional()}).passthrough();

sitePreviewRoutes.post('/site-preview/render',requirePermission('public_site.read'),async c=>{
  const parsed=editorSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Configuração do site inválida');
  const businessId=c.get('auth').businessId;const db=c.get('db');
  const [businessResult,productResult,serviceResult,integrationResult]=await Promise.all([
    db.execute(sql`select display_name,business_type,primary_color,whatsapp from businesses where id=${businessId}::uuid and status='active' limit 1`),
    db.execute(sql`select id,name title,description text,sale_price price from products where business_id=${businessId}::uuid and active=true order by created_at desc limit 60`),
    db.execute(sql`select id,name title,description text,price from services where business_id=${businessId}::uuid and active=true order by created_at desc limit 60`),
    db.execute(sql`select google_analytics_id,meta_pixel_id,google_maps_url,whatsapp_url,instagram_url from public_site_integrations where business_id=${businessId}::uuid limit 1`)
  ]);const business:any=rows(businessResult)[0];if(!business)return error(c,404,'BUSINESS_NOT_FOUND','Empresa não encontrada');
  const fmt=(value:any)=>value==null?undefined:Number(value).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const products:PublicItem[]=rows(productResult).map((i:any)=>({id:i.id,title:i.title,text:i.text??undefined,price:fmt(i.price)}));const services:PublicItem[]=rows(serviceResult).map((i:any)=>({id:i.id,title:i.title,text:i.text??undefined,price:fmt(i.price)}));const integration:any=rows(integrationResult)[0]??{};
  const page=parsed.data.pages.find(p=>p.id===parsed.data.activePageId)??parsed.data.pages[0]!;const segment=String(business.business_type??'generic');const dynamic=segment==='restaurant'||segment==='snackbar'?products:segment==='salon'||segment==='beauty'||segment==='barbershop'||segment==='service_provider'||segment==='clinic'?services:products;let sections=(page.blocks as PublicSection[]).filter(s=>s.enabled!==false).map(s=>{if(s.items?.length)return s;if(s.type==='products'||s.type==='menu')return {...s,items:products};if(s.type==='services'||s.type==='pricing'||s.type==='plans')return {...s,items:services};if(s.type==='promotion')return {...s,items:dynamic.slice(0,8)};return s});if(!sections.some(s=>s.type==='hero'))sections=[{type:'hero',title:parsed.data.headline,text:parsed.data.description,buttonText:parsed.data.whatsappUrl?'Falar no WhatsApp':'',buttonUrl:parsed.data.whatsappUrl},...sections];
  const theme:PublicTheme={template:parsed.data.template,design:parsed.data.design as any,pages:parsed.data.pages as any};const input={name:business.display_name,headline:parsed.data.headline,description:parsed.data.description,primaryColor:parsed.data.primaryColor||business.primary_color,whatsapp:parsed.data.whatsappUrl||business.whatsapp,instagram:parsed.data.instagramUrl,address:parsed.data.address,canonicalUrl:'https://preview.nexoio.local/',pagePath:`/${page.slug||''}`,theme,seo:{title:parsed.data.seoTitle||business.display_name,description:parsed.data.seoDescription||parsed.data.description},sections,pages:parsed.data.pages as any,services,integration:{googleAnalyticsId:null,metaPixelId:null,googleMapsUrl:integration.google_maps_url,whatsappUrl:parsed.data.whatsappUrl||integration.whatsapp_url||business.whatsapp,instagramUrl:parsed.data.instagramUrl||integration.instagram_url}};
  return c.json({data:{html:renderPublicSite(input)}});
});
