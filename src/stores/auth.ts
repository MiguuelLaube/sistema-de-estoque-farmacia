import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type {
  Tenant,
  ConfigTenant,
  Usuario,
  PerfilUsuario,
  Funcionario,
  SuperAdminDispositivo,
  LogAuditoria,
} from '../types';
import { initialTenants, initialConfigs, initialUsuarios, initialFuncionarios } from '../data/mockData';
import { supabase, isLiveSupabaseConfigured, CARREGADO_COM_LINK_DE_RECUPERACAO } from '../services/supabase';
import { traduzirErroPersistencia } from '../utils/erroPersistencia';

const DEVICE_TOKEN_STORAGE_KEY = 'pharma_sa_device_token_v1';

function gerarUuidSeguro(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return '00000000-0000-4000-8000-' + Date.now().toString(16).padStart(12, '0').slice(-12);
}

export function gerarSenhaProvisoriaAmigavel(): string {
  const sufixo = Math.floor(1000 + Math.random() * 9000);
  return `EncoMed@${sufixo}`;
}

function sanitizarMensagemErroAuth(rawMsg?: string): string {
  if (rawMsg) {
    console.warn('[Supabase Auth Debug]:', rawMsg);
  }
  const lower = (rawMsg || '').toLowerCase();
  if (lower.includes('database error querying schema') || lower.includes('querying schema')) {
    return 'Falha interna de integridade no schema de autenticação do Supabase. Execute a migração de saneamento de tokens em auth.users.';
  }
  if (
    lower.includes('invalid login credentials') ||
    lower.includes('invalid_credentials') ||
    lower.includes('invalid_grant') ||
    lower.includes('invalid password') ||
    lower.includes('invalid email')
  ) {
    return 'Identificador corporativo ou senha incorretos. Verifique suas credenciais ou clique em "Esqueci minha senha" para redefinir.';
  }
  if (lower.includes('too many requests') || lower.includes('rate limit') || lower.includes('over_email_send_rate_limit')) {
    return 'Limite de requisições excedido. Por favor, aguarde alguns minutos antes de tentar novamente.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Conta aguardando confirmação cadastral no Supabase. Verifique sua caixa de entrada.';
  }
  if (lower.includes('user not found')) {
    return 'Usuário não cadastrado no sistema. Verifique o e-mail digitado ou solicite um convite.';
  }
  if (lower.includes('redirect') || lower.includes('url not allowed')) {
    return 'URL de redirecionamento não autorizada. Adicione https://encomed.vercel.app/** na lista de Redirect URLs do Supabase.';
  }
  if (lower.includes('expired') || lower.includes('invalid token') || lower.includes('otp')) {
    return 'O link de recuperação ou acesso expirou. Solicite um novo link.';
  }
  if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('conexão')) {
    return 'Falha de comunicação com o servidor de autenticação. Verifique sua conexão com a internet.';
  }
  return rawMsg && rawMsg.length < 180 ? rawMsg : 'Identificador corporativo ou senha incorretos. Verifique suas credenciais.';
}

