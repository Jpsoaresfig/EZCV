# EZCV — Candidaturas por NFC para bares y restaurantes

Sistema web completo de reclutamiento para bares, restaurantes y establecimientos de alimentación en España.

**Fluxo principal:** candidato aproxima o celular à etiqueta NFC → abre a página do restaurante → preenche o formulário → envia o CV em PDF → a candidatura entra no painel do restaurante → o dono organiza, contacta e altera o estado.

A etiqueta NFC **não é programada pelo sistema** — o sistema apenas fornece a URL que deve ser gravada nela.

> 📄 Documentação técnica (o que foi feito, rotas, banco de dados, segurança, testes): [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md)

---

## Funcionalidades implementadas

### Restaurante (dono/gerente)
- Cadastro com nome comercial, tipo de estabelecimento (bar/restaurante/terraza…), CP e descrição + isolamento por estabelecimento (slug único).
- Logo e foto do estabelecimento (PNG/JPG/WEBP válidos por magic bytes, `MAX_IMAGE_MB`) exibidos na página NFC.
- Painel simples: Início (métricas), Candidaturas, Vacantes, Mi restaurante, Configuración.
- Dashboard com métricas (total, 7 dias, 30 dias, vagas abertas) e caixa «Necesita atención».
- Pausar/ativar candidaturas **sem tocar na etiqueta NFC**.
- Criar/editar/ativar/desativar/**eliminar** vacantes — com contrato (Indefinido/Temporal…), jornada, requisitos e disponibilidade; candidaturas antigas sobrevivem à eliminação da vaga.
- Ver, filtrar e pesquisar candidaturas (texto livre, estado, vaga, disponibilidade, datas), ordenar (recentes/antigas) e filtrar favoritos.
- **Pipeline visual** de estados (Nuevo → … → Contratado) com contagem por estado.
- Cards completos com telefone, email e botão **WhatsApp** (`wa.me`).
- Perfil do candidato: dados pessoais, profissionais, CV (ver/download), botões `tel:`, `mailto:` e WhatsApp.
- **Favoritos** (★) por candidatura + filtro «Solo favoritos».
- **Histórico da candidatura** (recebida, mudanças de estado, com data/hora).
- Notas internas por candidatura com autor (nunca visíveis para o candidato).
- 8 estados: Nuevo, Revisado, Contactar, Contactado, Entrevista, Contratado, Rechazado, Reserva / Futuras oportunidades.
- **Área de notificações** (`/panel/notificaciones`): histórico de avisos com estado de entrega dos emails, badge de não lidas + «Marcar todo como leído».
- Exclusão de candidatura com apagamento seguro do ficheiro CV.
- URL da etiqueta NFC visível e copiável em «Mi restaurante».
- Notificação por email ao receber candidatura (SMTP opcional; sem SMTP vai para o log).

### Candidato (sem login, mobile-first, em espanhol)
- Página pública `/r/:slug` com estado de contratação (🟢 contratando / 🔴 não contratando), **logo, nome comercial, descrição, tipo de estabelecimento e endereço**.
- Formulário: nombre, apellidos, email, teléfono, tipo de documento (**NIE / DNI / Pasaporte / Otro** — não assume NIE), puesto, disponibilidad, experiencia, observaciones, CV em PDF.
- **Documento de identidade opcional** (minimização de dados, §29): não é exigido para enviar a candidatura — o restaurante pede-o só se houver avanço no processo.
- Upload de CV: só PDF (extensão + MIME + magic bytes `%PDF-`), limite de tamanho, nome do ficheiro mostrado após seleção.
- Consentimentos RGPD separados com **versão e texto exato registados** (`v2-2026-10`): processo de seleção (obrigatório) e conservação para futuras oportunidades (opcional).
- Página **`/privacidad`** com finalidades, prazos, direitos do titular e nota de que não há decisões automatizadas.
- Quando pausado / sem vagas: mensagem + formulário para **guardar dados para futuras oportunidades** (entra como «Reserva»).
- Página de confirmação após envio (POST-redirect-GET).

### Administração da plataforma
- Métricas: estabelecimentos, candidaturas (total/7 dias), usuários, vagas, emails falhados.
- Ativar/desativar estabelecimentos.
- Listar e bloquear/desbloquear utilizadores (bloqueio derruba as sessões ativas, no mesmo commit).
- **Logs de segurança** em `/admin/logs` (evento, IP, data — filtro por evento).
- **Sem acesso a dados de candidatos** (§22): não existe rota de admin que leia candidaturas, candidatos ou o bucket dos CVs. O acesso à lista de utilizadores — que contém nomes e emails — fica registado nos logs.

### Segurança
- Sessões próprias em BD (token opaco no cookie `httpOnly` + `SameSite=Lax`, hash SHA-256 na BD).
- Senhas com `crypto.scrypt` + salt + `timingSafeEqual`.
- CSRF em todos os POST (token por sessão, incluindo multipart).
- Autorização **sempre no backend**, filtrando por `restaurant_id` da sessão (IDs alheios devolvem 404).
- **Row Level Security deny-all** em todas as tabelas + direitos revogados às chaves `anon`/`authenticated`.
- CVs em **bucket privado** do Supabase Storage com nomes aleatórios, transmitidos só pela rota autenticada após verificação de posse (`Cache-Control: no-store`, `nosniff`). Sem URL pública nem assinada permanente.
- **Imagens do estabelecimento** validadas por magic bytes (PNG/JPG/WEBP); guardadas em bucket privado e servidas pelo backend, o que mantém o CSP em `img-src 'self'`.
- Validação de upload: extensão, MIME, magic bytes, tamanho máximo, 1 ficheiro.
- Rate limiting: global, login, registo, candidaturas (5/h por IP+slug), notas, vagas.
- Honeypot anti-spam + verificação de candidatura duplicada (48h).
- Cabeçalhos de segurança: CSP estrita (sem scripts inline), `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`.
- Logs básicos de segurança (`security_logs`: logins, registos, pausas, exclusões, spam).
- Prévenção de session fixation (sessão antiga destruída no login/registo).

---

## Arquitetura

```
NFC
 ↓
GET /r/:slug  (Express 5 + EJS, server-rendered)
 ↓
POST candidatura  (Multer em memória → validação → upload)
 ↓
 ┌──────────────────────────┬──────────────────────────┐
 ↓                          ↓                          
Supabase PostgreSQL       Supabase Storage            
(dados, via PostgREST)    (bucket privado `cvs`)      
 ↓                          ↓
painel /panel  ←  autorização por restaurant_id  →  /panel/cv/:id
```

- **Stack:** Node.js 22 + Express 5 + EJS (sem build step) + `@supabase/supabase-js` + Multer.
- **Sem framework de frontend:** HTML/CSS mobile-first + ~60 linhas de JS utilitário.
- **Sessão e autenticação próprias** (tabela `sessions`, cookie opaco) — não se usa Supabase Auth.
- **CVs** em bucket privado com nomes aleatórios: não existe URL pública nem assinada permanente.

### Como se acede ao PostgreSQL

O acesso é por **PostgREST** (`@supabase/supabase-js`) com a chave `service_role`, só no backend. O PostgREST não faz `GROUP BY`, subselects no `SELECT`, `OR` entre colunas de tabelas unidas, nem transações com vários statements — por isso essas operações vivem no Postgres:

| Operação | Onde vive |
|---|---|
| Busca livre em 7 campos (nome concatenado, email, telefone, documento, vaga, experiência, observações) | view `application_list` (coluna `search_text`) |
| Contagem por estado (pipeline) | view `application_status_counts` |
| Métricas do dashboard (total, 7d, 30d, vagas, não lidas) | view `restaurant_metrics` |
| Vaga + nº de candidaturas | view `job_list` |
| Sessão + utilizador + restaurante numa só ida à rede | view `session_context` |
| Métricas e listas do admin | views `platform_metrics`, `admin_restaurant_list`, `admin_user_list` |
| Candidatura completa (candidato + candidatura + CV + consentimentos + histórico + notificação) | função `submit_application` |
| Interesse para futuras oportunidades | função `submit_interest` |
| Mudança de estado + histórico | função `set_application_status` |
| Favorito + histórico | função `toggle_favorite` |
| Eliminar candidatura (devolve o caminho do CV a apagar) | função `delete_application` |
| Registo de estabelecimento com slug único à prova de corrida | função `register_restaurant` |

Uma função Postgres é uma transação: se qualquer passo falhar, nada fica meio-gravado.

### Estrutura

```
migrations/
  0000_reset.sql       # ⚠️ destrutivo — recomeçar o schema do zero
  0001_init.sql        # tabelas, constraints, índices, RLS deny-all
  0002_views_rpc.sql   # views e funções atómicas
  0003_storage.sql     # buckets privados cvs e media
src/
  server.js            # arranque (verifica o Supabase antes de servir)
  app.js               # Express: middlewares, segurança, rotas, views
  config.js            # env + .env + validação de arranque
  db/index.js          # cliente Supabase + helpers (one/many/count/rpc) + logs
  db/check.js          # `npm run check` — diagnóstico do ambiente
  db/seed.js           # cria o admin da plataforma
  db/retention.js      # `npm run retention` — política de retenção (simulação)
  middleware/          # session, csrf, auth (owner/admin), rate limit, uploads
  lib/                 # crypto (scrypt), slug, statuses, consent, storage, mailer
  routes/              # public (NFC), auth, panel, admin, legal (privacidade)
  views/               # EJS: public, auth, panel, admin, legal
public/                # css/style.css, js/app.js
test/smoke.js          # teste E2E completo contra o Supabase real
```

---

## Banco de dados

**Supabase PostgreSQL.** Migrations versionadas em `migrations/`, registadas em `schema_migrations`.

| Tabela | Relação |
|---|---|
| `restaurants` | slug único, nome comercial, tipo, CP, descrição, `logo_path`/`photo_path` (Storage), contacto, `hiring_status` (open/paused), `active` |
| `users` | dono (ligado a `restaurant_id`) ou `admin`; senha com scrypt; `blocked` |
| `jobs` | vagas por restaurante (título, descrição, requisitos, contrato, jornada, disponibilidade, ativa/inativa) |
| `candidates` | **um candidato por restaurante** — `unique (restaurant_id, email)` |
| `applications` | candidatura (estado, disponibilidade, experiência, observações, `favorite`, `job_title` em snapshot, `retention_until`, `anonymized_at`) |
| `application_notes` | notas internas privadas (com `user_id` do autor) |
| `application_history` | eventos da candidatura (`event`, `old_status`, `new_status`, `metadata`) |
| `consents` | os dois consentimentos + `consent_version` **e o texto exato aceite** |
| `cvs` | metadados do PDF (`storage_path`, nome original, MIME, tamanho) |
| `notifications` | painel (unread/read) e email (pending/sent/failed/logged) |
| `sessions` | sessões (token hashado, CSRF, expiração em ms, IP, user-agent) |
| `security_logs` | eventos de segurança com `user_id`, `restaurant_id`, IP, user-agent, `metadata` |

**Isolamento:** todas as queries filtram por `restaurant_id` vindo da sessão, nunca do pedido; as funções RPC recebem-no e verificam a posse lá dentro. Um id alheio devolve 404.

**RLS:** todas as tabelas têm Row Level Security ativo **sem nenhuma política permissiva** (deny-all), e os direitos das chaves `anon`/`authenticated` são revogados. O backend usa a `service_role`, que ignora RLS por design — o RLS é a rede de segurança para o caso de a chave pública ser exposta.

> **Mudança face ao schema SQLite anterior:** `candidates.email` era `UNIQUE` global, o que fazia uma candidatura no restaurante B sobrescrever o nome/telefone/documento que o restaurante A estava a ver, e tornava impossível apagar ou anonimizar dados por restaurante. Cada restaurante tem agora a sua própria cópia dos dados do candidato.

---

## Como executar

Requisitos: **Node.js ≥ 22** e um projeto **Supabase**.

### 1. Dependências e ambiente

```bash
npm install
cp .env.example .env     # e preencher (ver tabela abaixo)
```

No painel do Supabase → **Project Settings → API**, copiar para o `.env`:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY` (publishable — pode ser pública)
- `SUPABASE_SERVICE_ROLE_KEY` (secret — **só no backend**)

### 2. Aplicar o schema

O `supabase-js` não executa DDL. No painel do Supabase → **SQL Editor → New query**, colar e correr **por esta ordem**:

1. `migrations/0001_init.sql`
2. `migrations/0002_views_rpc.sql`
3. `migrations/0003_storage.sql`

### 3. Verificar e arrancar

```bash
npm run check        # confirma .env, migrations, views e buckets privados
npm run setup        # cria o admin da plataforma (requer ADMIN_PASSWORD)
npm start            # http://localhost:3000
npm run dev          # com auto-reload
npm test             # teste E2E contra o Supabase real
```

`npm start` verifica o Supabase antes de aceitar pedidos: se faltar uma migration ou um bucket, falha no arranque com a indicação do que fazer, em vez de servir páginas de erro.

---

## Variáveis de ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `APP_URL` | `http://localhost:3000` | URL pública — **base das URLs NFC** |
| `SUPABASE_URL` | — | **Obrigatória.** `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | — | Chave publishable/anon (pode ser pública) |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Obrigatória.** Chave secret — nunca no frontend, no git ou em logs |
| `SUPABASE_BUCKET_CVS` | `cvs` | Bucket privado dos currículos |
| `SUPABASE_BUCKET_MEDIA` | `media` | Bucket privado do logo/foto |
| `SESSION_TTL_DAYS` | `30` | Validade da sessão |
| `COOKIE_SECURE` | `0` | `1` em produção com HTTPS |
| `TRUST_PROXY` | `0` | `1` atrás de reverse proxy |
| `MAX_CV_MB` | `5` | Tamanho máximo do CV |
| `MAX_IMAGE_MB` | `2` | Tamanho máximo do logo/foto |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | Seed do admin. **Sem `ADMIN_PASSWORD` o seed recusa-se a correr** — não inventa senha previsível |
| `SMTP_HOST/PORT/SECURE/USER/PASS/FROM` | vazio | Notificações por email (opcional) |

---

## Primeiros passos

### 1. Criar o primeiro restaurante
1. Abrir `http://localhost:3000/registro`.
2. Preencher: nome (comercial), responsável, email, telefone, cidade, tipo de estabelecimento e descrição.
3. Conta criada → entra direto no painel (`/panel`).
4. O slug é gerado automaticamente (ex.: *Restaurante Granada* → `restaurante-granada`).

### 2. Criar uma vaga
Painel → **Vacantes** → preencher título (ex.: `Camarero/a`) e descrição → **Crear vacante**.
Pode desativar/reativar individualmente; se não houver vaga ativa, a página NFC passa a oferecer «futuras oportunidades».

### 3. Gravar a URL na etiqueta NFC
Painel → **Mi restaurante** → caixa preta «URL de tu etiqueta NFC» → **Copiar URL**:

```
http://localhost:3000/r/restaurante-granada     (desenvolvimento)
https://tudominio.com/r/restaurante-granada     (produção — defina APP_URL)
```

**Defina `APP_URL` com o domínio real antes de gravar a etiqueta.** O sistema não programa a tag — grave esta URL na tag com a app de escrita NFC do celular (ex.: NFC Tools → gravar URL).

---

## Como testar manualmente

### Testar uma candidatura
1. Painel → **Mi restaurante** → **Abrir página** (ou visitar `/r/<slug>`).
2. Preencher o formulário, escolher vaga, marcar o consentimento.
3. Enviar → página «¡Candidatura enviada correctamente!».
4. No painel: **Início** ou **Candidaturas** → o candidato aparece como **Nuevo**.
5. Notificação: sem SMTP, aparece no log do servidor `[EMAIL → …]`; com SMTP configurado, chega o email **«Nueva candidatura recibida»** com botão *Ver candidatura*.

### Testar o upload do PDF
- **Válido:** `CV_Juan.pdf` → aparece `CV_Juan.pdf ✓` e no perfil `Ver CV` / `Descargar CV`.
- **Inválido (extensão/MIME):** `.txt` → «Solo se aceptan archivos PDF.».
- **Inválido (conteúdo):** `.pdf` sem magic bytes `%PDF-` → «El archivo no es un PDF válido.».
- **Grande:** acima de `MAX_CV_MB` → erro de tamanho.
- **Sem documento:** deixar o Nº de documento em branco → candidatura aceite; o perfil mostra «No facilitado».
- Verificação extra: os ficheiros ficam no bucket privado `cvs` com caminhos aleatórios; **não existe URL pública nem assinada** — só `/panel/cv/:id` com sessão do dono do restaurante.

### Testar a pausa de candidaturas
1. Painel → botão **⏸ Pausar candidaturas** (Início) ou em **Mi restaurante**.
2. Reabrir a página NFC (a mesma URL/tag): mostra «Actualmente no estamos contratando» + formulário de futuras oportunidades.
3. Enviar candidatura normal enquanto pausado → **rejeitado** (só o formulário de interesse funciona).
4. Clicar **▶ Activar candidaturas** → formulário volta imediatamente. A tag NFC nunca muda.

### Testar o isolamento entre dois restaurantes
1. Registar **Restaurante A** e receber uma candidatura.
2. Em outra janela/anónimo, registar **Restaurante B**.
3. B tenta aceder `/panel/candidaturas/<id-da-A>` → **404**.
4. B tenta aceder `/panel/cv/<id-da-A>` → **404**.
5. A lista de B está vazia; a de A não é afetada.
6. (Automatizado: `npm test` — secção «Isolamento entre restaurantes».)

### Testar a área admin
```bash
npm run setup          # cria ADMIN_EMAIL/ADMIN_PASSWORD
```
Login com essas credenciais → `/admin` (métricas, estabelecimentos) e `/admin/usuarios` (bloquear contas). Donos de restaurante recebem 404 em `/admin`.

---

## Segurança — pontos em destaque

- **Autorização no backend**: cada query de candidatura/CV/nota filtra por `restaurant_id` da sessão; ID alheio devolve 404 (sem confirmar existência).
- **CVs privados**: bucket privado do Supabase Storage, nomes aleatórios de 48 caracteres hex, transmitidos apenas pela rota autenticada com verificação de posse, `no-store` e `nosniff`; validação extensão + MIME + magic bytes + tamanho (no multer **e** no bucket).
- **Sessão**: token opaco (32 bytes) no cookie `httpOnly`/`SameSite=Lax`, apenas o hash fica na BD; destruição no logout/bloqueio; sessão antiga destruída no login.
- **CSRF**: token por sessão validado em todos os POST (incluindo multipart, validado após o Multer).
- **Senhas**: scrypt (N=16384) + salt + comparação constante.
- **Rate limiting**: global (3000/15min/IP), login (10/15min por IP+email), registo, candidatura (5/h por IP+slug), notas e vagas.
- **Anti-spam**: honeypot + candidatura duplicada em 48h.
- **XSS**: EJS escapa por omissão (`<%= %>`); CSP proíbe scripts inline; nenhuma interpolação de dados do utilizador em HTML sem escaping.
- **SQL injection**: nenhuma SQL concatenada — o query builder parametriza tudo e as funções RPC recebem os valores como `jsonb` tipado. Os curingas `%` e `_` da busca livre são escapados.
- **Headers**: CSP, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, `X-Powered-By` removido.
- **Privacidade**: consentimentos independentes com versão **e texto** registados por candidatura, documento de identidade opcional (minimização), página `/privacidad` com os direitos do titular, eliminação de candidatura + CV + notas, dados isolados por estabelecimento, sem banco público de currículos, sem decisões automatizadas.
- **Logs**: `security_logs` com logins, falhas de login, registos, pausas, exclusões, spam e acessos do admin a listas com dados pessoais.

### Nota honesta sobre RGPD

A arquitetura está **preparada** para conformidade — não é uma declaração de conformidade. O texto de `/privacidad` é uma base técnica e **precisa de revisão jurídica** antes de uso real, incluindo a identificação concreta do responsável pelo tratamento. O responsável pelos dados é cada estabelecimento; o EZCV é encarregado do tratamento.

---

## Retenção de dados

Nada é apagado automaticamente: isso exigiria uma política definida e comunicada aos candidatos (§30). O que existe é a estrutura para a aplicar — `applications.retention_until` e `applications.anonymized_at` — e um script que por omissão **só simula**:

```bash
npm run retention                  # simulação: mostra o que seria afetado
npm run retention -- --dias 365    # simula a marcação de prazos a 365 dias
npm run retention -- --aplicar     # escreve (candidaturas em processo ativo ficam protegidas)
```

---

## O que falta para produção

1. **HTTPS obrigatório** + `COOKIE_SECURE=1` + `TRUST_PROXY=1` (atrás de Nginx/Caddy).
2. **Backups**: ativar point-in-time recovery no Supabase e um plano de export do bucket `cvs`.
3. **SMTP real** configurado (hoje: log no console) e, opcionalmente, WhatsApp/webhook.
4. **Revisão jurídica** do texto de `/privacidad` e canal formal de exercício de direitos.
5. **Anonimização** efetiva no `retention.js` (os passos estão documentados no ficheiro) uma vez definida a política.
6. **Verificação de email** do responsável e recuperação de senha.
7. **Hardening operacional**: rate limit persistente (hoje em memória — correto para uma instância), alertas de email falhado, healthcheck, monitorização.
8. **Paginação** real na lista de candidaturas (hoje: 200 mais recentes com filtros).
9. **Multi-utilizador por restaurante** (gerentes com permissões).
10. **RLS por tenant**: hoje o RLS é deny-all e o isolamento é imposto pelo backend. Para RLS a impor o tenant seria preciso emitir JWT com `restaurant_id` e trocar a `service_role` pela chave anon nas leituras do painel.
11. **Testes de carga** nas páginas públicas.

---

## Testes

```bash
npm test
```

`test/smoke.js` sobe o servidor e valida o fluxo completo **contra o Supabase real**: registo, login, vagas, página NFC, candidatura com CV no Storage, validação de PDF, documento opcional, CSRF, filtros e escape de curingas, pipeline visual, ordenação, upload de imagens, favoritos, histórico, consentimento com versão, área de notificações, privacidade, eliminação de vaga, honeypot, pausa/reativação, isolamento entre dois restaurantes (BD **e** Storage), RLS com chave anon, rate limiting, admin (+ logs) e exclusão segura do CV.

**Isolamento dos testes:** cada execução gera um prefixo único gravado em `restaurants.test_prefix`; no fim, a função `purge_test_data` apaga só o que ficou marcado com esse prefixo, incluindo os objetos no Storage. Os nomes dos estabelecimentos levam o prefixo e o slug é lido do painel em vez de assumido, para que duas execuções seguidas nunca colidam.
