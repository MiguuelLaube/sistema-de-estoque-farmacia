import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const isLiveSupabaseConfigured = () => {
  return (
    import.meta.env.VITE_SUPABASE_URL &&
    import.meta.env.VITE_SUPABASE_URL !== 'https://your-project.supabase.co' &&
    import.meta.env.VITE_SUPABASE_ANON_KEY &&
    import.meta.env.VITE_SUPABASE_ANON_KEY !== 'your-anon-key-here' &&
    import.meta.env.VITE_DATA_MODE === 'supabase'
  );
};

// ============================================================================
// PROTEÇÃO ANTI-FLOOD & RATE LIMITER DE REQUISIÇÕES SQL / REST / AUTH (CLIENT)
// Impede loops acidentais, abuso de console e ataques de exaustão ao banco
// ============================================================================
interface BucketWindow {
  timestamps: number[];
}

const requestBuckets = new Map<string, BucketWindow>();
const inflightGetRequests = new Map<string, Promise<Response>>();

const LIMITS = {
  AUTH: { max: 15, windowMs: 60_000 },      // Máx. 15 req/min em endpoints de autenticação
  MUTATION: { max: 45, windowMs: 60_000 },  // Máx. 45 INSERT/UPDATE/DELETE/RPC por minuto
  BURST_WRITE: { max: 12, windowMs: 5_000 }, // Máx. 12 escritas em rajada de 5 segundos
  READ: { max: 140, windowMs: 60_000 },     // Máx. 140 leituras (SELECT) por minuto
};

function checkClientRateLimit(bucketKey: string, max: number, windowMs: number): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  let bucket = requestBuckets.get(bucketKey);
  if (!bucket) {
    bucket = { timestamps: [] };
    requestBuckets.set(bucketKey, bucket);
  }

  // Remove registros fora da janela deslizante
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);

  if (bucket.timestamps.length >= max) {
    const oldest = bucket.timestamps[0] || now;
    const retryAfterSec = Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000));
    return { allowed: false, retryAfterSec };
  }

  bucket.timestamps.push(now);
  return { allowed: true, retryAfterSec: 0 };
}

const rateLimitedFetch: typeof fetch = async (input, init) => {
  const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  const method = (init?.method || 'GET').toUpperCase();
  const isAuthEndpoint = urlStr.includes('/auth/v1/');
  const isRpcEndpoint = urlStr.includes('/rest/v1/rpc/');
  const isRead = method === 'GET' || method === 'HEAD';

  // 1. Verifica limites conforme tipo de operação SQL/Auth
  if (isAuthEndpoint) {
    const check = checkClientRateLimit('auth', LIMITS.AUTH.max, LIMITS.AUTH.windowMs);
    if (!check.allowed) {
      return new Response(
        JSON.stringify({
          code: '429',
          message: `Limite de requisições de autenticação excedido. Aguarde ${check.retryAfterSec}s.`,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(check.retryAfterSec) } }
      );
    }
  } else if (!isRead || isRpcEndpoint) {
    const burst = checkClientRateLimit('burst_write', LIMITS.BURST_WRITE.max, LIMITS.BURST_WRITE.windowMs);
    const minute = checkClientRateLimit('mutation', LIMITS.MUTATION.max, LIMITS.MUTATION.windowMs);
    if (!burst.allowed || !minute.allowed) {
      const wait = Math.max(burst.retryAfterSec, minute.retryAfterSec);
      return new Response(
        JSON.stringify({
          code: '429',
          message: `Muitas operações seguidas no banco de dados. Aguarde ${wait}s para continuar.`,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(wait) } }
      );
    }
  } else {
    const readCheck = checkClientRateLimit('read', LIMITS.READ.max, LIMITS.READ.windowMs);
    if (!readCheck.allowed) {
      return new Response(
        JSON.stringify({
          code: '429',
          message: `Limite de consultas por minuto atingido. Aguarde ${readCheck.retryAfterSec}s.`,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(readCheck.retryAfterSec) } }
      );
    }
  }

  // 2. Deduplicação de consultas GET idênticas simultâneas (evita consultas SQL duplicadas)
  if (isRead && !isAuthEndpoint) {
    const inflight = inflightGetRequests.get(urlStr);
    if (inflight) {
      try {
        const cloned = await inflight;
        return cloned.clone();
      } catch {
        // Se a requisição original falhou, prossegue normalmente
      }
    }
  }

  // 3. Timeout de 15 segundos para evitar travamento de conexões (Slowloris / Hang)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15_000);
  const mergedInit: RequestInit = {
    ...init,
    signal: init?.signal || controller.signal,
  };

  const execPromise = fetch(input, mergedInit).finally(() => {
    clearTimeout(timeoutId);
    if (isRead && !isAuthEndpoint) {
      inflightGetRequests.delete(urlStr);
    }
  });

  if (isRead && !isAuthEndpoint) {
    inflightGetRequests.set(urlStr, execPromise);
  }

  return execPromise;
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  global: {
    fetch: rateLimitedFetch,
  },
});
