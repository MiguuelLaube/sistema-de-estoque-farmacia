export interface DadosEmailCriarSenha {
  nomeAdmin: string;
  emailAdmin: string;
  nomeEmpresa: string;
  slugEmpresa: string;
  planoEmpresa?: string;
  linkCriarSenha: string;
}

/**
 * Retorna o template HTML corporativo responsivo para primeiro acesso e criação de senha.
 * Compatível com clientes de e-mail modernos (Gmail, Outlook, Apple Mail, Webmail).
 */
export function gerarHtmlEmailCriarSenha(dados: DadosEmailCriarSenha): string {
  const planoFmt = (dados.planoEmpresa || 'Profissional').toUpperCase();
  const subdominio = `${dados.slugEmpresa}.plataforma.com.br`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Defina sua Senha de Acesso - EncoMed</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #f1f5f9;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      background-color: #f1f5f9;
      padding: 32px 16px;
    }
    .container {
      max-width: 580px;
      margin: 0 auto;
      background-color: #ffffff;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid #e2e8f0;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.05);
    }
    .header-bar {
      height: 6px;
      background: linear-gradient(90deg, #2563eb 0%, #38bdf8 100%);
    }
    .content {
      padding: 36px 32px 28px 32px;
    }
    .brand-badge {
      display: inline-block;
      padding: 4px 12px;
      background-color: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 700;
      color: #1d4ed8;
      letter-spacing: 0.5px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0 0 12px 0;
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      line-height: 1.3;
    }
    p {
      margin: 0 0 16px 0;
      font-size: 15px;
      line-height: 1.6;
      color: #475569;
    }
    .info-card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px 20px;
      margin: 22px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 14px;
      border-bottom: 1px dashed #e2e8f0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #64748b;
      font-weight: 500;
    }
    .info-val {
      color: #0f172a;
      font-weight: 700;
      font-family: monospace;
    }
    .btn-container {
      text-align: center;
      margin: 32px 0;
    }
    .btn-cta {
      display: inline-block;
      background-color: #2563eb;
      color: #ffffff !important;
      text-decoration: none;
      padding: 14px 34px;
      border-radius: 9999px;
      font-size: 15px;
      font-weight: 700;
      box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35);
    }
    .notice-box {
      background-color: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 10px;
      padding: 12px 16px;
      margin-top: 24px;
      font-size: 13px;
      color: #92400e;
      line-height: 1.5;
    }
    .footer {
      background-color: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 20px 32px;
      text-align: center;
      font-size: 12px;
      color: #94a3b8;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="container">
      <div class="header-bar"></div>
      <div class="content">
        <span class="brand-badge">ENCOMED SAAS • GESTÃO FARMACÊUTICA</span>
        <h1>Seja bem-vindo(a), ${dados.nomeAdmin}!</h1>
        <p>
          A unidade <strong>${dados.nomeEmpresa}</strong> foi provisionada com sucesso na plataforma EncoMed. Para começar a gerenciar encomendas de balcão e conferência de medicamentos, clique no botão abaixo para definir sua senha de acesso inicial.
        </p>

        <div class="info-card">
          <div class="info-row">
            <span class="info-label">Empresa / Farmácia:</span>
            <span class="info-val">${dados.nomeEmpresa}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Seu Acesso:</span>
            <span class="info-val">${subdominio}</span>
          </div>
          <div class="info-row">
            <span class="info-label">E-mail de Login:</span>
            <span class="info-val">${dados.emailAdmin}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Plano Ativo:</span>
            <span class="info-val">${planoFmt}</span>
          </div>
        </div>

        <div class="btn-container">
          <a href="${dados.linkCriarSenha}" class="btn-cta" target="_blank" rel="noopener noreferrer">
            Criar Minha Senha de Acesso
          </a>
        </div>

        <p style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
          Se o botão não funcionar, copie e cole o link abaixo diretamente em seu navegador:
        </p>
        <p style="font-size: 12px; word-break: break-all; color: #2563eb; background: #eff6ff; padding: 8px 12px; border-radius: 8px; margin: 0;">
          ${dados.linkCriarSenha}
        </p>

        <div class="notice-box">
          ⏱️ <strong>Atenção de Segurança:</strong> Este link é de uso único e expira em 24 horas. Caso não tenha solicitado este cadastro, entre em contato imediatamente com o administrador da rede.
        </div>
      </div>

      <div class="footer">
        EncoMed SaaS • Sistema de Encomendas & Conciliação Farmacêutica<br>
        Ambiente protegido sob os preceitos da Lei Geral de Proteção de Dados (LGPD - Lei nº 13.709/2018).
      </div>
    </div>
  </div>
</body>
</html>`;
}
