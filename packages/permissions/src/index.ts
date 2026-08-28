export const PERMISSIONS = [
  'customers.read','customers.create','customers.update','customers.delete','products.read','products.write',
  'services.read','services.write','sales.read','sales.create','sales.cancel','cash.read','cash.open','cash.close','cash.withdraw','cash.adjust',
  'finance.read','finance.create','finance.export','appointments.read','appointments.write','team.read','team.invite','team.update','team.remove','users.read','users.manage','settings.read','settings.update','settings.manage','modules.read','modules.update','public_site.read','public_site.update','public_site.publish','orders.read','orders.write','inventory.read','inventory.write','service_orders.read','service_orders.write','patients.read','patients.write','patients.sensitive.read','reports.read'
] as const;
export type Permission = typeof PERMISSIONS[number];
export type PermissionKey = Permission;
export type RoleKey = 'owner'|'admin'|'manager'|'cashier'|'sales'|'professional'|'employee'|'viewer';
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: PERMISSIONS.filter((p) => p !== 'patients.sensitive.read'),
  manager: PERMISSIONS.filter((p) => !['settings.manage','users.manage','patients.sensitive.read'].includes(p)),
  cashier: ['customers.read','sales.read','sales.create','cash.read','cash.open','cash.close'],
  sales: ['customers.read','customers.create','customers.update','products.read','services.read','sales.read','sales.create'],
  professional: ['customers.read','services.read','appointments.read','appointments.write'],
  employee: ['customers.read','products.read','services.read','appointments.read'],
  viewer: ['customers.read','products.read','services.read','sales.read','cash.read','appointments.read','reports.read']
};
export * from './access';
