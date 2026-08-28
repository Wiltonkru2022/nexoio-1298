import { and, eq, inArray } from "drizzle-orm";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { Hono } from "hono";
import { z } from "zod";
import {
  BUSINESS_TYPES,
  CORE_MODULES,
  deriveSegmentModules,
  isAllowedSlug,
  MODULE_DEPENDENCIES,
  MODULES,
  SEGMENT_MODULES,
  SEGMENT_INITIAL_RECORDS,
  SITE_ONLY_MODULES,
  uuidv7,
} from "@nexoio/core";
import { PERMISSIONS } from "@nexoio/permissions";
import {
  businessMemberships,
  businessModules,
  businessDomains,
  businessPublicProfiles,
  businessSiteVersions,
  businesses,
  memberInvitations,
  moduleRecords,
  modules,
  onboardingProgress,
  permissions as permissionCatalog,
  rolePermissions,
  roles,
  users,
} from "@nexoio/db";
import {
  error,
  requireAuth,
  requirePermission,
  requireSession,
} from "../middleware";
import type { ApiEnv } from "../types";

const onboardingSchema = z
  .object({
    displayName: z.string().trim().min(2).max(150),
    productMode: z.enum(['full_system','site_only']).default('full_system'),
    answers: z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).optional().default({}),
    legalName: z.string().trim().max(180).optional(),
    segment: z.enum(BUSINESS_TYPES),
    documentNumber: z.string().max(30).optional(),
    phone: z.string().max(30).optional(),
    email: z.email().optional(),
    city: z.string().max(100),
    state: z.string().length(2),
    timezone: z.string().default("America/Sao_Paulo"),
    slug: z.string().min(2).max(63),
    moduleKeys: z.array(z.enum(MODULES)).optional(),
  })
  .strict();
const moduleSchema = z
  .object({ moduleKey: z.enum(MODULES), enabled: z.boolean() })
  .strict();
