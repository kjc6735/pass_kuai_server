import { existsSync } from 'node:fs';

export function testDatabaseUrl(): string {
  if (existsSync('.env')) process.loadEnvFile();
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL;
  const base = process.env.DATABASE_URL;
  if (!base) {
    throw new Error(
      'DATABASE_URL이 없습니다. npm run db:up 후 .env에 DATABASE_URL을 넣으세요.',
    );
  }
  const url = new URL(base);
  url.pathname = '/passkuai_test';
  return url.toString();
}
