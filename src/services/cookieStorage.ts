/**
 * Sistema EncoMed - Gerenciamento Seguro de Cookies e Consentimento LGPD
 * Suporta armazenamento de sessão do Supabase, persistência de preferências
 * e conformidade com a LGPD (Lei nº 13.709/2018).
 */

export interface ConsentimentoCookies {
  essenciais: boolean;      // Sessão, autenticação e segurança (sempre true)
  preferencias: boolean;    // Tema visual, layout e filtros
  analiticos: boolean;      // Métricas agregadas e estabilidade
  atualizado_em: string;    // Data ISO do consentimento
}

const COOKIE_CONSENT_KEY = 'encomed_cookie_consent';

/**
 * Lê um cookie específico pelo nome
 */
export function getCookie(nome: string): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const nomeCodificado = encodeURIComponent(nome);
    const regex = new RegExp('(?:^|;\\s*)' + nomeCodificado + '=([^;]*)');
    const match = document.cookie.match(regex);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/**
 * Grava um cookie com atributos de segurança (SameSite=Lax, Secure em HTTPS)
 */
export function setCookie(
  nome: string,
  valor: string,
  duracaoSegundos: number = 60 * 60 * 24 * 30, // 30 dias padrão
  sameSite: 'Lax' | 'Strict' | 'None' = 'Lax'
): void {
  if (typeof document === 'undefined') return;
  try {
    const isHttps = typeof location !== 'undefined' && location.protocol === 'https:';
    const secureFlag = isHttps ? '; Secure' : '';
    const encodedNome = encodeURIComponent(nome);
    const encodedValor = encodeURIComponent(valor);
    document.cookie = `${encodedNome}=${encodedValor}; Path=/; Max-Age=${duracaoSegundos}; SameSite=${sameSite}${secureFlag}`;
  } catch (err) {
    console.warn('[Cookie Storage] Falha ao gravar cookie:', nome, err);
  }
}

/**
 * Remove um cookie expirando sua validade
 */
export function deleteCookie(nome: string): void {
  if (typeof document === 'undefined') return;
  try {
    const encodedNome = encodeURIComponent(nome);
    document.cookie = `${encodedNome}=; Path=/; Max-Age=0; SameSite=Lax`;
  } catch {
    // silencioso
  }
}

/**
 * Adaptador de Armazenamento Híbrido (Cookies + LocalStorage) para o Supabase Auth.
 * Implementa a interface SupportedStorage do @supabase/supabase-js.
 */
export const supabaseCookieStorage = {
  getItem: (key: string): string | null => {
    // 1. Tenta carregar dos Cookies
    const cookieVal = getCookie(key);
    if (cookieVal) return cookieVal;

    // 2. Fallback para LocalStorage se não encontrar no cookie
    try {
      if (typeof localStorage !== 'undefined') {
        const localVal = localStorage.getItem(key);
        // Se encontrou no localStorage, sincroniza de volta para o cookie
        if (localVal && localVal.length < 3800) {
          setCookie(key, localVal, 60 * 60 * 24 * 30);
        }
        return localVal;
      }
    } catch {
      // localStorage bloqueado ou em modo privado restrito
    }
    return null;
  },

  setItem: (key: string, value: string): void => {
    // 1. Grava no Cookie se o tamanho respeitar o limite padrão de 4KB do navegador
    if (value.length < 3800) {
      setCookie(key, value, 60 * 60 * 24 * 30);
    }

    // 2. Espelha no LocalStorage para redundância e performance
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {
      // localStorage indisponível
    }

    // 3. Extrai e expõe tokens de conveniência em cookies legíveis pelo servidor Vercel
    try {
      const parsed = JSON.parse(value);
      if (parsed?.access_token) {
        setCookie('sb-access-token', parsed.access_token, 60 * 60 * 24 * 7);
      }
      if (parsed?.refresh_token) {
        setCookie('sb-refresh-token', parsed.refresh_token, 60 * 60 * 24 * 30);
      }
      setCookie('encomed_session_active', '1', 60 * 60 * 24 * 7);
    } catch {
      // valor não é JSON de sessão
    }
  },

  removeItem: (key: string): void => {
    // 1. Remove dos cookies principais e auxiliares
    deleteCookie(key);
    deleteCookie('sb-access-token');
    deleteCookie('sb-refresh-token');
    deleteCookie('encomed_session_active');

    // 2. Remove do localStorage
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(key);
      }
    } catch {
      // silencioso
    }
  },
};

/**
 * Lê o estado atual de consentimento de cookies da LGPD
 */
export function carregarConsentimentoLGPD(): ConsentimentoCookies | null {
  try {
    const rawCookie = getCookie(COOKIE_CONSENT_KEY);
    if (rawCookie) {
      return JSON.parse(rawCookie) as ConsentimentoCookies;
    }
    if (typeof localStorage !== 'undefined') {
      const rawLocal = localStorage.getItem(COOKIE_CONSENT_KEY);
      if (rawLocal) {
        return JSON.parse(rawLocal) as ConsentimentoCookies;
      }
    }
  } catch {
    // erro de parse
  }
  return null;
}

/**
 * Salva a decisão do titular sobre os cookies da LGPD
 */
export function salvarConsentimentoLGPD(consent: Partial<ConsentimentoCookies>): ConsentimentoCookies {
  const finalConsent: ConsentimentoCookies = {
    essenciais: true, // Sempre obrigatório
    preferencias: consent.preferencias ?? true,
    analiticos: consent.analiticos ?? false,
    atualizado_em: new Date().toISOString(),
  };

  const payload = JSON.stringify(finalConsent);
  // Salva no cookie por 12 meses (365 dias)
  setCookie(COOKIE_CONSENT_KEY, payload, 60 * 60 * 24 * 365);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(COOKIE_CONSENT_KEY, payload);
    }
  } catch {
    // silencioso
  }

  return finalConsent;
}

/**
 * Revoga todos os cookies não essenciais em atendimento ao Art. 18 da LGPD
 */
export function revogarConsentimentoLGPD(): void {
  deleteCookie(COOKIE_CONSENT_KEY);
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(COOKIE_CONSENT_KEY);
    }
  } catch {}
}