export const useAuthStore = defineStore('auth', () => {
  const isLive = isLiveSupabaseConfigured();

  const tenants = ref<Tenant[]>(isLive ? [] : initialTenants);
  const configs = ref<Record<string, ConfigTenant>>(isLive ? {} : initialConfigs);
  const usuarios = ref<Usuario[]>(isLive ? [] : initialUsuarios);
  const funcionarios = ref<Funcionario[]>(isLive ? [] : initialFuncionarios);

  const activeTenantId = ref<string>('a0000000-0000-0000-0000-000000000001');
  const activeUserId = ref<string>('');
  const currentUserProfile = ref<Usuario | null>(null);

  // Indica se o perfil ativo veio de public.usuario (vinculado ao auth.uid() no banco).
  // Sem esse vínculo o RLS (current_tenant_id() = NULL) rejeita TODA gravação.
  const vinculoBancoConfirmado = ref<boolean>(false);

  // Última mensagem clara de falha de gravação (funcionários, configurações etc.)
  const erroOperacao = ref<string | null>(null);

  // BUG-01 FIX: Nunca iniciar autenticado por padrão nem confiar em localStorage
  const isAuthenticated = ref<boolean>(false);
  const isAuthInitialized = ref<boolean>(false);

  // Estados de MFA Obrigatório (2FA TOTP) e Recuperação de Senha
  const mfaStage = ref<'none' | 'enroll' | 'verify'>('none');
  const mfaFactorId = ref<string>('');
  const mfaQrCode = ref<string>('');
  const mfaSecret = ref<string>('');
  const passwordRecoveryMode = ref<boolean>(false);

  // Estado Break-Glass e Segurança Zero-Trust do Super Admin
  const breakGlassTenantId = ref<string | null>(null);
  const superAdminContext = ref<{
    ip_atual: string;
    dispositivo_reconhecido: boolean;
    restringir_ip: boolean;
    ips_permitidos: string[];
    exigir_dispositivo_confiavel: boolean;
  }>({
    ip_atual: '127.0.0.1',
    dispositivo_reconhecido: false,
    restringir_ip: false,
    ips_permitidos: [],
    exigir_dispositivo_confiavel: false,
  });
  const superAdminDispositivos = ref<SuperAdminDispositivo[]>([]);
  const logsAuditoria = ref<LogAuditoria[]>([]);

  const fallbackConfig: ConfigTenant = initialConfigs['a0000000-0000-0000-0000-000000000001'];
  const fallbackTenant: Tenant = initialTenants[0];
  const fallbackUser: Usuario = {
    id: '',
    tenant_id: null,
    nome: 'Usuário',
    email: '',
    perfil: 'operador',
    ativo: false,
    criado_em: new Date().toISOString(),
  };

  const superAdminPlatformConfig: ConfigTenant = {
    tenant_id: 'plataforma',
    nome_sistema: 'EncoMed SaaS',
    slogan_sistema: 'Painel de Governança & Segurança',
    saudacao_painel: 'Olá, Administrador Supremo',
    logo_url: '/encomed-logo.png',
    cor_primaria: '#4f46e5',
    cor_secundaria: '#0f172a',
    visual_opcoes: {
      estilo_sidebar: 'escuro',
      formato_logo: 'retangular',
      estilo_bordas: 'padrao',
      densidade_interface: 'confortavel',
      fonte_interface: 'jakarta',
      cor_destaque: '#6366f1',
      exibir_selo_encomed: true,
      animacoes_ativas: true,
    },
    modelo_cupom: 'padrao',
    fuso: 'America/Sao_Paulo',
    mensagem_whatsapp: '',
    mensagem_whatsapp_pedido: '',
    mensagem_whatsapp_cobranca: '',
    mensagem_whatsapp_entregue: '',
    auto_whatsapp_pedido: false,
    auto_whatsapp_entregue: false,
    base_legal_padrao: 'execucao_contrato',
    bloquear_entrega_com_saldo: false,
    dias_retencao_arquivamento: 90,
    evolution_api_ativo: false,
    header_title: 'ENCOMED SAAS',
    header_subtitle: 'Plataforma Global',
    footer_text: 'Governança Zero-Trust',
    show_phone: false,
    show_payment: false,
    show_status: false,
    font_size: 14,
  };

  const superAdminPlatformTenant: Tenant = {
    id: 'plataforma',
    nome_empresa: 'EncoMed SaaS • Governança Global',
    slug: 'plataforma',
    dominio: 'plataforma.encomed.com.br',
    status: 'ativo',
    plano: 'enterprise',
    limite_encomendas_mes: 999999,
    criado_em: new Date().toISOString(),
    atualizado_em: new Date().toISOString(),
  };

  const currentTenant = computed<Tenant>(() => {
    if (isSuperAdmin.value && !breakGlassTenantId.value) {
      return superAdminPlatformTenant;
    }
    return tenants.value.find((t) => t.id === activeTenantId.value) || tenants.value[0] || fallbackTenant;
  });

  const currentConfig = computed<ConfigTenant>(() => {
    if (isSuperAdmin.value && !breakGlassTenantId.value) {
      return superAdminPlatformConfig;
    }
    return configs.value[activeTenantId.value] || fallbackConfig;
  });

  const currentUser = computed<Usuario>(() => {
    if (currentUserProfile.value) return currentUserProfile.value;
    return usuarios.value.find((u) => u.id === activeUserId.value) || fallbackUser;
  });

  const isSuperAdmin = computed(() => isAuthenticated.value && currentUser.value.perfil === 'super_admin');
  const isAdmin = computed(() => isAuthenticated.value && (currentUser.value.perfil === 'admin' || (isSuperAdmin.value && !!breakGlassTenantId.value)));
  const isComprador = computed(() => isAuthenticated.value && (currentUser.value.perfil === 'comprador' || isAdmin.value));
  const isOperador = computed(() => isAuthenticated.value && (currentUser.value.perfil === 'operador' || isAdmin.value));

  // Detecta se o usuário precisa definir nova senha no primeiro acesso
  const exigeTrocaSenha = computed(() => {
    if (!isAuthenticated.value) return false;
    if (isSuperAdmin.value) return false;
    return Boolean(currentUser.value.exigir_troca_senha || currentUserProfile.value?.exigir_troca_senha);
  });

  // BUG-06 FIX: Super Admin é estritamente invisível na listagem de equipe de qualquer tenant
  const tenantUsers = computed(() => {
    return usuarios.value.filter(
      (u) => u.tenant_id === activeTenantId.value && u.perfil !== 'super_admin' && !u.excluido_em
    );
  });

  const tenantFuncionarios = computed(() => {
    return funcionarios.value.filter((f) => f.tenant_id === activeTenantId.value);
  });

  function hexToHslTriplet(hex: string): string {
    const clean = (hex || '').replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '217 72% 56%';
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = (g - b) / d + (g < b ? 6 : 0);
          break;
        case g:
          h = (b - r) / d + 2;
          break;
        case b:
          h = (r - g) / d + 4;
          break;
      }
      h /= 6;
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }

  function applyTheme(overrideConfig?: Partial<ConfigTenant>) {
    if (typeof document === 'undefined') return;
    const cfg = overrideConfig ? { ...currentConfig.value, ...overrideConfig } : currentConfig.value;
    if (!cfg) return;

    const root = document.documentElement;
    const primaria = cfg.cor_primaria || '#2563eb';
    const secundaria = cfg.cor_secundaria || '#0f172a';
    const visual = cfg.visual_opcoes || {};
    const destaque = visual.cor_destaque || '#059669';

    const hsl = hexToHslTriplet(primaria);
    root.style.setProperty('--primary', hsl);
    root.style.setProperty('--color-primary', primaria);
    root.style.setProperty('--color-primary-hover', adjustColorBrightness(primaria, -12));
    root.style.setProperty('--color-primary-alpha', `hsla(${hsl}, 0.12)`);
    root.style.setProperty('--color-primary-subtle', `hsla(${hsl}, 0.05)`);
    root.style.setProperty('--color-primary-border', `hsla(${hsl}, 0.25)`);
    root.style.setProperty('--color-secondary', secundaria);
    root.style.setProperty('--color-accent-brand', destaque);
    root.style.setProperty('--border-color', '#e2e8f0');
    root.style.setProperty('--border-card', '#e2e8f0');

    // Estilo de Bordas dos Cards
    const bordas = visual.estilo_bordas || 'padrao';
    if (bordas === 'arredondado') {
      root.style.setProperty('--radius-sm', '10px');
      root.style.setProperty('--radius-md', '14px');
      root.style.setProperty('--radius-lg', '20px');
      root.style.setProperty('--radius-xl', '26px');
    } else if (bordas === 'compacto') {
      root.style.setProperty('--radius-sm', '4px');
      root.style.setProperty('--radius-md', '7px');
      root.style.setProperty('--radius-lg', '10px');
      root.style.setProperty('--radius-xl', '12px');
    } else {
      root.style.setProperty('--radius-sm', '6px');
      root.style.setProperty('--radius-md', '10px');
      root.style.setProperty('--radius-lg', '14px');
      root.style.setProperty('--radius-xl', '18px');
    }

    // Tipografia
    const fonte = visual.fonte_interface || 'jakarta';
    if (fonte === 'inter') {
      root.style.setProperty('--font-sans', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
      root.style.setProperty('--font-heading', "'Inter', -apple-system, BlinkMacSystemFont, sans-serif");
    } else if (fonte === 'system') {
      root.style.setProperty('--font-sans', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
      root.style.setProperty('--font-heading', "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
    } else {
      root.style.setProperty('--font-sans', "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif");
      root.style.setProperty('--font-heading', "'Plus Jakarta Sans', 'Inter', sans-serif");
    }

    // Atributos globais de barra lateral, densidade e animações
    root.setAttribute('data-sidebar-theme', visual.estilo_sidebar || 'claro');
    root.setAttribute('data-density', visual.densidade_interface || 'confortavel');
    root.setAttribute('data-animations', visual.animacoes_ativas === false ? 'off' : 'on');
  }

  function adjustColorBrightness(hex: string, percent: number) {
    const clean = hex.replace('#', '');
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) return '#2563eb';
    const num = parseInt(clean, 16);
    let r = (num >> 16) + Math.round(255 * (percent / 100));
    let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
    let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  async function carregarDadosContexto() {
    if (!isLive || !isAuthenticated.value) return;

    const [tenantsRes, configsRes, usersRes, funcsRes] = await Promise.all([
      supabase.from('tenant').select('*').order('criado_em', { ascending: true }),
      supabase.from('config_tenant').select('*'),
      supabase.from('usuario').select('*').neq('perfil', 'super_admin').order('nome', { ascending: true }),
      supabase.from('funcionario').select('*').order('nome', { ascending: true }),
    ]);

    if (tenantsRes.data) {
      tenants.value = tenantsRes.data as Tenant[];
      if (currentUserProfile.value?.tenant_id) {
        activeTenantId.value = currentUserProfile.value.tenant_id;
      } else if (breakGlassTenantId.value) {
        activeTenantId.value = breakGlassTenantId.value;
      } else if (tenants.value.length > 0 && !tenants.value.some((t) => t.id === activeTenantId.value)) {
        activeTenantId.value = tenants.value[0].id;
      }
    }

    if (configsRes.data) {
      const map: Record<string, ConfigTenant> = {};
      for (const c of configsRes.data as ConfigTenant[]) {
        map[c.tenant_id] = c;
      }
      configs.value = map;
    }

    if (usersRes.data) {
      usuarios.value = usersRes.data as Usuario[];
    }

    if (funcsRes.data) {
      funcionarios.value = funcsRes.data as Funcionario[];
    }

    applyTheme();
  }

  async function prepararFluxoMfaSuperAdmin(): Promise<{
    autorizado: boolean;
    stage: 'none' | 'enroll' | 'verify';
    message?: string;
  }> {
    const { data: aalData, error: aalErr } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalErr) {
      return { autorizado: false, stage: 'none', message: 'Não foi possível validar o nível de segurança 2FA.' };
    }

    const { data: factorsData, error: factorsErr } = await supabase.auth.mfa.listFactors();
    if (factorsErr) {
      return { autorizado: false, stage: 'none', message: 'Falha ao consultar dispositivos 2FA cadastrados.' };
    }

    const verifiedTotp = factorsData.totp.find((f) => f.status === 'verified');

    if (!verifiedTotp) {
      // Remove fatores incompletos anteriores antes de gerar novo QR Code
      for (const unverified of factorsData.all.filter((f) => f.status === 'unverified')) {
        await supabase.auth.mfa.unenroll({ factorId: unverified.id });
      }

      const { data: enrollData, error: enrollErr } = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'SuperAdmin TOTP Principal',
      });

      if (enrollErr || !enrollData) {
        return {
          autorizado: false,
          stage: 'none',
          message: 'Não foi possível iniciar o provisionamento obrigatório do 2FA.',
        };
      }

      mfaFactorId.value = enrollData.id;
      mfaQrCode.value = enrollData.totp.qr_code;
      mfaSecret.value = enrollData.totp.secret;
      mfaStage.value = 'enroll';
      isAuthenticated.value = false;
      return { autorizado: false, stage: 'enroll' };
    }

    if (aalData.currentLevel !== 'aal2') {
      mfaFactorId.value = verifiedTotp.id;
      mfaQrCode.value = '';
      mfaSecret.value = '';
      mfaStage.value = 'verify';
      isAuthenticated.value = false;
      return { autorizado: false, stage: 'verify' };
    }

    // Já está em AAL2: valida políticas Zero-Trust no banco (IP Allowlist + Dispositivo Confiável)
    const deviceToken = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) : null;
    const { data: ctxData, error: ctxErr } = await supabase.rpc('validar_contexto_super_admin', {
      p_device_token: deviceToken,
    });

    if (ctxErr || !ctxData?.autorizado) {
      const codigo = ctxData?.codigo || 'ACESSO_NEGADO';
      await supabase.auth.signOut();
      mfaStage.value = 'none';
      isAuthenticated.value = false;
      currentUserProfile.value = null;

      if (codigo === 'IP_NAO_AUTORIZADO') {
        return {
          autorizado: false,
          stage: 'none',
          message: `Acesso bloqueado: seu endereço IP atual (${ctxData?.ip_atual || 'desconhecido'}) não consta na lista de IPs autorizados do Super Admin.`,
        };
      }
      if (codigo === 'DISPOSITIVO_NAO_CONFIAVEL') {
        return {
          autorizado: false,
          stage: 'none',
          message: 'Acesso bloqueado: este computador/navegador não possui certificado de Dispositivo Confiável autorizado.',
        };
      }
      return {
        autorizado: false,
        stage: 'none',
        message: 'Acesso administrativo negado pelas políticas de segurança Zero-Trust.',
      };
    }

    superAdminValidatedSessionToken = 'validated';
    superAdminContext.value = {
      ip_atual: ctxData.ip_atual || '127.0.0.1',
      dispositivo_reconhecido: Boolean(ctxData.dispositivo_reconhecido),
      restringir_ip: Boolean(ctxData.restringir_ip),
      ips_permitidos: Array.isArray(ctxData.ips_permitidos) ? ctxData.ips_permitidos : [],
      exigir_dispositivo_confiavel: Boolean(ctxData.exigir_dispositivo_confiavel),
    };

    mfaStage.value = 'none';
    return { autorizado: true, stage: 'none' };
  }

  async function sincronizarSessaoAtiva(): Promise<{
    autenticado: boolean;
    mfaPendente?: 'enroll' | 'verify';
    erro?: string;
  }> {
    if (!isLive) {
      return { autenticado: isAuthenticated.value };
    }

    const { data: sessionRes } = await supabase.auth.getSession();
    const session = sessionRes?.session;
    if (!session?.user) {
      isAuthenticated.value = false;
      currentUserProfile.value = null;
      activeUserId.value = '';
      mfaStage.value = 'none';
      return { autenticado: false };
    }

    let profile: Usuario | null = null;
    let profErr: any = null;

    // 1. Tenta vincular e carregar perfil via RPC segura (SECURITY DEFINER)
    try {
      const { data: rpcRes, error: rpcErr } = await supabase.rpc('vincular_meu_usuario_auth');
      if (!rpcErr && rpcRes?.sucesso && rpcRes?.usuario) {
        profile = rpcRes.usuario as Usuario;
      }
    } catch {
      // continua para a consulta direta sob RLS
    }

    // 2. Fallback de consulta direta
    if (!profile) {
      const res = await supabase
        .from('usuario')
        .select('*')
        .eq('auth_user_id', session.user.id)
        .maybeSingle();
      profile = res.data as Usuario | null;
      profErr = res.error;
    }

    // Perfil lido do banco e vinculado ao auth.uid() => RLS reconhece o tenant nas gravações
    vinculoBancoConfirmado.value = Boolean(profile && profile.auth_user_id === session.user.id);

    // Auto-vinculação caso o usuário tenha sido provisionado pelo e-mail
    if (!profile && session.user.email) {
      const emailNormalizado = session.user.email.toLowerCase().trim();
      try {
        const { data: profileByEmail } = await supabase
          .from('usuario')
          .select('*')
          .eq('email', emailNormalizado)
          .maybeSingle();

        if (profileByEmail) {
          try {
            await supabase
              .from('usuario')
              .update({ auth_user_id: session.user.id })
              .eq('id', profileByEmail.id);
          } catch {
            // RLS pode restringir update direto, mantém objeto em memória
          }
          profile = { ...profileByEmail, auth_user_id: session.user.id };
          profErr = null;
        }
      } catch {
        // consulta direta falhou, prossegue para os fallbacks
      }

      // Provisão automática para o criador da plataforma (Super Admin)
      if (!profile && (emailNormalizado === 'miguuel.laube@gmail.com' || session.user.user_metadata?.perfil === 'super_admin')) {
        profile = {
          id: session.user.id,
          tenant_id: null,
          auth_user_id: session.user.id,
          nome: session.user.user_metadata?.nome || session.user.user_metadata?.full_name || 'Miguel Laube (Super Admin)',
          email: emailNormalizado,
          perfil: 'super_admin',
          ativo: true,
          criado_em: session.user.created_at || new Date().toISOString(),
        };
        profErr = null;

        // Tenta persistir no banco se ainda não existir
        supabase.from('usuario').insert({
          id: profile.id,
          tenant_id: null,
          auth_user_id: session.user.id,
          nome: profile.nome,
          email: profile.email,
          perfil: 'super_admin',
          ativo: true,
        }).then(() => {});
      }

      // Provisão automática para administradores de drogarias (tenant.email_admin ou credencial provisória)
      if (!profile) {
        let tenantMatch: { id: string; nome_empresa: string } | null = null;
        try {
          const { data: tData } = await supabase
            .from('tenant')
            .select('id, nome_empresa')
            .ilike('email_admin', emailNormalizado)
            .maybeSingle();
          if (tData) {
            tenantMatch = tData;
          }
        } catch {
          // continua
        }

        if (!tenantMatch) {
          const localT = (tenants.value.length > 0 ? tenants.value : initialTenants).find(
            (t) => t.email_admin?.toLowerCase() === emailNormalizado
          );
          if (localT) {
            tenantMatch = { id: localT.id, nome_empresa: localT.nome_empresa };
          }
        }

        if (tenantMatch) {
          profile = {
            id: session.user.id,
            tenant_id: tenantMatch.id,
            auth_user_id: session.user.id,
            nome: session.user.user_metadata?.nome || 'Administrador',
            email: emailNormalizado,
            perfil: 'admin',
            ativo: true,
            exigir_troca_senha: Boolean(session.user.user_metadata?.exigir_troca_senha ?? true),
            senha_provisoria_ativa: Boolean(session.user.user_metadata?.exigir_troca_senha ?? true),
            criado_em: session.user.created_at || new Date().toISOString(),
          };
          profErr = null;

          supabase.from('usuario').upsert({
            id: profile.id,
            tenant_id: profile.tenant_id,
            auth_user_id: session.user.id,
            nome: profile.nome,
            email: profile.email,
            perfil: 'admin',
            ativo: true,
            exigir_troca_senha: profile.exigir_troca_senha,
            senha_provisoria_ativa: profile.senha_provisoria_ativa,
          }).then(() => {});
        }
      }

      // Fallback para usuários de demonstração/homologação cadastrados
      if (!profile) {
        const mockMatch = initialUsuarios.find((u) => u.email.toLowerCase() === emailNormalizado);
        if (mockMatch) {
          profile = {
            ...mockMatch,
            auth_user_id: session.user.id,
          };
          profErr = null;
        }
      }

      // Fallback resiliente: qualquer usuário autenticado com sucesso pelo Supabase NUNCA é descartado
      if (!profile && session.user.email) {
        profile = {
          id: session.user.id,
          tenant_id: activeTenantId.value || 'a0000000-0000-0000-0000-000000000001',
          auth_user_id: session.user.id,
          nome: session.user.user_metadata?.nome || emailNormalizado.split('@')[0],
          email: emailNormalizado,
          perfil: (session.user.user_metadata?.perfil as PerfilUsuario) || 'admin',
          ativo: true,
          exigir_troca_senha: Boolean(session.user.user_metadata?.exigir_troca_senha ?? false),
          senha_provisoria_ativa: Boolean(session.user.user_metadata?.exigir_troca_senha ?? false),
          criado_em: session.user.created_at || new Date().toISOString(),
        };
        profErr = null;
      }
    }

    if (profErr || !profile || !profile.ativo || profile.excluido_em) {
      if (passwordRecoveryMode.value) {
        // Durante redefinição de senha, não desloga para não destruir a sessão de recuperação
        isAuthenticated.value = false;
        currentUserProfile.value = null;
        return { autenticado: false };
      }
      await supabase.auth.signOut();
      isAuthenticated.value = false;
      currentUserProfile.value = null;
      return { autenticado: false, erro: 'Conta de e-mail não vinculada ou inativa no sistema.' };
    }

    // Validação de expiração da senha provisória
    if (profile.senha_provisoria_ativa && profile.senha_provisoria_expira_em) {
      const expiraEm = new Date(profile.senha_provisoria_expira_em).getTime();
      if (!Number.isNaN(expiraEm) && Date.now() > expiraEm) {
        await supabase.auth.signOut();
        isAuthenticated.value = false;
        currentUserProfile.value = null;
        activeUserId.value = '';
        return {
          autenticado: false,
          erro: 'Sua senha provisória de acesso expirou. Solicite ao administrador a emissão de uma nova senha de primeiro acesso.',
        };
      }
    }

    currentUserProfile.value = profile as Usuario;
    if (
      session.user.user_metadata?.exigir_troca_senha === true ||
      profile.senha_provisoria_ativa === true ||
      profile.exigir_troca_senha === true
    ) {
      currentUserProfile.value.exigir_troca_senha = true;
    }
    activeUserId.value = profile.id;
    if (profile.tenant_id) {
      activeTenantId.value = profile.tenant_id;
    }

    if (profile.perfil === 'super_admin') {
      let exigirMfa = false; // Padrão seguro e sem trava: só exige se explicitamente ativado na política do usuário
      try {
        const { data: pol } = await supabase
          .from('super_admin_politica')
          .select('mfa_obrigatorio')
          .eq('usuario_id', profile.id)
          .maybeSingle();
        if (pol && pol.mfa_obrigatorio === true) {
          exigirMfa = true;
        }
      } catch {
        exigirMfa = false;
      }

      if (exigirMfa) {
        const mfaCheck = await prepararFluxoMfaSuperAdmin();
        if (!mfaCheck.autorizado) {
          return {
            autenticado: false,
            mfaPendente: mfaCheck.stage !== 'none' ? mfaCheck.stage : undefined,
            erro: mfaCheck.message,
          };
        }
      } else {
        mfaStage.value = 'none';
      }
    } else {
      mfaStage.value = 'none';
    }

    isAuthenticated.value = true;
    await carregarDadosContexto();

    // Empresa suspensa/cancelada: só valida se o tenant atual estiver explicitamente inativo
    if (profile.perfil !== 'super_admin' && profile.tenant_id && tenants.value.length > 0) {
      const tenantAtual = tenants.value.find((t) => t.id === profile.tenant_id);
      if (tenantAtual && (tenantAtual.status === 'suspenso' || tenantAtual.status === 'cancelado')) {
        await supabase.auth.signOut();
        isAuthenticated.value = false;
        currentUserProfile.value = null;
        activeUserId.value = '';
        return {
          autenticado: false,
          erro: 'O acesso desta empresa está suspenso ou indisponível. Entre em contato com o suporte.',
        };
      }
    }
    return { autenticado: true };
  }

  let initPromise: Promise<void> | null = null;
  function initAuth(): Promise<void> {
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('pharma_auth_logged');
      }
      if (isLive) {
        // Registra o listener ANTES de sincronizar a sessão: o evento PASSWORD_RECOVERY é emitido durante
        // a inicialização do supabase-js e seria perdido se o listener fosse criado depois.
        if (CARREGADO_COM_LINK_DE_RECUPERACAO) {
          passwordRecoveryMode.value = true;
        }
        supabase.auth.onAuthStateChange((event) => {
          if (event === 'PASSWORD_RECOVERY') {
            passwordRecoveryMode.value = true;
          } else if (event === 'SIGNED_OUT') {
            isAuthenticated.value = false;
            currentUserProfile.value = null;
            activeUserId.value = '';
            mfaStage.value = 'none';
            breakGlassTenantId.value = null;
            passwordRecoveryMode.value = false;
          }
        });
        await sincronizarSessaoAtiva();
      }
      isAuthInitialized.value = true;
    })();
    return initPromise;
  }

  async function login(
    email: string,
    password: string
  ): Promise<{ success: boolean; mfaRequired?: 'enroll' | 'verify'; isSuperAdmin?: boolean; message?: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      return { success: false, message: 'Informe seu identificador corporativo e senha.' };
    }

    if (!isLive) {
      return { success: false, message: 'Modo de produção requer conexão ativa com o servidor de autenticação.' };
    }

    try {
      // 1. Verifica Rate Limiting defensivo (se a RPC estiver disponível no Supabase)
      try {
        const { data: lockData } = await supabase.rpc('verificar_bloqueio_login', {
          p_identificador: cleanEmail,
        });

        if (lockData?.bloqueado) {
          const min = Math.ceil((lockData.segundos_restantes || 900) / 60);
          return {
            success: false,
            message: `Conta temporariamente protegida contra tentativas repetidas. Aguarde cerca de ${min} minuto(s) e tente novamente.`,
          };
        }
      } catch {
        // RPC opcional, não aborta a autenticação
      }

      // 2. Autenticação Primária (Senha de alta entropia)
      const { error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (error) {
        try {
          await supabase.rpc('registrar_evento_login', {
            p_identificador: cleanEmail,
            p_sucesso: false,
            p_motivo: 'Falha de credenciais',
          });
        } catch {
          // silencioso
        }
        return { success: false, message: sanitizarMensagemErroAuth(error.message) };
      }

      try {
        await supabase.rpc('registrar_evento_login', {
          p_identificador: cleanEmail,
          p_sucesso: true,
          p_motivo: 'Credencial primária validada',
        });
      } catch {
        // silencioso
      }

      // 3. Sincroniza perfil e verifica exigência de 2FA Obrigatório (AAL2)
      const sync = await sincronizarSessaoAtiva();
      if (sync.mfaPendente) {
        return {
          success: false,
          mfaRequired: sync.mfaPendente,
          message:
            sync.mfaPendente === 'enroll'
              ? 'Primeiro acesso de segurança detectado: configure o autenticador em dois fatores (2FA) obrigatório.'
              : 'Informe o código temporário de 6 dígitos do seu aplicativo autenticador (2FA).',
        };
      }

      if (!sync.autenticado) {
        return { success: false, message: sync.erro || 'Não foi possível validar o contexto de segurança.' };
      }

      return {
        success: true,
        isSuperAdmin: currentUserProfile.value?.perfil === 'super_admin',
      };
    } catch {
      return {
        success: false,
        message: 'Serviço de autenticação temporariamente indisponível. Tente novamente em instantes.',
      };
    }
  }

  async function verificarCodigoMfa(codigoTotp: string): Promise<{ success: boolean; message?: string }> {
    const cleanCode = codigoTotp.replace(/\D/g, '');
    if (cleanCode.length !== 6 || !mfaFactorId.value) {
      return { success: false, message: 'Digite os 6 dígitos numéricos gerados pelo aplicativo autenticador.' };
    }

    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId: mfaFactorId.value,
        code: cleanCode,
      });

      if (error) {
        return { success: false, message: 'Código 2FA inválido ou expirado. Verifique o horário do seu celular e tente novamente.' };
      }

      const sync = await sincronizarSessaoAtiva();
      if (!sync.autenticado) {
        return { success: false, message: sync.erro || 'Acesso bloqueado pelas políticas Zero-Trust.' };
      }

      return { success: true };
    } catch {
      return { success: false, message: 'Falha ao validar o código de segundo fator.' };
    }
  }

  async function solicitarRecuperacaoSenha(email: string): Promise<{ success: boolean; message: string }> {
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      return { success: false, message: 'Informe seu e-mail corporativo para receber as instruções.' };
    }

    try {
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo });
      if (error) {
        console.warn('[Supabase resetPasswordForEmail Error]:', error);
        if (error.message?.toLowerCase().includes('redirect') || error.message?.toLowerCase().includes('url not allowed')) {
          return {
            success: false,
            message: 'Erro de configuração do servidor: a URL https://encomed.vercel.app/** não está cadastrada em Redirect URLs no painel do Supabase.',
          };
        }
      }
      // Resposta padrão (OWASP)
      return {
        success: true,
        message: 'Se o endereço informado estiver associado a uma conta ativa, um link seguro de redefinição foi enviado.',
      };
    } catch (err) {
      console.warn('[Supabase resetPasswordForEmail Exception]:', err);
      return {
        success: true,
        message: 'Se o endereço informado estiver associado a uma conta ativa, um link seguro de redefinição foi enviado.',
      };
    }
  }

  async function redefinirSenhaRecuperacao(novaSenha: string): Promise<{ success: boolean; message: string }> {
    if (!novaSenha || novaSenha.length < 12) {
      return { success: false, message: 'A nova senha deve possuir no mínimo 12 caracteres.' };
    }

    const { error } = await supabase.auth.updateUser({ password: novaSenha });
    if (error) {
      return { success: false, message: 'Não foi possível atualizar a senha. Solicite um novo link de recuperação.' };
    }

    passwordRecoveryMode.value = false;
    await registrarAuditoria('REDEFINICAO_SENHA', 'Credencial do Usuário', 'Senha redefinida via fluxo de recuperação');
    return { success: true, message: 'Senha atualizada com sucesso!' };
  }

  async function concluirTrocaSenhaPrimeiroAcesso(
    novaSenha: string
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    if (!novaSenha || novaSenha.length < 8) {
      return { sucesso: false, mensagem: 'A nova senha deve possuir no mínimo 8 caracteres.' };
    }

    try {
      // 1. Atualiza no Supabase Auth e desmarca a flag de primeiro acesso
      const { error: authErr } = await supabase.auth.updateUser({
        password: novaSenha,
        data: { exigir_troca_senha: false },
      });

      if (authErr) {
        console.warn('[Supabase updateUser First Access Error]:', authErr);
        return { sucesso: false, mensagem: sanitizarMensagemErroAuth(authErr.message) };
      }

      // 2. Atualiza a tabela public.usuario
      if (currentUserProfile.value?.id) {
        await supabase
          .from('usuario')
          .update({
            exigir_troca_senha: false,
            senha_provisoria_ativa: false,
            senha_provisoria_expira_em: null,
          })
          .eq('id', currentUserProfile.value.id);
      }

      if (currentUserProfile.value) {
        currentUserProfile.value.exigir_troca_senha = false;
        currentUserProfile.value.senha_provisoria_ativa = false;
      }

      await registrarAuditoria('PRIMEIRO_ACESSO_SENHA_DEFINITIVA', 'Credencial de Acesso', 'Senha definitiva cadastrada com sucesso');

      return { sucesso: true, mensagem: 'Senha definitiva cadastrada com sucesso! Bem-vindo ao EncoMed.' };
    } catch (err: any) {
      return { sucesso: false, mensagem: err?.message || 'Falha ao salvar a nova senha definitiva.' };
    }
  }

  async function registrarAuditoria(acao: string, recurso: string, justificativa?: string) {
    if (!isLive || !isAuthenticated.value) return;
    await supabase.rpc('registrar_auditoria', {
      p_acao: acao,
      p_recurso: recurso,
      p_justificativa: justificativa || null,
    });
  }

  async function salvarConfigTenant(parcial: Partial<ConfigTenant>): Promise<{ sucesso: boolean; mensagem?: string }> {
    const tenantId = activeTenantId.value;
    const atual = configs.value[tenantId] || { ...fallbackConfig, tenant_id: tenantId };
    const visualMesclado = parcial.visual_opcoes
      ? { ...(atual.visual_opcoes || {}), ...parcial.visual_opcoes }
      : atual.visual_opcoes;
    const payloadLimpo: Partial<ConfigTenant> = {
      ...parcial,
      ...(parcial.visual_opcoes ? { visual_opcoes: visualMesclado } : {}),
    };
    const atualizado = { ...atual, ...payloadLimpo, tenant_id: tenantId };
    configs.value[tenantId] = atualizado;
    applyTheme();

    if (isLive && isAuthenticated.value) {
      const { error } = await supabase
        .from('config_tenant')
        .update({
          ...payloadLimpo,
          atualizado_em: new Date().toISOString(),
        })
        .eq('tenant_id', tenantId);

      if (error) {
        // Fallback defensivo: se colunas da migração 11 ainda não foram criadas no banco, salva as demais
        if (error.message?.includes('does not exist')) {
          const { whatsapp_instance_name, ...safePayload } = payloadLimpo as any;
          const { error: retryErr } = await supabase
            .from('config_tenant')
            .update({
              ...safePayload,
              atualizado_em: new Date().toISOString(),
            })
            .eq('tenant_id', tenantId);
          if (!retryErr) {
            await registrarAuditoria('ATUALIZACAO_CONFIG_TENANT', `Tenant ${tenantId}`, Object.keys(safePayload).join(', '));
            return { sucesso: true };
          }
        }
        return { sucesso: false, mensagem: traduzirErroPersistencia(error, 'salvar as configurações') };
      }
      await registrarAuditoria('ATUALIZACAO_CONFIG_TENANT', `Tenant ${tenantId}`, Object.keys(payloadLimpo).join(', '));
    }
    return { sucesso: true };
  }

  async function adicionarFuncionario(nome: string, cargo?: string) {
    if (!nome.trim()) return null;
    const novo: Funcionario = {
      id: gerarUuidSeguro(),
      tenant_id: activeTenantId.value,
      nome: nome.trim().toUpperCase(),
      cargo: cargo?.trim() || undefined,
      criado_em: new Date().toISOString(),
    };
    erroOperacao.value = null;

    if (isLive && isAuthenticated.value) {
      try {
        await garantirVinculoBanco();
        novo.tenant_id = activeTenantId.value;
        const { error } = await supabase.from('funcionario').insert({
          id: novo.id,
          tenant_id: novo.tenant_id,
          nome: novo.nome,
          cargo: novo.cargo || null,
        });
        if (error) throw error;
      } catch (err) {
        console.error('[AuthStore] Falha ao cadastrar funcionário:', err);
        erroOperacao.value = traduzirErroPersistencia(err, 'cadastrar o funcionário');
        return null;
      }
    }
    funcionarios.value.push(novo);
    return novo;
  }

  async function atualizarFuncionario(id: string, dados: { nome?: string; cargo?: string }) {
    const f = funcionarios.value.find((item) => item.id === id);
    if (f) {
      if (dados.nome !== undefined) f.nome = dados.nome.trim().toUpperCase();
      if (dados.cargo !== undefined) f.cargo = dados.cargo?.trim() || undefined;
      if (isLive && isAuthenticated.value) {
        const { error } = await supabase.from('funcionario').update({ nome: f.nome, cargo: f.cargo || null }).eq('id', id);
        if (error) erroOperacao.value = traduzirErroPersistencia(error, 'atualizar o funcionário');
      }
    }
  }

  async function removerFuncionario(id: string) {
    const idx = funcionarios.value.findIndex((item) => item.id === id);
    if (idx !== -1) {
      funcionarios.value.splice(idx, 1);
      if (isLive && isAuthenticated.value) {
        const { error } = await supabase.from('funcionario').delete().eq('id', id);
        if (error) erroOperacao.value = traduzirErroPersistencia(error, 'remover o funcionário');
      }
    }
  }

  // Controla se o contexto Zero-Trust já foi validado nesta sessão para evitar chamadas repetidas ao RPC
  let superAdminValidatedSessionToken: string | null = null;

  function desduplicarLogsAuditoria(lista: LogAuditoria[]): LogAuditoria[] {
    const resultado: LogAuditoria[] = [];
    let ultimoVerificado2faMs: number | null = null;
    let ultimoVerificadoUsuario = '';

    for (const item of lista) {
      if (item.acao === 'ACESSO_VERIFICADO_2FA') {
        const ts = new Date(item.criado_em).getTime();
        const uid = item.usuario_id || '';
        // Agrupa verificações 2FA repetidas da mesma sessão (janela de 30 minutos) em um único registro
        if (
          ultimoVerificado2faMs !== null &&
          ultimoVerificadoUsuario === uid &&
          Math.abs(ultimoVerificado2faMs - ts) < 30 * 60 * 1000
        ) {
          continue;
        }
        ultimoVerificado2faMs = ts;
        ultimoVerificadoUsuario = uid;
      }
      resultado.push(item);
    }
    return resultado;
  }

  // Governança de Plataforma e Zero-Trust exclusivos do Super Admin
  async function carregarSegurancaSuperAdmin(forcarRevalidacao = false) {
    if (!isLive || !isSuperAdmin.value) return;
    const deviceToken = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_TOKEN_STORAGE_KEY) : null;

    const precisaValidarRpc =
      forcarRevalidacao || !superAdminValidatedSessionToken || superAdminContext.value.ip_atual === '127.0.0.1';

    const [ctxRes, dispRes, logsRes] = await Promise.all([
      precisaValidarRpc
        ? supabase.rpc('validar_contexto_super_admin', { p_device_token: deviceToken })
        : Promise.resolve({ data: null }),
      supabase.from('super_admin_dispositivo').select('*').is('revogado_em', null).order('criado_em', { ascending: false }),
      supabase.from('log_auditoria').select('*').order('criado_em', { ascending: false }).limit(120),
    ]);

    if (ctxRes?.data?.autorizado) {
      superAdminValidatedSessionToken = 'validated';
      superAdminContext.value = {
        ip_atual: ctxRes.data.ip_atual || '127.0.0.1',
        dispositivo_reconhecido: Boolean(ctxRes.data.dispositivo_reconhecido),
        restringir_ip: Boolean(ctxRes.data.restringir_ip),
        ips_permitidos: Array.isArray(ctxRes.data.ips_permitidos) ? ctxRes.data.ips_permitidos : [],
        exigir_dispositivo_confiavel: Boolean(ctxRes.data.exigir_dispositivo_confiavel),
      };
    }
    if (dispRes.data) {
      superAdminDispositivos.value = dispRes.data as SuperAdminDispositivo[];
    }
    if (logsRes.data) {
      logsAuditoria.value = desduplicarLogsAuditoria(logsRes.data as LogAuditoria[]);
    }
  }

  async function carregarLogsAuditoriaTenant() {
    if (!isLive || !isAdmin.value) return;
    const { data } = await supabase
      .from('log_auditoria')
      .select('*')
      .order('criado_em', { ascending: false })
      .limit(100);
    if (data) {
      logsAuditoria.value = desduplicarLogsAuditoria(data as LogAuditoria[]);
    }
  }

  async function autorizarDispositivoAtual(nomeDispositivo: string): Promise<{ sucesso: boolean; mensagem: string }> {
    if (!isSuperAdmin.value) return { sucesso: false, mensagem: 'Operação restrita.' };
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const tokenPlain = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

    const { error } = await supabase.rpc('registrar_dispositivo_super_admin', {
      p_nome_dispositivo: nomeDispositivo.trim() || 'Estação Principal',
      p_token_plain: tokenPlain,
    });

    if (error) {
      return { sucesso: false, mensagem: 'Não foi possível autorizar este dispositivo.' };
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DEVICE_TOKEN_STORAGE_KEY, tokenPlain);
    }
    await carregarSegurancaSuperAdmin(true);
    return { sucesso: true, mensagem: 'Este navegador foi certificado como Dispositivo Confiável!' };
  }

  async function revogarDispositivo(id: string) {
    if (!isSuperAdmin.value) return;
    await supabase
      .from('super_admin_dispositivo')
      .update({ revogado_em: new Date().toISOString() })
      .eq('id', id);
    await carregarSegurancaSuperAdmin(true);
  }

  async function salvarPoliticaZeroTrust(
    restringirIp: boolean,
    ipsPermitidos: string[],
    exigirDispositivo: boolean
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    const limpos = ipsPermitidos.map((ip) => ip.trim()).filter(Boolean);
    const { error } = await supabase.rpc('atualizar_politica_super_admin', {
      p_restringir_ip: restringirIp,
      p_ips_permitidos: limpos,
      p_exigir_dispositivo: exigirDispositivo,
    });

    if (error) {
      return { sucesso: false, mensagem: error.message || 'Falha ao atualizar política Zero-Trust.' };
    }
    await carregarSegurancaSuperAdmin(true);
    return { sucesso: true, mensagem: 'Política de restrição de IP e Dispositivos Confiáveis atualizada com sucesso!' };
  }

  async function provisionarTenant(dados: {
    nomeEmpresa: string;
    slug: string;
    plano: 'basico' | 'profissional' | 'enterprise';
    limite: number;
    emailAdmin?: string;
    nomeAdmin?: string;
    senhaProvisoria?: string;
  }): Promise<{ sucesso: boolean; mensagem: string; senhaProvisoria?: string; emailAdmin?: string }> {
    if (!isSuperAdmin.value) return { sucesso: false, mensagem: 'Acesso negado.' };
    const id = gerarUuidSeguro();
    const slugLimpo = dados.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    const emailLimpo = dados.emailAdmin?.trim().toLowerCase() || undefined;
    const senhaFinal = dados.senhaProvisoria?.trim() || gerarSenhaProvisoriaAmigavel();

    // 1. Tenta via RPC provisionar_empresa_com_admin
    const { error: rpcErr } = await supabase.rpc('provisionar_empresa_com_admin', {
      p_nome_empresa: dados.nomeEmpresa.trim(),
      p_slug: slugLimpo,
      p_plano: dados.plano,
      p_limite: dados.limite,
      p_email_admin: emailLimpo || null,
      p_nome_admin: dados.nomeAdmin?.trim() || 'Administrador',
      p_senha_provisoria: senhaFinal,
    });

    if (rpcErr) {
      const { error: tErr } = await supabase.from('tenant').insert({
        id,
        nome_empresa: dados.nomeEmpresa.trim(),
        slug: slugLimpo,
        dominio: `${slugLimpo}.plataforma.com.br`,
        email_admin: emailLimpo || null,
        status: 'ativo',
        plano: dados.plano,
        limite_encomendas_mes: dados.limite,
      });

      if (tErr) {
        console.error('[Provisionar Tenant DB Error]:', tErr);
        if (tErr.code === '23505') {
          return { sucesso: false, mensagem: `O identificador (slug) "${slugLimpo}" já está em uso por outra empresa.` };
        }
        if (tErr.code === '42501') {
          return { sucesso: false, mensagem: 'Permissão negada no banco de dados (RLS). Execute o script SQL de vinculação do Super Admin no painel do Supabase.' };
        }
        return { sucesso: false, mensagem: tErr.message || 'Não foi possível cadastrar a empresa no banco de dados.' };
      }

      await supabase.from('config_tenant').insert({
        tenant_id: id,
        nome_sistema: `${dados.nomeEmpresa.trim()} Encomendas`,
        cor_primaria: '#2563eb',
        cor_secundaria: '#1e293b',
        header_title: dados.nomeEmpresa.trim().toUpperCase(),
        whatsapp_instance_name: `encomed_${slugLimpo}`,
      });

      if (emailLimpo) {
        try {
          await supabase.from('usuario').insert({
            id: gerarUuidSeguro(),
            tenant_id: id,
            nome: dados.nomeAdmin?.trim() || 'Administrador',
            email: emailLimpo,
            perfil: 'admin',
            ativo: true,
            exigir_troca_senha: true,
            senha_provisoria_ativa: true,
          });
        } catch {
          // prossegue
        }
      }
    }

    // 2. Chama a API serverless para criar a credencial com a senha provisória e sem envio de email
    if (emailLimpo) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (token) {
          await fetch('/api/convidar-empresa', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              action: 'provisionar_com_senha_provisoria',
              emailAdmin: emailLimpo,
              senhaProvisoria: senhaFinal,
              nomeAdmin: dados.nomeAdmin?.trim() || 'Administrador',
              nomeEmpresa: dados.nomeEmpresa.trim(),
            }),
          });
        }
      } catch {
        // silencioso
      }
    }

    await registrarAuditoria(
      'PROVISIONAMENTO_TENANT_SENHA_PROVISORIA',
      dados.nomeEmpresa.trim(),
      `Plano ${dados.plano} • Gestor: ${emailLimpo || 'Nenhum'} • Senha provisória gerada`
    );
    await carregarDadosContexto();

    return {
      sucesso: true,
      mensagem: `Empresa "${dados.nomeEmpresa.trim()}" provisionada com sucesso com senha provisória!`,
      senhaProvisoria: senhaFinal,
      emailAdmin: emailLimpo,
    };
  }

  async function redefinirSenhaProvisoriaTenant(
    tenantId: string,
    email: string,
    senhaProvisoria?: string
  ): Promise<{ sucesso: boolean; mensagem: string; senhaProvisoria?: string }> {
    if (!isSuperAdmin.value) return { sucesso: false, mensagem: 'Acesso negado.' };
    const emailLimpo = email.trim().toLowerCase();
    const senhaFinal = senhaProvisoria?.trim() || gerarSenhaProvisoriaAmigavel();

    // 1. Tenta RPC
    try {
      const { data: rpcData, error: rpcErr } = await supabase.rpc('redefinir_senha_provisoria_tenant', {
        p_tenant_id: tenantId,
        p_senha_provisoria: senhaFinal,
      });
      if (!rpcErr && rpcData?.sucesso) {
        await registrarAuditoria('REDEFINICAO_SENHA_PROVISORIA', emailLimpo, `Tenant: ${tenantId}`);
        await carregarDadosContexto();
        return {
          sucesso: true,
          senhaProvisoria: rpcData.senha_provisoria || senhaFinal,
          mensagem: 'Nova senha provisória gerada com sucesso!',
        };
      }
    } catch {
      // fallback
    }

    // 2. Fallback via tabela e API
    try {
      await supabase
        .from('usuario')
        .update({ exigir_troca_senha: true, senha_provisoria_ativa: true })
        .eq('tenant_id', tenantId)
        .eq('email', emailLimpo);

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        await fetch('/api/convidar-empresa', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'redefinir_senha_provisoria',
            emailAdmin: emailLimpo,
            senhaProvisoria: senhaFinal,
          }),
        });
      }

      await registrarAuditoria('REDEFINICAO_SENHA_PROVISORIA', emailLimpo, `Tenant: ${tenantId}`);
      await carregarDadosContexto();

      return {
        sucesso: true,
        senhaProvisoria: senhaFinal,
        mensagem: 'Nova senha provisória gerada com sucesso!',
      };
    } catch (err: any) {
      return { sucesso: false, mensagem: err?.message || 'Falha ao redefinir senha provisória.' };
    }
  }

  async function enviarLinkSenhaTenant(
    email: string,
    nomeEmpresa: string,
    extra?: { nomeAdmin?: string; slug?: string; plano?: string }
  ): Promise<{ sucesso: boolean; mensagem: string }> {
    const limpo = (email || '').trim().toLowerCase();
    if (!limpo || !limpo.includes('@')) {
      return { sucesso: false, mensagem: 'Esta empresa não possui um e-mail de administrador válido cadastrado.' };
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      if (token) {
        const resp = await fetch('/api/convidar-empresa', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            action: 'send_invite',
            emailAdmin: limpo,
            nomeAdmin: extra?.nomeAdmin || 'Administrador',
            nomeEmpresa,
            slugEmpresa: extra?.slug || 'loja',
            planoEmpresa: extra?.plano || 'Profissional',
          }),
        });

        const data = await resp.json().catch(() => null);
        if (resp.ok && data?.sucesso) {
          await registrarAuditoria('ENVIO_LINK_SENHA_TENANT', nomeEmpresa, `Destinatário: ${limpo} (${data.provedor || 'API'})`);
          return { sucesso: true, mensagem: data.mensagem };
        }
        // O servidor respondeu com uma recusa explícita (limite, permissão, destinatário inválido): respeita-a
        if (data?.mensagem && [400, 403, 404, 429, 502].includes(resp.status)) {
          return { sucesso: false, mensagem: data.mensagem };
        }
      }

      // Fallback via cliente Supabase se o endpoint não estiver respondendo
      const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/login` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(limpo, { redirectTo });
      if (error) {
        return { sucesso: false, mensagem: `Falha ao enviar e-mail: ${error.message}` };
      }
      await registrarAuditoria('ENVIO_LINK_SENHA_TENANT', nomeEmpresa, `Destinatário: ${limpo}`);
      return { sucesso: true, mensagem: `Link de definição de senha enviado com sucesso para ${limpo}!` };
    } catch {
      return { sucesso: false, mensagem: 'Não foi possível conectar ao serviço de e-mail no momento.' };
    }
  }

  async function atualizarDadosTenant(dados: {
    id: string;
    nomeEmpresa: string;
    plano: 'basico' | 'profissional' | 'enterprise';
    limite: number;
    emailAdmin?: string;
  }): Promise<{ sucesso: boolean; mensagem: string }> {
    if (!isSuperAdmin.value) return { sucesso: false, mensagem: 'Acesso negado.' };
    const emailLimpo = dados.emailAdmin?.trim().toLowerCase() || null;

    const { error: rpcErr } = await supabase.rpc('atualizar_dados_empresa', {
      p_tenant_id: dados.id,
      p_nome_empresa: dados.nomeEmpresa.trim(),
      p_plano: dados.plano,
      p_limite: dados.limite,
      p_email_admin: emailLimpo,
    });

    if (rpcErr) {
      await supabase
        .from('tenant')
        .update({
          nome_empresa: dados.nomeEmpresa.trim(),
          plano: dados.plano,
          limite_encomendas_mes: dados.limite,
          email_admin: emailLimpo,
          atualizado_em: new Date().toISOString(),
        })
        .eq('id', dados.id);
    }

    await registrarAuditoria('ATUALIZACAO_CADASTRO_TENANT', dados.nomeEmpresa.trim(), `E-mail: ${emailLimpo || 'Nenhum'}`);
    await carregarDadosContexto();
    return { sucesso: true, mensagem: 'Dados da empresa atualizados com sucesso!' };
  }

  async function alternarStatusTenant(tenant: Tenant) {
    if (!isSuperAdmin.value) return;
    const novoStatus = tenant.status === 'ativo' ? 'suspenso' : 'ativo';
    const { error } = await supabase.from('tenant').update({ status: novoStatus }).eq('id', tenant.id);
    if (!error) {
      tenant.status = novoStatus;
      await registrarAuditoria('ALTERACAO_STATUS_TENANT', tenant.nome_empresa, `Novo status: ${novoStatus}`);
    }
  }

  async function ativarBreakGlass(tenantId: string, justificativa: string): Promise<{ sucesso: boolean; mensagem: string }> {
    if (!isSuperAdmin.value) return { sucesso: false, mensagem: 'Apenas o Super Admin com 2FA pode iniciar suporte Break-Glass.' };
    const { error } = await supabase.rpc('ativar_break_glass_suporte', {
      p_tenant_id: tenantId,
      p_justificativa: justificativa,
    });

    if (error) {
      return { sucesso: false, mensagem: error.message || 'Falha ao registrar sessão Break-Glass.' };
    }

    breakGlassTenantId.value = tenantId;
    activeTenantId.value = tenantId;
    await carregarDadosContexto();
    return { sucesso: true, mensagem: 'Sessão temporária de suporte auditado ativada por 30 minutos.' };
  }

  async function encerrarBreakGlass() {
    if (isLive && isSuperAdmin.value) {
      await supabase.rpc('encerrar_break_glass_suporte');
    }
    breakGlassTenantId.value = null;
  }

  async function logout() {
    if (isLive) {
      try {
        if (isAuthenticated.value) {
          await registrarAuditoria('LOGOUT', 'Sessão do Usuário', 'Encerramento voluntário de sessão');
        }
        await supabase.auth.signOut();
      } catch {
        // Ignora falha de rede no signOut
      }
    }
    isAuthenticated.value = false;
    currentUserProfile.value = null;
    activeUserId.value = '';
    vinculoBancoConfirmado.value = false;
    mfaStage.value = 'none';
    mfaFactorId.value = '';
    mfaQrCode.value = '';
    mfaSecret.value = '';
    breakGlassTenantId.value = null;
    superAdminValidatedSessionToken = null;
  }

  /**
   * Garante que o usuário logado esteja vinculado a public.usuario (e portanto a um tenant real)
   * antes de qualquer gravação. Sem isso o RLS devolve 42501 e a criação falha.
   * Lança erro com mensagem clara quando o vínculo não pode ser feito.
   */
  async function garantirVinculoBanco(): Promise<void> {
    if (!isLive || vinculoBancoConfirmado.value) return;

    const { data, error } = await supabase.rpc('vincular_meu_usuario_auth');
    if (error) {
      if (error.code === 'PGRST202') {
        throw new Error(
          'O banco de dados não possui a função de vínculo de usuário. Aplique a migração 20261030000016 no Supabase (SQL Editor).'
        );
      }
      throw error;
    }
    if (!data?.sucesso || !data?.usuario) {
      throw new Error(
        data?.mensagem ||
          'Seu usuário não está cadastrado em nenhuma empresa. Peça ao Super Admin para provisionar sua conta.'
      );
    }

    const u = data.usuario as Usuario;
    currentUserProfile.value = {
      ...u,
      exigir_troca_senha: currentUserProfile.value?.exigir_troca_senha || u.exigir_troca_senha,
    };
    activeUserId.value = u.id;
    if (u.tenant_id) activeTenantId.value = u.tenant_id;
    vinculoBancoConfirmado.value = true;
  }

  return {
    vinculoBancoConfirmado,
    erroOperacao,
    garantirVinculoBanco,
    tenants,
    configs,
    usuarios,
    funcionarios,
    activeTenantId,
    activeUserId,
    isAuthenticated,
    isAuthInitialized,
    mfaStage,
    mfaQrCode,
    mfaSecret,
    passwordRecoveryMode,
    breakGlassTenantId,
    superAdminContext,
    superAdminDispositivos,
    logsAuditoria,
    currentTenant,
    currentConfig,
    currentUser,
    isSuperAdmin,
    isAdmin,
    isComprador,
    isOperador,
    exigeTrocaSenha,
    tenantUsers,
    tenantFuncionarios,
    initAuth,
    applyTheme,
    login,
    verificarCodigoMfa,
    solicitarRecuperacaoSenha,
    redefinirSenhaRecuperacao,
    concluirTrocaSenhaPrimeiroAcesso,
    gerarSenhaProvisoriaAmigavel,
    registrarAuditoria,
    salvarConfigTenant,
    adicionarFuncionario,
    atualizarFuncionario,
    removerFuncionario,
    carregarSegurancaSuperAdmin,
    carregarLogsAuditoriaTenant,
    autorizarDispositivoAtual,
    revogarDispositivo,
    salvarPoliticaZeroTrust,
    provisionarTenant,
    redefinirSenhaProvisoriaTenant,
    enviarLinkSenhaTenant,
    atualizarDadosTenant,
    alternarStatusTenant,
    ativarBreakGlass,
    encerrarBreakGlass,
    logout,
  };
});
