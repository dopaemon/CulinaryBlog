import type { Config } from 'drizzle-kit';

export default {
  schema: './src/infrastructure/database/schema/*.ts',
  out: './src/infrastructure/database/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
} satisfies Config;
