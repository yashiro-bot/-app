// Typed environment loader.
// Single source of truth for every runtime config value.
// Fail fast at boot if a required secret is missing — never let the server
// start with an undefined JWT_SECRET (would silently accept any token).

import { config as loadDotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// ─── Load .env from the backend/ root, regardless of where Node was launched ─
// We import this module BEFORE Fastify boots, so we need .env ready right away.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, '..', '..', '.env');
loadDotenv({ path: envPath });

// ─── Helpers ────────────────────────────────────────────────────────────────
function requiredString(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function optionalString(name: string, fallback = ''): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Env var ${name} must be an integer, got: ${raw}`);
  }
  return parsed;
}

// ─── Public config ──────────────────────────────────────────────────────────
export interface AppConfig {
  readonly port: number;
  readonly host: string;
  readonly jwtSecret: string;
  readonly jwtExpiresIn: string;
  readonly databaseUrl: string;
  readonly wxAppid: string;
  readonly wxSecret: string;
  readonly amapKey: string;
  readonly ossAccessKeyId: string;
  readonly ossAccessKeySecret: string;
  readonly ossRegion: string;
  readonly ossBucket: string;
  readonly logLevel: string;
  readonly nodeEnv: 'development' | 'production' | 'test';
}

const nodeEnv = (process.env['NODE_ENV'] ?? 'development') as AppConfig['nodeEnv'];

export const config: AppConfig = {
  port: optionalInt('PORT', 3000),
  host: optionalString('HOST', '0.0.0.0'),
  jwtSecret: requiredString('JWT_SECRET'),
  jwtExpiresIn: optionalString('JWT_EXPIRES_IN', '7d'),
  databaseUrl: requiredString('DATABASE_URL'),
  wxAppid: optionalString('WX_APPID'),
  wxSecret: optionalString('WX_SECRET'),
  amapKey: optionalString('AMAP_KEY'),
  ossAccessKeyId: optionalString('OSS_ACCESS_KEY_ID'),
  ossAccessKeySecret: optionalString('OSS_ACCESS_KEY_SECRET'),
  ossRegion: optionalString('OSS_REGION'),
  ossBucket: optionalString('OSS_BUCKET'),
  logLevel: optionalString('LOG_LEVEL', nodeEnv === 'production' ? 'info' : 'debug'),
  nodeEnv,
};