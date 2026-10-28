// The relay gate: every route except /health needs the app access
// code, is rate-limited per visitor, and stops for the day when the
// spending limit is reached. Costs are recorded before answering.
export interface Limits {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export interface Env {
  META_API_BASE?: string;
  META_API_KEY?: string;
  APP_ACCESS_CODE?: string;
  DAILY_BUDGET_USD?: string;
  SPARK_COST_USD?: string;
  SAM_COST_USD?: string;
  RATE_LIMIT_PER_MINUTE?: string;
  ITTRO_LIMITS?: Limits;
}

export function codesEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

export async function overRateLimit(env: Env, ip: string): Promise<boolean> {
  if (!env.ITTRO_LIMITS) {
    return false;
  }
  const perMinute = Number(env.RATE_LIMIT_PER_MINUTE ?? '30');
  const minute = Math.floor(Date.now() / 60000);
  const key = `rl:${ip}:${minute}`;
  const current = Number((await env.ITTRO_LIMITS.get(key)) ?? '0');
  if (current >= perMinute) {
    return true;
  }
  await env.ITTRO_LIMITS.put(key, String(current + 1), { expirationTtl: 120 });
  return false;
}

export async function spendTodayUsd(env: Env): Promise<number> {
  if (!env.ITTRO_LIMITS) {
    return 0;
  }
  const day = new Date().toISOString().slice(0, 10);
  return Number((await env.ITTRO_LIMITS.get(`spend:${day}`)) ?? '0');
}

export async function addSpendUsd(env: Env, amount: number): Promise<void> {
  if (!env.ITTRO_LIMITS) {
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const key = `spend:${day}`;
  const current = Number((await env.ITTRO_LIMITS.get(key)) ?? '0');
  await env.ITTRO_LIMITS.put(key, String(current + amount), { expirationTtl: 172800 });
}

export async function gate(request: Request, env: Env, costUsd: number): Promise<Response | null> {
  const presented = (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!env.APP_ACCESS_CODE || !codesEqual(presented, env.APP_ACCESS_CODE)) {
    return Response.json({ ok: false, error: 'unknown app' }, { status: 401 });
  }
  if (await overRateLimit(env, clientIp(request))) {
    return Response.json({ ok: false, error: 'too many requests, slow down' }, { status: 429 });
  }
  const budget = Number(env.DAILY_BUDGET_USD ?? '3');
  if ((await spendTodayUsd(env)) + costUsd > budget) {
    return Response.json({ ok: false, error: 'daily budget reached, back tomorrow' }, { status: 402 });
  }
  return null;
}

export async function recordSparkCost(env: Env): Promise<void> {
  await addSpendUsd(env, Number(env.SPARK_COST_USD ?? '0.01'));
}

export async function recordSamCost(env: Env): Promise<void> {
  await addSpendUsd(env, Number(env.SAM_COST_USD ?? '0.0025'));
}
