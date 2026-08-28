export const PERMISSIONS = [
  'customers.read','customers.create','customers.update','customers.delete','products.read','products.write',
  'services.read','services.write','sales.read','sales.create','sales.cancel','cash.read','cash.open','cash.close','cash.adjust',
  'finance.read','finance.write','appointments.read','appointments.write','users.read','users.manage','settings.read','settings.manage','reports.read'
] as const;
export type Permission = typeof PERMISSIONS[number];
export const ROLE_PERMISSIONS: Record<string, readonly Permission[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => !['settings.manage','users.manage'].includes(p)),
  operator: ['customers.read','customers.create','customers.update','products.read','services.read','sales.read','sales.create','cash.read','cash.open','cash.close','appointments.read','appointments.write'],
  viewer: ['customers.read','products.read','services.read','sales.read','cash.read','appointments.read','reports.read']
};
