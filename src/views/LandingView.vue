<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import {
  Pill,
  PackageOpen,
  ClipboardList,
  Send,
  FileText,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  LogIn,
  Zap,
  Building2,
  Tag,
  Lock,
  Clock,
  Package,
} from 'lucide-vue-next';

const router = useRouter();
const authStore = useAuthStore();

const estaLogado = computed(() => authStore.isAuthenticated);

function acessarPlataforma() {
  if (estaLogado.value) {
    router.push(authStore.isSuperAdmin ? { name: 'plataforma' } : { name: 'dashboard' });
  } else {
    router.push('/login');
  }
}

function rolarParaSecao(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
  }
}
</script>

<template>
  <div class="landing-root">
    <!-- TOPBAR / NAVBAR (WCAG 2.2 compliant, clean 72px) -->
    <header class="landing-header" role="banner">
      <div class="landing-shell header-inner">
        <!-- Brand Identity -->
        <a
          href="#topo"
          class="brand-link"
          aria-label="EncoMed - Início"
          @click.prevent="rolarParaSecao('topo')"
          style="display: flex; align-items: center; gap: 0.75rem;"
        >
          <img
            src="/encomed-logo.png"
            alt="EncoMed"
            style="height: 42px; width: auto; object-fit: contain; border-radius: 8px; flex-shrink: 0;"
          />
          <div class="brand-text-col">
            <span class="brand-title-main">EncoMed</span>
            <span class="brand-subtitle-meta">SaaS de Encomendas &amp; Estoque</span>
          </div>
        </a>

        <!-- Main Navigation Links -->
        <nav class="header-nav" role="navigation" aria-label="Navegação da apresentação">
          <button @click="rolarParaSecao('balcao-encomendas')" class="nav-text-btn">
            Balcão & Encomendas
          </button>
          <button @click="rolarParaSecao('reposicao-nfe')" class="nav-text-btn">
            Reposição & NF-e
          </button>
          <button @click="rolarParaSecao('arquitetura-seguranca')" class="nav-text-btn">
            Arquitetura & LGPD
          </button>
          <button @click="rolarParaSecao('fluxo-operacao')" class="nav-text-btn">
            Fluxo Operacional
          </button>
        </nav>

        <!-- CTA Action Button -->
        <div class="header-action">
          <button
            @click="acessarPlataforma"
            class="btn-primary-pill touch-target"
            id="btn-nav-acessar"
            :aria-label="estaLogado ? 'Entrar no Painel Administrativo' : 'Acessar o Sistema com Credenciais'"
          >
            <LogIn :size="16" aria-hidden="true" />
            <span>{{ estaLogado ? 'Entrar no Painel' : 'Acessar Sistema' }}</span>
          </button>
        </div>
      </div>
    </header>

    <main id="topo" class="landing-main">
      <!-- 1. HERO SECTION (Minimalista, Asymmetrical Split, No AI Slop) -->
      <section class="hero-section" aria-labelledby="hero-title">
        <div class="landing-shell">
          <!-- Intro Pill & Headline -->
          <div class="hero-lead-block">
            <div class="category-header-pill" style="margin-bottom: 1.25rem;">
              <ShieldCheck :size="14" aria-hidden="true" />
              <span>SISTEMA ESPECIALIZADO DE VAREJO FARMACÊUTICO</span>
            </div>

            <h1 id="hero-title" class="hero-headline">
              Gestão de encomendas e reposição de estoque com conciliação de NF-e
            </h1>

            <p class="hero-paragraph">
              Plataforma desenvolvida para a rotina clínica e comercial de farmácias e drogarias. Elimine o registro manual em cadernos de balcão, automatize avisos de chegada no WhatsApp do paciente e concilie compras diretamente pelo arquivo XML da Nota Fiscal Eletrônica.
            </p>
          </div>

          <!-- DUAL-PILLAR ASYMMETRIC BENTO GRID -->
          <div class="hero-bento-grid">
            <!-- Coluna 1: Encomendas de Balcão -->
            <article
              id="balcao-encomendas"
              class="bento-card bento-primary"
              aria-labelledby="card-encomendas-title"
            >
              <div class="card-header-row">
                <span class="category-header-pill">
                  <PackageOpen :size="13" aria-hidden="true" />
                  <span>MÓDULO DE BALCÃO</span>
                </span>
                <span class="card-status-badge">Operação Diária</span>
              </div>

              <h2 id="card-encomendas-title" class="card-h2">
                Controle e rastreio de encomendas do paciente
              </h2>

              <p class="card-desc">
                Registro imediato de pedidos de remédios em falta com vinculação de contato. Ao receber o medicamento na loja, dispare o aviso de retirada pelo WhatsApp oficial com 1 clique.
              </p>

              <!-- Miniatura Operacional Fiel (.pedido-item-card) -->
              <div class="preview-shell" role="region" aria-label="Exemplo de card de encomenda">
                <div class="pedido-item-card mini-item-card">
                  <div class="item-info-col">
                    <div class="item-meta-top">
                      <span class="patient-name">Maria Aparecida da Silva</span>
                      <span class="patient-contact">(11) 98765-4321</span>
                    </div>
                    <span class="pedido-item-name text-red-urgent">
                      OZEMPIC 1MG CANETA INJETAVEL
                    </span>
                    <div class="urgent-subtitle">
                      <Zap :size="12" aria-hidden="true" />
                      <span>Urgente • Termolábil (2°C - 8°C)</span>
                    </div>
                  </div>

                  <!-- Status Semântico Oficial -->
                  <div class="status-pills-cluster" role="group" aria-label="Status do pedido">
                    <span class="pedido-status-pill">
                      <Clock :size="12" aria-hidden="true" />
                      <span>Aguardo</span>
                    </span>
                    <span class="pedido-status-pill">
                      <CheckCircle2 :size="12" aria-hidden="true" />
                      <span>Feito</span>
                    </span>
                    <span class="pedido-status-pill active-chegou" aria-current="true">
                      <Package :size="12" aria-hidden="true" />
                      <span>Chegou</span>
                    </span>
                  </div>
                </div>

                <div class="whatsapp-action-row">
                  <button
                    type="button"
                    class="btn-outline-emerald touch-target"
                    title="Simulação de notificação pronta"
                    aria-label="Aviso pronto para WhatsApp da paciente"
                  >
                    <Send :size="14" aria-hidden="true" />
                    <span>Disparo WhatsApp: "Seu medicamento chegou!"</span>
                  </button>
                </div>
              </div>

              <!-- Checklist Técnico Objetivo -->
              <ul class="clean-checklist" role="list">
                <li>
                  <CheckCircle2 :size="16" class="check-icon" aria-hidden="true" />
                  <span>Sincronização em 4 estados: <strong>Aguardando</strong>, <strong>Pedido Feito</strong>, <strong>Chegou</strong> e <strong>Entregue</strong></span>
                </li>
                <li>
                  <CheckCircle2 :size="16" class="check-icon" aria-hidden="true" />
                  <span>Histórico completo de dispensação vinculado ao paciente</span>
                </li>
              </ul>

              <div class="card-footer-cta">
                <button
                  @click="acessarPlataforma"
                  class="btn-primary-pill touch-target w-full-btn"
                  id="btn-cta-encomendas"
                >
                  <span>Acessar Módulo de Encomendas</span>
                  <ArrowRight :size="16" aria-hidden="true" />
                </button>
              </div>
            </article>

            <!-- Coluna 2: Reposição de Estoque & XML NF-e -->
            <article
              id="reposicao-nfe"
              class="bento-card bento-secondary"
              aria-labelledby="card-compras-title"
            >
              <div class="card-header-row">
                <span class="category-header-pill" style="background-color: #f1f5f9; color: #334155; border-color: #cbd5e1;">
                  <ClipboardList :size="13" aria-hidden="true" />
                  <span>MÓDULO DE REPOSIÇÃO</span>
                </span>
                <span class="card-status-badge">Entrada & Conciliação</span>
              </div>

              <h2 id="card-compras-title" class="card-h2">
                Compras organizadas e baixa via XML da distribuidora
              </h2>

              <p class="card-desc">
                Agrupamento automático de faltas por categorias regulatórias e comerciais. Ao receber o XML da nota fiscal, o sistema faz o cruzamento instantâneo de itens e marca os pedidos correspondentes como Chegou.
              </p>

              <!-- Miniatura Operacional Fiel (.pedido-item-card) -->
              <div class="preview-shell" role="region" aria-label="Exemplo de card de reposição">
                <div class="pedido-item-card mini-item-card">
                  <div class="item-info-col">
                    <div class="item-meta-top">
                      <span class="category-header-pill" style="font-size: 0.68rem; padding: 0.15rem 0.5rem;">
                        <Tag :size="10" aria-hidden="true" />
                        <span>FÓRMULA / ÉTICO</span>
                      </span>
                      <span class="patient-contact">Distribuidora Vinculada</span>
                    </div>
                    <span class="pedido-item-name">
                      LOSARTANA POTÁSSICA 50MG 30 COMP
                    </span>
                    <div class="xml-sync-notice">
                      <FileText :size="11" aria-hidden="true" />
                      <span>DANFE / XML Correlacionado com Sucesso</span>
                    </div>
                  </div>

                  <!-- Status Semântico Oficial -->
                  <div class="status-pills-cluster" role="group" aria-label="Status da compra">
                    <span class="pedido-status-pill">
                      <Clock :size="12" aria-hidden="true" />
                      <span>Aguardo</span>
                    </span>
                    <span class="pedido-status-pill active-feito" aria-current="true">
                      <CheckCircle2 :size="12" aria-hidden="true" />
                      <span>Feito</span>
                    </span>
                    <span class="pedido-status-pill">
                      <Package :size="12" aria-hidden="true" />
                      <span>Chegou</span>
                    </span>
                  </div>
                </div>

                <div class="whatsapp-action-row">
                  <button
                    type="button"
                    class="btn-outline-neutral touch-target"
                    title="Leitor de XML no navegador"
                    aria-label="Processador de XML da Nota Fiscal no navegador"
                  >
                    <FileText :size="14" aria-hidden="true" />
                    <span>Leitor Nativo de XML (Sem envio para servidores terceiros)</span>
                  </button>
                </div>
              </div>

              <!-- Checklist Técnico Objetivo -->
              <ul class="clean-checklist" role="list">
                <li>
                  <CheckCircle2 :size="16" class="check-icon" aria-hidden="true" />
                  <span>Classificações estruturadas: <strong>Fórmulas</strong>, <strong>Genéricos</strong>, <strong>Éticos</strong> e <strong>Perfumaria</strong></span>
                </li>
                <li>
                  <CheckCircle2 :size="16" class="check-icon" aria-hidden="true" />
                  <span>Exportação instantânea para planilha Excel (.csv) e arquivo de auditoria</span>
                </li>
              </ul>

              <div class="card-footer-cta">
                <button
                  @click="acessarPlataforma"
                  class="btn-outline-neutral touch-target w-full-btn"
                  id="btn-cta-compras"
                >
                  <span>Acessar Painel de Pedidos</span>
                  <ArrowRight :size="16" aria-hidden="true" />
                </button>
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- 2. ARQUITETURA TÉCNICA, SEGURANÇA & LGPD (4 Colunas Minimalistas) -->
      <section id="arquitetura-seguranca" class="tech-section" aria-labelledby="tech-title">
        <div class="landing-shell">
          <div class="section-heading-center">
            <span class="section-tag-kicker">INFRAESTRUTURA & PRIVACIDADE</span>
            <h2 id="tech-title" class="section-title-clean">
              Engenharia de dados voltada à segurança farmacêutica
            </h2>
            <p class="section-desc-clean">
              Desenvolvido com padrões rigorosos de engenharia de software para suportar farmácias individuais e redes multi-loja.
            </p>
          </div>

          <div class="pillars-four-grid">
            <!-- Pilar 1 -->
            <div class="pillar-box">
              <div class="pillar-icon-box bg-emerald-tint">
                <Send :size="22" class="text-emerald" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Mensageria WhatsApp Oficial</h3>
              <p class="pillar-box-p">
                Integração por link com deep-linking oficial da API do WhatsApp. Permite notificar o paciente pelo número cadastrado sem robôs que possam sofrer banimento de conta.
              </p>
            </div>

            <!-- Pilar 2 -->
            <div class="pillar-box">
              <div class="pillar-icon-box bg-blue-tint">
                <FileText :size="22" class="text-blue" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Processamento Local de NF-e</h3>
              <p class="pillar-box-p">
                O arquivo .xml emitido pela distribuidora é processado diretamente pelo navegador via DOMParser, comparando os itens e atualizando o status das encomendas sem latência.
              </p>
            </div>

            <!-- Pilar 3 -->
            <div class="pillar-box">
              <div class="pillar-icon-box bg-purple-tint">
                <Building2 :size="22" class="text-purple" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Isolamento Multi-tenant (RLS)</h3>
              <p class="pillar-box-p">
                Cada empresa ou filial possui seus dados rigorosamente isolados no PostgreSQL através de políticas ativas de Row Level Security (RLS), impedindo cruzamento de dados.
              </p>
            </div>

            <!-- Pilar 4 -->
            <div class="pillar-box">
              <div class="pillar-icon-box bg-slate-tint">
                <ShieldCheck :size="22" class="text-slate" aria-hidden="true" />
              </div>
              <h3 class="pillar-box-h3">Conformidade com a LGPD</h3>
              <p class="pillar-box-p">
                Princípio de minimização de dados de saúde (Art. 11), permissões restritas por perfil (Farmacêutico RT, Comprador, Operador) e trilha de auditoria completa.
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 3. FLUXO OPERACIONAL (Etapas 01 a 04) -->
      <section id="fluxo-operacao" class="workflow-section" aria-labelledby="workflow-title">
        <div class="landing-shell">
          <div class="section-heading-center">
            <span class="section-tag-kicker">ROTEIRO OPERACIONAL</span>
            <h2 id="workflow-title" class="section-title-clean">
              Ciclo operacional de atendimento e reposição
            </h2>
            <p class="section-desc-clean">
              Como a solução organiza a rotina desde a solicitação no balcão até a entrega final.
            </p>
          </div>

          <div class="timeline-four-cols">
            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">01</span>
              <h4 class="step-heading">Atendimento no Balcão</h4>
              <p class="step-text">
                O cliente solicita um medicamento em falta ou sob demanda especial. O atendente registra o item, telefone WhatsApp e nível de urgência.
              </p>
            </div>

            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">02</span>
              <h4 class="step-heading">Consolidação de Compras</h4>
              <p class="step-text">
                O módulo de reposição agrupa todos os pedidos pendentes por categoria (Fórmulas, Genéricos, Perfumaria), gerando a lista consolidada para pedidos.
              </p>
            </div>

            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">03</span>
              <h4 class="step-heading">Conferência via XML</h4>
              <p class="step-text">
                Ao receber a entrega da distribuidora com a NF-e, o XML é importado no sistema, alterando o status dos medicamentos conferidos para "Chegou".
              </p>
            </div>

            <div class="step-card-item">
              <span class="step-badge-number" aria-hidden="true">04</span>
              <h4 class="step-heading">Notificação & Entrega</h4>
              <p class="step-text">
                O paciente é avisado no WhatsApp em 1 clique com mensagem pré-formatada. Ao comparecer à farmácia, o operador dá baixa como "Entregue".
              </p>
            </div>
          </div>
        </div>
      </section>

      <!-- 4. BANNER INSTITUCIONAL DE ACESSO -->
      <section class="banner-access-section" aria-label="Acesso ao sistema">
        <div class="landing-shell">
          <div class="access-banner-card">
            <div class="access-text-group">
              <h2 class="access-h2">
                Acesse o ambiente operacional da sua unidade
              </h2>
              <p class="access-sub">
                Insira suas credenciais corporativas com perfil de Farmacêutico RT, Comprador ou Operador de Balcão.
              </p>
            </div>
            <div class="access-btn-group">
              <button
                @click="acessarPlataforma"
                class="btn-primary-pill touch-target btn-access-large"
                id="btn-banner-acessar"
              >
                <LogIn :size="18" aria-hidden="true" />
                <span>{{ estaLogado ? 'Ir para o Painel' : 'Acessar o Sistema' }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- FOOTER INSTITUCIONAL (WCAG 2.2 compliant) -->
    <footer class="landing-footer" role="contentinfo">
      <div class="landing-shell footer-layout">
        <div class="footer-brand-col">
          <div class="brand-badge-pill" style="width: 32px; height: 32px; border-radius: 8px;" aria-hidden="true">
            <Pill :size="16" class="text-white" />
          </div>
          <div>
            <span class="footer-company-name">Drogaria Aeroporto</span>
            <span class="footer-tagline">
              Sistema de Gestão de Estoque e Encomendas de Medicamentos
            </span>
          </div>
        </div>

        <div class="footer-security-col">
          <span class="security-indicator">
            <Lock :size="13" aria-hidden="true" />
            <span>Autenticação Criptografada • Isolamento RLS no PostgreSQL</span>
          </span>
          <button
            @click="acessarPlataforma"
            class="footer-operator-link touch-target"
            aria-label="Acessar painel do operador"
          >
            Acesso do Operador / Farmacêutico
          </button>
        </div>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ====================================================================
   LANDING PAGE SYSTEM - DROGARIA AEROPORTO
   Design System Oficial: Minimalista, Suíço, Cores Cobalt Blue (#2563eb)
   WCAG 2.2 AA Contrast & Touch Target Standards (min 44px)
   ==================================================================== */

.landing-root {
  min-height: 100vh;
  background-color: var(--bg-body, #f8fafc);
  color: var(--text-main, #0f172a);
  font-family: var(--font-sans, 'Inter', -apple-system, sans-serif);
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  hyphens: manual;
  -webkit-hyphens: manual;
  word-break: normal;
  overflow-wrap: break-word;
}

.landing-root * {
  hyphens: manual;
  -webkit-hyphens: manual;
}

.landing-shell {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

/* Touch targets WCAG 2.2 (mínimo 44px de altura) */
.touch-target {
  min-height: 44px;
}

/* TOPBAR */
.landing-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: 72px;
  background-color: rgba(255, 255, 255, 0.98);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  display: flex;
  align-items: center;
}

.header-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  text-decoration: none;
  border-radius: 8px;
  padding: 0.25rem;
}

.brand-link:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: 2px;
}

.brand-badge-pill {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background-color: var(--color-primary, #2563eb);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  box-shadow: 0 3px 8px rgba(37, 99, 235, 0.25);
}

.brand-text-col {
  display: flex;
  flex-direction: column;
}

.brand-title-main {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.1rem;
  font-weight: 700;
  color: #0f172a;
  letter-spacing: -0.015em;
  line-height: 1.2;
}

.brand-subtitle-meta {
  font-size: 0.74rem;
  color: var(--text-muted, #64748b);
  font-weight: 500;
}

.header-nav {
  display: flex;
  align-items: center;
  gap: 1.75rem;
}

@media (max-width: 920px) {
  .header-nav {
    display: none;
  }
}

.nav-text-btn {
  background: transparent;
  border: none;
  font-size: 0.88rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
  padding: 0.5rem 0.25rem;
  transition: color var(--transition-fast, 150ms ease);
}

.nav-text-btn:hover {
  color: var(--color-primary, #2563eb);
}

.nav-text-btn:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: 4px;
  border-radius: 4px;
}

/* HERO SECTION */
.hero-section {
  padding: 3.5rem 0 3rem;
}

.hero-lead-block {
  text-align: center;
  max-width: 860px;
  margin: 0 auto 3rem;
}

.hero-headline {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: clamp(1.9rem, 4vw, 2.75rem);
  font-weight: 800;
  color: #0f172a;
  line-height: 1.18;
  letter-spacing: -0.025em;
  margin-bottom: 1rem;
}

.hero-paragraph {
  font-size: clamp(0.98rem, 1.8vw, 1.1rem);
  color: #475569;
  line-height: 1.6;
  max-width: 780px;
  margin: 0 auto;
}

/* BENTO DUAL GRID */
.hero-bento-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1.75rem;
}

@media (max-width: 860px) {
  .hero-bento-grid {
    grid-template-columns: 1fr;
  }
}

.bento-card {
  background-color: #ffffff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 20px;
  padding: 2.25rem;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
  transition: border-color var(--transition-smooth, 250ms ease), box-shadow var(--transition-smooth, 250ms ease);
  min-width: 0;
}

.bento-card:hover {
  border-color: #cbd5e1;
  box-shadow: 0 8px 24px -4px rgba(15, 23, 42, 0.06);
}

.card-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 1rem;
}

.card-status-badge {
  font-size: 0.74rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.card-h2 {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.4rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.3;
  margin-bottom: 0.5rem;
  letter-spacing: -0.015em;
}

.card-desc {
  font-size: 0.92rem;
  color: #475569;
  line-height: 1.55;
  margin-bottom: 1.25rem;
}

/* PREVIEW SHELL */
.preview-shell {
  background-color: #f8fafc;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  padding: 1.15rem;
  margin-bottom: 1.5rem;
}

.mini-item-card {
  background-color: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem 1.15rem;
  margin: 0;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02);
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  align-items: stretch;
}

.item-info-col {
  min-width: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.item-meta-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
  flex-wrap: wrap;
}

.patient-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: #1e293b;
  text-transform: uppercase;
  letter-spacing: 0.01em;
}

.patient-contact {
  font-size: 0.76rem;
  color: #64748b;
  font-weight: 500;
}

.mini-item-card .pedido-item-name {
  font-size: 0.96rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.35;
  letter-spacing: -0.01em;
  word-break: normal;
  overflow-wrap: break-word;
}

.status-pills-cluster {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  width: 100%;
  padding-top: 0.65rem;
  border-top: 1px dashed #e2e8f0;
}

.status-pills-cluster .pedido-status-pill {
  flex: 1;
  justify-content: center;
  padding: 0.35rem 0.5rem;
  font-size: 0.74rem;
}

.whatsapp-action-row {
  margin-top: 0.75rem;
  display: flex;
}

.whatsapp-action-row .btn-outline-emerald,
.whatsapp-action-row .btn-outline-neutral {
  width: 100%;
  justify-content: center;
  font-size: 0.8rem;
  cursor: default;
}

.xml-sync-notice {
  font-size: 0.75rem;
  font-weight: 600;
  color: #0284c7;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-top: 2px;
}

/* CHECKLIST */
.clean-checklist {
  list-style: none;
  padding: 0;
  margin: 0 0 1.75rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.clean-checklist li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.86rem;
  color: #334155;
  line-height: 1.45;
}

.check-icon {
  color: var(--color-primary, #2563eb);
  flex-shrink: 0;
  margin-top: 1px;
}

.card-footer-cta {
  margin-top: auto;
}

.w-full-btn {
  width: 100%;
  justify-content: center;
}

/* SECTION 2: ARQUITETURA TÉCNICA */
.tech-section {
  padding: 4.5rem 0;
  background-color: #ffffff;
  border-top: 1px solid var(--border-color, #e2e8f0);
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.section-heading-center {
  text-align: center;
  max-width: 760px;
  margin: 0 auto 3rem;
}

.section-tag-kicker {
  display: block;
  font-size: 0.76rem;
  font-weight: 700;
  color: var(--color-primary, #2563eb);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}

.section-title-clean {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: clamp(1.6rem, 3vw, 2.1rem);
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
  margin-bottom: 0.5rem;
}

.section-desc-clean {
  font-size: 0.98rem;
  color: #475569;
  line-height: 1.55;
}

.pillars-four-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}

@media (max-width: 960px) {
  .pillars-four-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 580px) {
  .pillars-four-grid {
    grid-template-columns: 1fr;
  }
}

.pillar-box {
  background-color: #f8fafc;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  padding: 1.75rem 1.5rem;
  display: flex;
  flex-direction: column;
  transition: border-color var(--transition-fast, 150ms ease);
}

.pillar-box:hover {
  border-color: #cbd5e1;
}

.pillar-icon-box {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.25rem;
}

.bg-emerald-tint { background-color: #ecfdf5; }
.text-emerald { color: #047857; }

.bg-blue-tint { background-color: #eff6ff; }
.text-blue { color: #2563eb; }

.bg-purple-tint { background-color: #f3e8ff; }
.text-purple { color: #7e22ce; }

.bg-slate-tint { background-color: #f1f5f9; }
.text-slate { color: #334155; }

.pillar-box-h3 {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.4rem;
}

.pillar-box-p {
  font-size: 0.86rem;
  color: #475569;
  line-height: 1.5;
}

/* SECTION 3: WORKFLOW */
.workflow-section {
  padding: 4.5rem 0;
}

.timeline-four-cols {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
}

@media (max-width: 900px) {
  .timeline-four-cols {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 540px) {
  .timeline-four-cols {
    grid-template-columns: 1fr;
  }
}

.step-card-item {
  background-color: #ffffff;
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 16px;
  padding: 1.75rem 1.4rem;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.02);
}

.step-badge-number {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background-color: #eff6ff;
  color: #2563eb;
  font-weight: 800;
  font-size: 0.9rem;
  margin-bottom: 0.85rem;
}

.step-heading {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1rem;
  font-weight: 700;
  color: #0f172a;
  margin-bottom: 0.4rem;
}

.step-text {
  font-size: 0.84rem;
  color: #475569;
  line-height: 1.5;
}

/* BANNER DE ACESSO */
.banner-access-section {
  padding: 1rem 0 4rem;
}

.access-banner-card {
  background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
  border-radius: 20px;
  padding: 2.75rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  box-shadow: 0 16px 32px -8px rgba(15, 23, 42, 0.18);
}

@media (max-width: 768px) {
  .access-banner-card {
    flex-direction: column;
    text-align: center;
    padding: 2rem;
  }
}

.access-h2 {
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-size: 1.6rem;
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 0.35rem;
  letter-spacing: -0.015em;
}

.access-sub {
  font-size: 0.92rem;
  color: #94a3b8;
}

.btn-access-large {
  padding: 0.75rem 2rem;
  font-size: 0.95rem;
}

/* FOOTER */
.landing-footer {
  border-top: 1px solid var(--border-color, #e2e8f0);
  background-color: #ffffff;
  padding: 1.75rem 0;
}

.footer-layout {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 1rem;
}

.footer-brand-col {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.footer-company-name {
  display: block;
  font-family: var(--font-heading, 'Plus Jakarta Sans', sans-serif);
  font-weight: 700;
  font-size: 0.92rem;
  color: #0f172a;
}

.footer-tagline {
  font-size: 0.75rem;
  color: #64748b;
}

.footer-security-col {
  display: flex;
  align-items: center;
  gap: 1.5rem;
}

.security-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  color: #64748b;
}

.footer-operator-link {
  background: none;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary, #2563eb);
  cursor: pointer;
  text-decoration: underline;
  padding: 0.25rem;
}

.footer-operator-link:focus-visible {
  outline: 2px solid var(--color-primary, #2563eb);
  outline-offset: 2px;
}
</style>
