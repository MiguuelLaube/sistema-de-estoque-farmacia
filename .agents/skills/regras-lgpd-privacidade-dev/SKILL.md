---
name: regras-lgpd-privacidade-dev
description: "Audita e orienta a implementação de conformidade com a LGPD (Lei nº 13.709/2018) e Privacy by Design em aplicações de software. Avalia minimização de dados, proteção de dados sensíveis de saúde, mascaramento e hash de CPF, bases legais (Art. 7º e 11), atendimento aos direitos dos titulares (Art. 18 - confirmação, acesso, correção, anonimização e exclusão), logs de auditoria e isolamento multi-tenant."
---

# Regras de LGPD & Privacidade para Desenvolvedores (regras-lgpd-privacidade-dev)

Esta skill define o protocolo de auditoria e diretrizes técnicas para garantir que aplicações (especialmente sistemas que tratam dados sensíveis como farmácias, clínicas e e-commerce) operem em estrita conformidade com a **Lei Geral de Proteção de Dados (Lei nº 13.709/2018)** e as melhores práticas de **Privacy by Design**.

---

## 1. Princípios Fundamentais (Art. 6º)

1. **Finalidade e Adequação:** Tratar dados apenas para os propósitos legítimos e específicos informados ao titular (ex.: emissão de encomenda e aviso de chegada).
2. **Necessidade / Minimização:** Coletar estritamente o mínimo de dados necessários. O CPF não deve ser obrigatório quando o atendimento puder ocorrer por telefone/nome.
3. **Livre Acesso e Transparência:** Garantir aos titulares consulta facilitada sobre a forma e duração do tratamento.
4. **Segurança e Prevenção:** Criptografia em repouso e em trânsito, mascaramento em tela, separação lógica por tenant.
5. **Responsabilização e Prestação de Contas:** Registrar logs de auditoria para visualização, alteração ou exclusão de dados pessoais.

---

## 2. Checklist Técnico de Avaliação (Auditoria de Código)

### A. Coleta e Minimização de Dados
- [ ] O CPF é opcional no cadastro ou justificado por obrigação legal (ex.: SNGPC/receituário controlado)?
- [ ] O sistema permite criar pedidos/encomendas sem exigir dados desnecessários (ex.: endereço completo quando a retirada é em balcão)?
- [ ] O número de telefone é validado e normalizado sem expor dados em rotas públicas?

### B. Proteção e Mascaramento de Identificadores (CPF e Telefone)
- [ ] O CPF nunca é exibido na íntegra em listagens abertas (aplicar máscara tipo `***.456.789-**` ou `123.***.***-45`).
- [ ] Existe controle de acesso ou auditoria quando o operador clica para "revelar" o dado completo?
- [ ] Buscas por CPF utilizam `cpf_hash` ou índice criptográfico para evitar varredura em texto claro?

### C. Dados Pessoais Sensíveis (Saúde e Medicamentos - Art. 11)
- [ ] Medicamentos associados a um paciente revelam condições clínicas (ex.: psicotrópicos, emagrecedores, oncológicos). Esses dados são restritos por RBAC (apenas balconistas/farmacêuticos autorizados)?
- [ ] Mensagens de notificação (ex.: WhatsApp) minimizam a exposição do diagnóstico em pré-visualizações de tela ou notificações de terceiros.
- [ ] O histórico de medicamentos e receitas possui retenção definida e descarte seguro.

### D. Bases Legais e Registro de Consentimento (Art. 7º e 11)
- [ ] O banco de dados armazena a base legal aplicada (`execucao_contrato`, `obrigacao_regulatoria`, `consentimento`, etc.) com timestamp (`consentimento_em`).
- [ ] Quando o consentimento for a base, há interface ou mecanismo para o titular revogar.

### E. Atendimento aos Direitos dos Titulares (Art. 18)
- [ ] **Direito de Acesso / Portabilidade (Art. 18, II e V):** Existe função para exportar os dados do titular em formato interoperável (JSON/CSV)?
- [ ] **Direito de Correção (Art. 18, III):** Mecanismo simples para corrigir dados incompletos ou inexatos.
- [ ] **Direito à Anonimização / Eliminação (Art. 18, IV e VI):** Função que desvincula o nome/CPF do histórico financeiro e fiscal quando solicitado (anonimização por pseudônimo ou hash irrevogável).

### F. Segurança e Logs de Auditoria
- [ ] Nenhum dado pessoal (CPF, nome, telefone) é impresso em logs de depuração (`console.log`) em produção.
- [ ] Há tabela ou registro de auditoria (`auditoria_acesso` ou log de operações) rastreando quem visualizou, editou ou exportou prontuários/pedidos.
- [ ] Separação estrita de dados entre clientes de diferentes farmácias (Row Level Security com `tenant_id`).

---

## 3. Fluxo de Execução da Auditoria

1. **Mapeamento de Pontos de Entrada:**
   Inspecionar schemas de banco (`supabase/migrations`), stores Pinia (`src/stores/*`) e formulários de interface (`src/views/*`).
2. **Verificação de Vulnerabilidades:**
   Comparar a implementação atual contra os 6 eixos do checklist técnico acima.
3. **Classificação dos Achados:**
   - **Crítico:** Vazamento de dados pessoais, falta de isolamento multi-tenant ou logs de debug contendo PII.
   - **Alto:** Ausência de mecanismos do Art. 18 (exportação ou anonimização) ou CPF desprotegido em listagens.
   - **Médio:** Falta de registro de base legal explícita ou mensagens de WhatsApp expondo dados sensíveis em demasia.
   - **Baixo / Melhoria:** Otimizações de UX e avisos de privacidade.
4. **Emissão do Relatório com Código de Correção Sugerido.**
