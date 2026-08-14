type RuntimeEnv = Record<string, string | undefined>;

export function requireSecret(name: string, env: RuntimeEnv = process.env, devFallback?: string): string {
  const value = env[name]?.trim();
  if (value) return value;
  if (env.NODE_ENV !== 'production' && devFallback) return devFallback;
  throw new Error(`${name} deve ser configurada`);
}

export function validateApiRuntimeConfig(env: RuntimeEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  requireValues(env, ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'SECRETS_MASTER_KEY', 'CORS_ORIGINS',
    'WEB_APP_URL', 'API_PUBLIC_URL', 'EVOLUTION_API_URL', 'EVOLUTION_API_KEY']);
  requireMinLength(env, 'JWT_SECRET', 32);
  requireMinLength(env, 'SECRETS_MASTER_KEY', 32);
  requireHttps(env, ['WEB_APP_URL', 'API_PUBLIC_URL', 'EVOLUTION_API_URL']);
  if (env.BILLING_REQUIRED !== 'false') {
    requireValues(env, ['ASAAS_API_KEY', 'ASAAS_WEBHOOK_TOKEN']);
  }
}

export function validateWorkerRuntimeConfig(env: RuntimeEnv = process.env): void {
  if (env.NODE_ENV !== 'production') return;
  requireValues(env, ['DATABASE_URL', 'REDIS_URL', 'SECRETS_MASTER_KEY', 'EVOLUTION_API_URL', 'EVOLUTION_API_KEY']);
  requireMinLength(env, 'SECRETS_MASTER_KEY', 32);
  requireHttps(env, ['EVOLUTION_API_URL']);
}

function requireValues(env: RuntimeEnv, names: string[]): void {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Variaveis obrigatorias ausentes: ${missing.join(', ')}`);
}

function requireMinLength(env: RuntimeEnv, name: string, min: number): void {
  if ((env[name]?.length ?? 0) < min) throw new Error(`${name} deve ter pelo menos ${min} caracteres`);
}

function requireHttps(env: RuntimeEnv, names: string[]): void {
  const invalid = names.filter((name) => !env[name]?.startsWith('https://'));
  if (invalid.length) throw new Error(`URLs de producao devem usar HTTPS: ${invalid.join(', ')}`);
}
