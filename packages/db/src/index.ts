import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export type Database = ReturnType<typeof createDb>;
export function createDb(databaseUrl: string) {
  if (!databaseUrl.startsWith('postgres')) throw new Error('Invalid DATABASE_URL');
  return drizzle(neon(databaseUrl), { schema });
}
export * from './schema';