const inviteSchema = z.object({ email: z.email(), roleId: z.uuid() }).strict();
const blockSchema=z.object({id:z.string().min(1).max(80),type:z.enum(['hero','text','image','gallery','services','products','menu','team','testimonials','faq','map','contact','whatsapp','form','video','banner','promotion','counter','partners','social','schedule','online_order','pricing','plans','reviews','hours']),enabled:z.boolean(),favorite:z.boolean().default(false),title:z.string().max(160),text:z.string().max(5000),buttonText:z.string().max(80).default(''),buttonUrl:z.string().max(500).default(''),mediaUrl:z.string().max(1000).default(''),dataSource:z.enum(['manual','all','category','best_sellers','promotions']).default('manual'),dataFilter:z.string().max(160).default(''),visibility:z.enum(['all','desktop','tablet','mobile']).default('all'),style:z.record(z.string(),z.union([z.string(),z.number(),z.boolean()])).default({})});
const pageSchema=z.object({id:z.string().min(1).max(80),name:z.string().min(1).max(80),slug:z.string().max(100),enabled:z.boolean(),blocks:z.array(blockSchema).max(100)});
const designSchema=z.object({fontFamily:z.string().max(100),contentWidth:z.number().min(720).max(1600),spacing:z.number().min(0).max(160),titleSize:z.number().min(20).max(96),radius:z.number().min(0).max(60),buttonStyle:z.enum(['rounded','square','pill','outline']),background:z.string().max(100),gradient:z.string().max(300),alignment:z.enum(['left','center','right']),columns:z.number().min(1).max(4),animation:z.enum(['none','fade','slide','zoom']),stickyHeader:z.boolean(),transparentHeader:z.boolean(),showMenu:z.boolean(),showFooter:z.boolean()});
const publicSiteSchema=z.object({headline:z.string().trim().min(2).max(160),description:z.string().trim().max(1000),whatsappUrl:z.string().max(500),instagramUrl:z.string().max(500).optional(),primaryColor:z.string().regex(/^#[0-9a-f]{6}$/i),template:z.enum(['beauty-01','restaurant-01','restaurant-02','store-01','service-01','clinic-01','generic-01','premium-01']),product:z.enum(['landing_page','professional_site','store_system']),published:z.boolean(),scheduledAt:z.union([z.iso.datetime(),z.literal(''),z.null()]).optional(),seoTitle:z.string().trim().max(70),seoDescription:z.string().trim().max(170),address:z.string().trim().max(300),builderMode:z.enum(['simple','advanced','blocks']).default('simple'),setupMode:z.enum(['quick','custom']).default('quick'),design:designSchema, pages:z.array(pageSchema).min(1).max(30)}).strict();
const versionSchema=z.object({label:z.string().trim().min(1).max(120),config:publicSiteSchema}).strict();
const assistSchema=z.object({action:z.enum(['title','improve','description','whatsapp','colors','structure','seo']),text:z.string().max(3000).default(''),segment:z.string().max(80).default('generic')}).strict();
const businessSettingsSchema=z.object({displayName:z.string().trim().min(2).max(150),legalName:z.string().trim().max(180),documentNumber:z.string().trim().max(30),phone:z.string().trim().max(30),whatsapp:z.string().trim().max(30),email:z.union([z.email(),z.literal('')]),primaryColor:z.string().regex(/^#[0-9a-f]{6}$/i),secondaryColor:z.string().regex(/^#[0-9a-f]{6}$/i),address:z.string().trim().max(300),openingHours:z.string().trim().max(500)}).strict();
const digest = async (value: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");

export const platformRoutes = new Hono<ApiEnv>();
platformRoutes.use("*", requireSession);
platformRoutes.get("/context", async (c) => {
  const db = c.get("db");
  const profile = (
    await db
      .select()
      .from(users)
      .where(eq(users.authUserId, c.get("sessionUser").id))
      .limit(1)
  )[0];
  if (!profile)
    return error(
      c,
      409,
      "PROFILE_NOT_READY",
      "Perfil ainda não foi provisionado",
    );
  const memberships = await db
    .select({
      businessId: businessMemberships.businessId,
      businessName: businesses.displayName,
      segment: businesses.businessType,
      status: businessMemberships.status,
      roleId: businessMemberships.roleId,
      roleCode: roles.code,
    })
    .from(businessMemberships)
    .innerJoin(businesses, eq(businesses.id, businessMemberships.businessId))
    .innerJoin(roles, eq(roles.id, businessMemberships.roleId))
    .where(
      and(
        eq(businessMemberships.userId, profile.id),
        eq(businessMemberships.status, "active"),
      ),
    );
  const activeBusinessId = getCookie(c, "nexoio_business");
  const membership = memberships.find((x) => x.businessId === activeBusinessId);
  let grants: string[] = [];
  let activeModules: string[] = [];
  if (membership) {
    let [permissionRows, moduleRows] = await Promise.all([
      db
        .select({ code: rolePermissions.permissionCode })
        .from(rolePermissions)
        .where(eq(rolePermissions.roleId, membership.roleId)),
      db
        .select({ key: businessModules.moduleCode })
        .from(businessModules)
        .where(
          and(
            eq(businessModules.businessId, membership.businessId),
            eq(businessModules.enabled, true),
          ),
        ),
    ]);
    if (membership.roleCode === "owner") {
      await db
        .insert(permissionCatalog)
        .values(
          PERMISSIONS.map((code) => ({
            code,
            description: code.replace(".", ": "),
          })),
        )
        .onConflictDoNothing();
      await db
        .insert(rolePermissions)
        .values(
          PERMISSIONS.map((permissionCode) => ({
            roleId: membership.roleId,
            permissionCode,
          })),
        )
        .onConflictDoNothing();
      permissionRows = PERMISSIONS.map((code) => ({ code }));
    }
    const [progress]=await db.select({data:onboardingProgress.dataJson}).from(onboardingProgress).where(and(eq(onboardingProgress.userId,profile.id),eq(onboardingProgress.businessId,membership.businessId))).limit(1);
    const progressData=progress?.data as {productMode?:string;answers?:Record<string,string|number|boolean>}|undefined;
    const siteOnly=progressData?.productMode==='site_only';
    const desiredModules=siteOnly?SITE_ONLY_MODULES:deriveSegmentModules(membership.segment as keyof typeof SEGMENT_MODULES,progressData?.answers??{});
    const missingModules=desiredModules.filter(key=>!moduleRows.some(row=>row.key===key));
    if(missingModules.length){await db.insert(modules).values(MODULES.map(key=>({key,name:key.replaceAll('_',' '),description:`Recurso ${key} da plataforma Nexoio`,core:CORE_MODULES.includes(key),dependenciesJson:MODULE_DEPENDENCIES[key]??[]}))).onConflictDoNothing();await db.insert(businessModules).values(missingModules.map(moduleCode=>({id:uuidv7(),businessId:membership.businessId,moduleCode,enabled:true,source:'segment_default'}))).onConflictDoUpdate({target:[businessModules.businessId,businessModules.moduleCode],set:{enabled:true,source:'segment_default',updatedAt:new Date()}});moduleRows=[...moduleRows,...missingModules.map(key=>({key}))]}
    if (!moduleRows.some((row) => row.key === 'public_site')) {
      await db.insert(modules).values({key:'public_site',name:'Página pública',description:'Site, domínio, conteúdo e publicação',core:true,dependenciesJson:[]}).onConflictDoNothing();
      await db.insert(businessModules).values({id:uuidv7(),businessId:membership.businessId,moduleCode:'public_site',enabled:true,source:'segment_default'}).onConflictDoNothing();
      moduleRows=[...moduleRows,{key:'public_site'}];
    }
    if (moduleRows.length === 0) {
      const defaults = [
        ...new Set([
          ...CORE_MODULES,
          ...(SEGMENT_MODULES[
            membership.segment as keyof typeof SEGMENT_MODULES
          ] ?? []),
        ]),
      ];
      await db
        .insert(modules)
        .values(
          MODULES.map((key) => ({
            key,
            name: key.replaceAll("_", " "),
            description: `Módulo ${key} da plataforma Nexoio`,
            core: CORE_MODULES.includes(key),
            dependenciesJson: MODULE_DEPENDENCIES[key] ?? [],
          })),
        )
        .onConflictDoNothing();
      await db
        .insert(businessModules)
        .values(
          defaults.map((moduleCode) => ({
            id: uuidv7(),
            businessId: membership.businessId,
            moduleCode,
            enabled: true,
            source: "segment_default",
          })),
        )
        .onConflictDoNothing();
      moduleRows = defaults.map((key) => ({ key }));
    }
    grants = permissionRows.map((x) => x.code);
    activeModules = moduleRows.map((x) => x.key);
  }
  return c.json({
    data: {
      user: profile,
      memberships,
      activeBusiness: membership ?? null,
      permissions: grants,
      modules: activeModules,
      onboardingRequired: memberships.length === 0,
    },
  });
});
platformRoutes.post("/businesses/select", async (c) => {
  const parsed = z
    .object({ businessId: z.uuid() })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return error(c, 422, "VALIDATION_ERROR", "Empresa inválida");
  const profile = (
    await c
      .get("db")
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authUserId, c.get("sessionUser").id))
      .limit(1)
  )[0];
  if (!profile)
    return error(c, 404, "BUSINESS_NOT_FOUND", "Empresa não encontrada");
  const membership = (
    await c
      .get("db")
      .select({ id: businessMemberships.id })
      .from(businessMemberships)
      .where(
        and(
          eq(businessMemberships.userId, profile.id),
          eq(businessMemberships.businessId, parsed.data.businessId),
          eq(businessMemberships.status, "active"),
        ),
      )
      .limit(1)
  )[0];
  if (!membership)
    return error(c, 404, "BUSINESS_NOT_FOUND", "Empresa não encontrada");
  setCookie(c, "nexoio_business", parsed.data.businessId, {
    httpOnly: true,
    secure: c.env.AUTH_URL.startsWith("https"),
    sameSite: "Lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return c.json({ data: { selected: true } });
});
platformRoutes.post("/businesses/clear", (c) => {
  deleteCookie(c, "nexoio_business", { path: "/" });
  return c.json({ data: { selected: false } });
});
platformRoutes.post("/onboarding/business", async (c) => {
  const parsed = onboardingSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!parsed.success)
    return error(
      c,
      422,
      "VALIDATION_ERROR",
      "Dados inválidos",
      parsed.error.flatten(),
    );
  if (!isAllowedSlug(parsed.data.slug))
    return error(c, 422, "VALIDATION_ERROR", "Slug inválido ou reservado");
  const db = c.get("db");
  const profile = (
    await db
      .select()
      .from(users)
      .where(eq(users.authUserId, c.get("sessionUser").id))
      .limit(1)
  )[0];
  if (!profile)
    return error(
      c,
      409,
      "PROFILE_NOT_READY",
      "Perfil ainda não foi provisionado",
    );
  const businessId = uuidv7();
  const roleId = uuidv7();
  const moduleKeys = parsed.data.productMode === 'site_only'
    ? [...SITE_ONLY_MODULES]
    : deriveSegmentModules(parsed.data.segment,parsed.data.answers);
  for (const key of moduleKeys) {
    for (const dependency of MODULE_DEPENDENCIES[key] ?? [])
      if (!moduleKeys.includes(dependency))
        return error(
          c,
          422,
          "MODULE_DEPENDENCY_REQUIRED",
          `${key} depende de ${dependency}`,
        );
  }
  await db
    .insert(permissionCatalog)
    .values(
      PERMISSIONS.map((code) => ({
        code,
        description: code.replace(".", ": "),
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(modules)
    .values(
      MODULES.map((key) => ({
        key,
        name: key.replaceAll("_", " "),
        description: `Módulo ${key} da plataforma Nexoio`,
        core: [
          "overview",
          "customers",
          "sales",
          "cash",
          "finance",
          "team",
          "settings",
        ].includes(key),
        dependenciesJson: MODULE_DEPENDENCIES[key] ?? [],
      })),
    )
    .onConflictDoNothing();
  await db
    .insert(businesses)
    .values({
      id: businessId,
      displayName: parsed.data.displayName,
      legalName: parsed.data.legalName,
      publicSlug: parsed.data.slug,
      businessType: parsed.data.segment,
      documentNumber: parsed.data.documentNumber,
      phone: parsed.data.phone,
      email: parsed.data.email,
      timezone: parsed.data.timezone,
    });
  await db
    .insert(roles)
    .values({
      id: roleId,
      businessId,
      code: "owner",
      name: "Proprietário",
      isSystem: true,
    });
  await db
    .insert(rolePermissions)
    .values(PERMISSIONS.map((permissionCode) => ({ roleId, permissionCode })));
  await db
    .insert(businessMemberships)
    .values({
      id: uuidv7(),
      businessId,
      userId: profile.id,
      roleId,
      status: "active",
      acceptedAt: new Date(),
    });
  await db
    .insert(businessModules)
    .values(
      moduleKeys.map((moduleCode) => ({
        id: uuidv7(),
        businessId,
        moduleCode,
        enabled: true,
        source: "segment_default",
      })),
    );
  const initialRecords=SEGMENT_INITIAL_RECORDS[parsed.data.segment]??[];
  if(initialRecords.length)await db.insert(moduleRecords).values(initialRecords.filter(record=>moduleKeys.includes(record.moduleCode)).map(record=>({id:uuidv7(),businessId,createdBy:profile.id,dataJson:{seeded:true},...record})));
  await db
    .insert(onboardingProgress)
    .values({
      userId: profile.id,
      businessId,
      step: "finish",
      completedAt: new Date(),
      dataJson: parsed.data,
    })
    .onConflictDoUpdate({
      target: onboardingProgress.userId,
      set: {
        businessId,
        step: "finish",
        completedAt: new Date(),
        dataJson: parsed.data,
        updatedAt: new Date(),
      },
    });
  await db.insert(businessPublicProfiles).values({businessId,headline:parsed.data.displayName,description:'Conheça nossa empresa e fale com nossa equipe.',whatsappUrl:parsed.data.phone?`https://wa.me/${parsed.data.phone.replace(/\D/g,'')}`:null,addressJson:{city:parsed.data.city,state:parsed.data.state},themeJson:{product:parsed.data.productMode==='site_only'?'landing_page':'store_system',template:`${parsed.data.segment}-01`,sections:[]},seoJson:{title:parsed.data.displayName,description:`Conheça ${parsed.data.displayName}`},published:false}).onConflictDoNothing();
  setCookie(c, "nexoio_business", businessId, {
    httpOnly: true,
    secure: c.env.AUTH_URL.startsWith("https"),
    sameSite: "Lax",
    path: "/",
  });
  return c.json({ data: { businessId } }, 201);
});

platformRoutes.use("/business/*", requireAuth);
platformRoutes.get(
  "/business/modules",
  requirePermission("modules.read"),
  async (c) =>
    c.json({
      data: await c
        .get("db")
        .select({
          key: modules.key,
          name: modules.name,
          description: modules.description,
          dependencies: modules.dependenciesJson,
          enabled: businessModules.enabled,
          source: businessModules.source,
        })
        .from(modules)
        .leftJoin(
          businessModules,
          and(
            eq(businessModules.moduleCode, modules.key),
            eq(businessModules.businessId, c.get("auth").businessId),
          ),
        )
        .where(eq(modules.active, true)),
    }),
);
platformRoutes.patch(
  "/business/modules",
  requirePermission("modules.update"),
  async (c) => {
    const parsed = moduleSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return error(c, 422, "VALIDATION_ERROR", "Módulo inválido");
    const db = c.get("db");
    const [business] = await db
      .select({ segment: businesses.businessType })
      .from(businesses)
      .where(eq(businesses.id, c.get("auth").businessId))
      .limit(1);
    const allowed = business
      ? SEGMENT_MODULES[business.segment as keyof typeof SEGMENT_MODULES] ?? CORE_MODULES
      : CORE_MODULES;
    if (!allowed.includes(parsed.data.moduleKey))
      return error(c, 422, "MODULE_NOT_ALLOWED_FOR_SEGMENT", "Este recurso não pertence ao segmento da empresa");
    if (!parsed.data.enabled && CORE_MODULES.includes(parsed.data.moduleKey))
      return error(c, 422, "CORE_MODULE_REQUIRED", "Este recurso é essencial e não pode ser desativado");
    if (parsed.data.enabled) {
      const required = MODULE_DEPENDENCIES[parsed.data.moduleKey] ?? [];
      if (required.length) {
        const enabled = await db
          .select({ key: businessModules.moduleCode })
          .from(businessModules)
          .where(
            and(
              eq(businessModules.businessId, c.get("auth").businessId),
              eq(businessModules.enabled, true),
              inArray(businessModules.moduleCode, required),
            ),
          );
        if (enabled.length !== required.length)
          return error(
            c,
            422,
            "MODULE_DEPENDENCY_REQUIRED",
            `Ative primeiro: ${required.join(", ")}`,
          );
      }
    } else {
      const dependents = Object.entries(MODULE_DEPENDENCIES)
        .filter(([, deps]) => deps?.includes(parsed.data.moduleKey))
        .map(([key]) => key);
      if (dependents.length) {
        const active = await db
          .select({ key: businessModules.moduleCode })
          .from(businessModules)
          .where(
            and(
              eq(businessModules.businessId, c.get("auth").businessId),
              eq(businessModules.enabled, true),
              inArray(businessModules.moduleCode, dependents),
            ),
          );
        if (active.length)
          return error(
            c,
            422,
            "MODULE_HAS_DEPENDENTS",
            `Desative primeiro: ${active.map((x) => x.key).join(", ")}`,
          );
      }
    }
    await db
      .insert(businessModules)
      .values({
        id: uuidv7(),
        businessId: c.get("auth").businessId,
        moduleCode: parsed.data.moduleKey,
        enabled: parsed.data.enabled,
        source: "manual",
      })
      .onConflictDoUpdate({
        target: [businessModules.businessId, businessModules.moduleCode],
        set: {
          enabled: parsed.data.enabled,
          source: "manual",
          updatedAt: new Date(),
        },
      });
    return c.json({ data: parsed.data });
  },
);
platformRoutes.get('/business/settings',requirePermission('settings.read'),async c=>{const businessId=c.get('auth').businessId;const[business,profile]=await Promise.all([c.get('db').select().from(businesses).where(eq(businesses.id,businessId)).limit(1),c.get('db').select({address:businessPublicProfiles.addressJson}).from(businessPublicProfiles).where(eq(businessPublicProfiles.businessId,businessId)).limit(1)]);return c.json({data:{business:business[0],address:profile[0]?.address??{}}})});
platformRoutes.patch('/business/settings',requirePermission('settings.update'),async c=>{const parsed=businessSettingsSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Dados da empresa inválidos',parsed.error.flatten());const businessId=c.get('auth').businessId;const data=parsed.data;await Promise.all([c.get('db').update(businesses).set({displayName:data.displayName,legalName:data.legalName||null,documentNumber:data.documentNumber||null,phone:data.phone||null,whatsapp:data.whatsapp||null,email:data.email||null,primaryColor:data.primaryColor,secondaryColor:data.secondaryColor,updatedAt:new Date()}).where(eq(businesses.id,businessId)),c.get('db').insert(businessPublicProfiles).values({businessId,addressJson:{formatted:data.address,openingHours:data.openingHours}}).onConflictDoUpdate({target:businessPublicProfiles.businessId,set:{addressJson:{formatted:data.address,openingHours:data.openingHours},updatedAt:new Date()}})]);return c.json({data:{saved:true}})});
platformRoutes.get('/business/public-site',requirePermission('public_site.read'),async c=>{
  const businessId=c.get('auth').businessId;
  const [business,profile,domains]=await Promise.all([
    c.get('db').select({displayName:businesses.displayName,slug:businesses.publicSlug,segment:businesses.businessType,primaryColor:businesses.primaryColor}).from(businesses).where(eq(businesses.id,businessId)).limit(1),
    c.get('db').select().from(businessPublicProfiles).where(eq(businessPublicProfiles.businessId,businessId)).limit(1),
    c.get('db').select().from(businessDomains).where(eq(businessDomains.businessId,businessId)),
  ]);
  const publicSuffix=c.env.APP_URL.includes('staging')?'staging.nexoio.com.br':'nexoio.com.br';
  return c.json({data:{business:business[0],profile:profile[0]??null,domains,publicUrl:business[0]?`https://${business[0].slug}.${publicSuffix}`:null}});
});
platformRoutes.patch('/business/public-site',requirePermission('public_site.update'),async c=>{
  const parsed=publicSiteSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Configuração da página inválida',parsed.error.flatten());
  const businessId=c.get('auth').businessId;const data=parsed.data;
  await Promise.all([
    c.get('db').update(businesses).set({primaryColor:data.primaryColor,updatedAt:new Date()}).where(eq(businesses.id,businessId)),
    c.get('db').insert(businessPublicProfiles).values({businessId,headline:data.headline,description:data.description,whatsappUrl:data.whatsappUrl||null,instagramUrl:data.instagramUrl||null,addressJson:{formatted:data.address},themeJson:{product:data.product,template:data.template,builderMode:data.builderMode,setupMode:data.setupMode,design:data.design,pages:data.pages,scheduledAt:data.scheduledAt||null},seoJson:{title:data.seoTitle,description:data.seoDescription},published:data.published,updatedAt:new Date()}).onConflictDoUpdate({target:businessPublicProfiles.businessId,set:{headline:data.headline,description:data.description,whatsappUrl:data.whatsappUrl||null,instagramUrl:data.instagramUrl||null,addressJson:{formatted:data.address},themeJson:{product:data.product,template:data.template,builderMode:data.builderMode,setupMode:data.setupMode,design:data.design,pages:data.pages,scheduledAt:data.scheduledAt||null},seoJson:{title:data.seoTitle,description:data.seoDescription},published:data.published,updatedAt:new Date()}}),
  ]);
  return c.json({data:{saved:true,published:data.published}});
});
platformRoutes.get('/business/public-site/versions',requirePermission('public_site.read'),async c=>{const rows=await c.get('db').select().from(businessSiteVersions).where(eq(businessSiteVersions.businessId,c.get('auth').businessId));return c.json({data:rows.sort((a,b)=>b.version-a.version).slice(0,50)});});
platformRoutes.post('/business/public-site/versions',requirePermission('public_site.update'),async c=>{const parsed=versionSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Versão inválida',parsed.error.flatten());const businessId=c.get('auth').businessId;const rows=await c.get('db').select({version:businessSiteVersions.version}).from(businessSiteVersions).where(eq(businessSiteVersions.businessId,businessId));const version=rows.reduce((max,row)=>Math.max(max,row.version),0)+1;const id=uuidv7();await c.get('db').insert(businessSiteVersions).values({id,businessId,version,label:parsed.data.label,status:parsed.data.config.published?'published':parsed.data.config.scheduledAt?'scheduled':'draft',scheduledAt:parsed.data.config.scheduledAt?new Date(parsed.data.config.scheduledAt):null,configJson:parsed.data.config,createdBy:c.get('auth').userId});return c.json({data:{id,version}},201);});
platformRoutes.post('/business/public-site/versions/:id/restore',requirePermission('public_site.update'),async c=>{const row=(await c.get('db').select().from(businessSiteVersions).where(and(eq(businessSiteVersions.id,c.req.param('id')),eq(businessSiteVersions.businessId,c.get('auth').businessId))).limit(1))[0];if(!row)return error(c,404,'VERSION_NOT_FOUND','Versão não encontrada');return c.json({data:{config:row.configJson}});});
platformRoutes.post('/business/public-site/assist',requirePermission('public_site.update'),async c=>{const parsed=assistSchema.safeParse(await c.req.json().catch(()=>null));if(!parsed.success)return error(c,422,'VALIDATION_ERROR','Pedido de assistência inválido',parsed.error.flatten());const {action,text,segment}=parsed.data;const name=text.trim()||'seu negócio';const results={title:`${name}: qualidade que você percebe`,improve:`${name.replace(/\.$/,'')}. Atendimento próximo, qualidade e uma experiência feita para você.`,description:`Conheça ${name}, veja nossas opções e fale com nossa equipe de forma rápida e segura.`,whatsapp:`Olá! Quero saber mais sobre ${name}.`,colors:segment.includes('restaurant')?'#d95d24|#24150f':segment.includes('beauty')||segment.includes('salon')?'#9b5de5|#231942':'#6548e8|#171222',structure:'hero,services,benefits,testimonials,faq,contact',seo:`${name} | Serviços, informações e contato`};return c.json({data:{result:results[action]}});});
platformRoutes.post(
  "/business/invitations",
  requirePermission("team.invite"),
  async (c) => {
    const parsed = inviteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success)
      return error(
        c,
        422,
        "VALIDATION_ERROR",
        "Convite inválido",
        parsed.error.flatten(),
      );
    const token = crypto.randomUUID() + crypto.randomUUID();
    const id = uuidv7();
    await c
      .get("db")
      .insert(memberInvitations)
      .values({
        id,
        businessId: c.get("auth").businessId,
        email: parsed.data.email.toLowerCase(),
        roleId: parsed.data.roleId,
        tokenHash: await digest(token),
        invitedBy: c.get("auth").userId,
        expiresAt: new Date(Date.now() + 7 * 86400000),
      });
    return c.json(
      {
        data: {
          id,
          acceptUrl: `${c.env.APP_URL}/aceitar-convite?token=${encodeURIComponent(token)}`,
        },
      },
      201,
    );
  },
);
platformRoutes.post("/invitations/accept", async (c) => {
  const parsed = z
    .object({ token: z.string().min(40) })
    .safeParse(await c.req.json().catch(() => null));
  if (!parsed.success)
    return error(c, 422, "VALIDATION_ERROR", "Token inválido");
  const db = c.get("db");
  const invitation = (
    await db
      .select()
      .from(memberInvitations)
      .where(
        and(
          eq(memberInvitations.tokenHash, await digest(parsed.data.token)),
          eq(memberInvitations.status, "pending"),
        ),
      )
      .limit(1)
  )[0];
  if (!invitation || invitation.expiresAt < new Date())
    return error(c, 410, "INVITATION_EXPIRED", "Convite inválido ou expirado");
  if (invitation.email !== c.get("sessionUser").email.toLowerCase())
    return error(c, 403, "FORBIDDEN", "Este convite pertence a outro e-mail");
  const profile = (
    await db
      .select()
      .from(users)
      .where(eq(users.authUserId, c.get("sessionUser").id))
      .limit(1)
  )[0];
  if (!profile)
    return error(c, 409, "PROFILE_NOT_READY", "Perfil indisponível");
  await db
    .insert(businessMemberships)
    .values({
      id: uuidv7(),
      businessId: invitation.businessId,
      userId: profile.id,
      roleId: invitation.roleId,
      status: "active",
      invitedAt: invitation.createdAt,
      acceptedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [businessMemberships.businessId, businessMemberships.userId],
      set: {
        status: "active",
        roleId: invitation.roleId,
        acceptedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  await db
    .update(memberInvitations)
    .set({ status: "accepted", acceptedAt: new Date() })
    .where(eq(memberInvitations.id, invitation.id));
  return c.json({ data: { businessId: invitation.businessId } });
});
