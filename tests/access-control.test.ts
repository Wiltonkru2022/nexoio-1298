import{describe,expect,it}from'vitest';import{canAccessModule,canAccessPlatformAdmin,resolveMembership}from'@nexoio/permissions';
const memberships=[{userId:'user-a',businessId:'business-a',status:'active' as const},{userId:'user-b',businessId:'business-b',status:'active' as const},{userId:'user-a',businessId:'business-c',status:'suspended' as const}];
describe('access control',()=>{
it('accepts the active membership for the requested tenant',()=>expect(resolveMembership(memberships,'user-a','business-a')).not.toBeNull());
it('blocks cross-tenant access',()=>expect(resolveMembership(memberships,'user-a','business-b')).toBeNull());
it('blocks suspended membership',()=>expect(resolveMembership(memberships,'user-a','business-c')).toBeNull());
it('allows an enabled module with permission',()=>expect(canAccessModule({membership:memberships[0]!,grants:new Set(['customers.read']),modules:new Set(['customers']),permission:'customers.read',moduleKey:'customers'})).toBe(true));
it('blocks a disabled module',()=>expect(canAccessModule({membership:memberships[0]!,grants:new Set(['customers.read']),modules:new Set(),permission:'customers.read',moduleKey:'customers'})).toBe(false));
it('blocks a missing permission',()=>expect(canAccessModule({membership:memberships[0]!,grants:new Set(),modules:new Set(['customers']),permission:'customers.read',moduleKey:'customers'})).toBe(false));
it('keeps platform admin separate from business roles',()=>expect(canAccessPlatformAdmin({platformAdmin:false,status:'active',mfaRequired:false,mfaEnabled:false})).toBe(false));
it('requires MFA for Master Admin',()=>expect(canAccessPlatformAdmin({platformAdmin:true,status:'active',mfaRequired:true,mfaEnabled:false})).toBe(false));
it('allows active Master Admin after MFA',()=>expect(canAccessPlatformAdmin({platformAdmin:true,status:'active',mfaRequired:true,mfaEnabled:true})).toBe(true));
});
