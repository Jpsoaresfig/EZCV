# Avaliação de riscos de proteção de dados (insumo técnico para a EIPD)

> BORRADOR. Escala: Probabilidade (P) e Impacto (I) 1-3; risco = P×I. Residual = após as medidas implementadas. «Owner» = quem tem de agir. Estados: **Mitigado** (medida técnica implementada e testada), **Parcial**, **Aberto**.

| # | Risco | P | I | Medidas implementadas | Residual | Owner | Estado |
|---|---|---|---|---|---|---|---|
| 1 | **Confidencialidade** — fuga de CV | 2 | 3 | Bucket privado sem URLs; download só via backend com sessão + tenant + prefixo; CHECK na BD; `no-store`; auditoria | Baixo-médio (acesso direto ao Supabase) | Técnico | Mitigado |
| 2 | **Acesso cross-tenant / IDOR** | 2 | 3 | Tenant da sessão em todas as queries; RPCs com `restaurant_id`; FKs compostas impedem ligações entre tenants; 404 idêntico a inexistente; testes A↔B (BD, API, Storage, pesquisa, filtros, exportação) | Baixo | Técnico | Mitigado |
| 3 | **Integridade** — alteração indevida de estados/notas | 1 | 2 | CSRF, autorização, histórico, auditoria | Baixo | Técnico | Mitigado |
| 4 | **Disponibilidade** / DoS no formulário público | 2 | 2 | Rate limits (memória + BD), honeypot, limites de multipart e tamanho | Médio (sem WAF/CAPTCHA; Vercel absorve parte) | Técnico | Parcial |
| 5 | **Apagamento acidental** | 1 | 2 | Confirmações, `legal_hold`, retenção em simulação por omissão, auto-retenção desligada até `RETENTION_AUTO=1` | Baixo | Negócio/Técnico | Mitigado |
| 6 | **Acesso não autorizado** (credenciais) | 2 | 3 | scrypt + salt, mínimo 10 caracteres, rate limit por IP e por conta, sessões opacas (hash), `__Host-` + Secure em produção, logout, termina sessões ao mudar/repor senha | Médio (**sem 2FA** para negócios) | Técnico | Parcial |
| 7 | **Uploads maliciosos** | 2 | 2 | Lista branca PDF, magic bytes, heurística de conteúdo ativo, %%EOF, 5 MB, 1 ficheiro, nome aleatório, servidor nunca abre o PDF, `nosniff` | Médio (sem antivírus; PDF ofuscado/comprimido pode passar; o risco é para o leitor de PDF do negócio) | Técnico | Parcial |
| 8 | **Roubo de credenciais de infraestrutura** | 1 | 3 | Service key só no servidor; nada no git (verificado); autodiagnóstico | Médio (depende de 2FA e práticas — [operational-security](operational-security.md)) | Titular | Parcial |
| 9 | **Insider** (admin/operador) | 1 | 3 | Admin sem rotas de candidatos (testado); logs | Médio — acesso via Supabase não auditado | Titular | Parcial |
| 10 | **Fuga por email** | 2 | 2 | Email sem dados do candidato nem CV; nada no log do servidor | Baixo | Técnico | Mitigado |
| 11 | **Fuga em backups** | 1 | 3 | — (do fornecedor) | Médio — retenção/cifra a confirmar | Titular | Aberto |
| 12 | **Comprometimento de fornecedor** | 1 | 3 | Minimização; sem fornecedores supérfluos | Médio | Titular | Parcial |
| 13 | **Transferências internacionais** | 2 | 2 | — | Médio/Alto até confirmar regiões UE e DPA/DPF/SCC | Titular/Jurídico | **Aberto** |
| 14 | **Perfilado / decisões automatizadas** | 1 | 3 | Nenhuma funcionalidade; IA bloqueada por regra | Baixo | Titular | Mitigado |
| 15 | **Discriminação** | 2 | 3 | Sem campos/filtros protegidos; detetor nas notas; avisos; onboarding | Médio/Alto (decisão humana do negócio) | Negócio | Parcial |
| 16 | **Retenção excessiva** | 2 | 2 | Prazos por tenant, supressão automática, órfãos, logs 365 d, sessões anónimas 2 h | Médio até validar prazos e ligar o agendador | Jurídico/Titular | Parcial |
| 17 | **Enumeração** (contas, candidaturas) | 2 | 2 | Duplicados neutros, login/recuperação/direitos neutros, 404 iguais | Baixo-médio (registo revela email de negócio) | Técnico | Parcial |
| 18 | **Rate limit contornável** com muitos IPs | 2 | 1 | Limite por conta (login) | Médio | Técnico | Parcial |
| 19 | **Dados sensíveis no CV** | 3 | 2 | Aviso; nada processa o CV | Médio | Negócio/Jurídico | Parcial |
| 20 | **Content spoofing** via `?err=` | 1 | 1 | Escape HTML | Baixo | Técnico | Aberto (baixo) |
