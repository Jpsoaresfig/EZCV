# EZCV

**Candidaturas por NFC para qualquer negócio em Espanha — restaurantes, lojas, hotéis, cabeleireiros, ginásios…**

O candidato aproxima o telemóvel da etiqueta NFC do estabelecimento, abre a página do negócio, preenche o formulário e envia o CV em PDF. A candidatura aparece no painel do restaurante, onde o dono a organiza, contacta o candidato e acompanha o processo até à contratação.

```
Etiqueta NFC → /r/:slug → formulário + CV (PDF) → painel do restaurante → Nuevo … Contratado
```

A etiqueta **não é programada pelo sistema**: o EZCV fornece a URL e o dono grava-a na tag com qualquer app de escrita NFC (ex.: NFC Tools).

> 📄 Documentação técnica completa (rotas, fluxos, modelo de dados, segurança, testes): [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md)

---

## Funcionalidades

**Candidato** — sem conta, mobile-first, em espanhol
- Página pública `/r/:slug` com logo, descrição e estado de contratação (🟢 / 🔴).
- Formulário com vaga, disponibilidade, experiência e CV em PDF validado.
- Documento de identidade opcional (minimização de dados).
- Consentimentos RGPD separados, com versão e texto exato registados; página `/privacidad`.
- Com as candidaturas em pausa: formulário para guardar dados para futuras oportunidades.

**Restaurante** — painel `/panel`
- Métricas, caixa «Necesita atención» e pipeline visual com 8 estados.
- Pesquisa livre, filtros (estado, vaga, disponibilidade, datas), favoritos e ordenação.
- Perfil do candidato com CV, notas internas, histórico e atalhos `tel:`, `mailto:` e WhatsApp.
- Vacantes: criar, editar, ativar/desativar e eliminar.
- Pausar/ativar candidaturas **sem mexer na etiqueta NFC**.
- Código QR da mesma URL, pronto a imprimir ou descarregar em PNG (`/panel/qr`).
- Notificações no painel e por email (SMTP opcional).

**Landing page** — `/`
- Apresenta o produto aos donos de negócios: como funciona, funcionalidades, privacidade e FAQ.
- As maquetas do formulário e do painel são HTML/CSS (sem imagens), por isso seguem o modo escuro.

**Admin da plataforma** — `/admin`
- Métricas globais, ativação de estabelecimentos, bloqueio de utilizadores e logs de segurança.
- **Sem acesso a dados de candidatos**, por desenho.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Servidor | Node.js 22 + Express 5 |
| Views | EJS server-rendered, CSS mobile-first, sem build step |
| Base de dados | Supabase PostgreSQL via PostgREST (`@supabase/supabase-js`) |
| Ficheiros | Supabase Storage — buckets privados `cvs` e `media` |
| Uploads | Multer (em memória) + validação por magic bytes |
| Autenticação | Sessões próprias em BD (não usa Supabase Auth) |

A lógica que o PostgREST não exprime (agregações, pesquisa em vários campos, operações transacionais) vive no Postgres como **views e funções `jsonb`** — ver [`migrations/0002_views_rpc.sql`](migrations/0002_views_rpc.sql).

---

## Como executar

**Requisitos:** Node.js ≥ 22 e um projeto [Supabase](https://supabase.com).

### 1. Instalar e configurar

```bash
git clone https://github.com/Jpsoaresfig/EZCV.git
cd EZCV
npm install
cp .env.example .env
```

Preencher o `.env` com os dados de **Supabase → Project Settings → API**:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` — secreta, **só no backend**

### 2. Criar o schema

**Opção A — pelo terminal** (requer `psql` e `DATABASE_URL` no `.env`):

```bash
npm run migrate
```

**Opção B — pelo painel:** em **SQL Editor → New query**, colar e correr por ordem:

1. `migrations/0001_init.sql`
2. `migrations/0002_views_rpc.sql`
3. `migrations/0003_storage.sql`

As migrations são idempotentes. `0000_reset.sql` é **destrutivo** (apaga o schema) e só corre com `npm run migrate -- --reset`.

### 3. Verificar e arrancar

```bash
npm run check    # valida .env, migrations, views e buckets privados
npm run setup    # cria o admin da plataforma (requer ADMIN_PASSWORD)
npm run dev      # http://localhost:3000, com auto-reload
```

O servidor verifica o Supabase no arranque e recusa-se a servir se faltar uma migration ou um bucket, indicando o que corrigir.

### 4. Primeiro uso

1. Registar um estabelecimento em `/registro` — entra direto no painel.
2. Criar uma vaga em **Vacantes**.
3. Em **Mi restaurante**, copiar a URL da etiqueta (`https://<APP_URL>/r/<slug>`) e gravá-la na tag NFC.

> Defina `APP_URL` com o domínio real **antes** de gravar as etiquetas.

---

## Scripts

| Comando | Descrição |
|---|---|
| `npm start` | Arranca o servidor |
| `npm run dev` | Arranca com auto-reload (`node --watch`) |
| `npm run migrate` | Aplica as migrations via `psql` (`--reset`, `--so <n>`) |
| `npm run check` | Diagnóstico do ambiente e do Supabase |
| `npm run setup` | Cria o admin da plataforma |
| `npm run retention` | Política de retenção — **simula** por omissão (`--dias <n>`, `--aplicar`) |
| `npm test` | Teste E2E completo contra o Supabase real |

---

## Variáveis de ambiente

Ver [`.env.example`](.env.example) para a lista comentada.

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `APP_URL` | `http://localhost:3000` | URL pública — **base das URLs NFC** |
| `SUPABASE_URL` | — | **Obrigatória** |
| `SUPABASE_ANON_KEY` | — | Chave publishable |
| `SUPABASE_SERVICE_ROLE_KEY` | — | **Obrigatória.** Nunca no frontend, no git ou em logs |
| `SUPABASE_BUCKET_CVS` / `_MEDIA` | `cvs` / `media` | Buckets privados |
| `DATABASE_URL` | — | Só para `npm run migrate`; a app não a usa |
| `SESSION_TTL_DAYS` | `30` | Validade da sessão |
| `COOKIE_SECURE` / `TRUST_PROXY` | `0` | `1` em produção com HTTPS / atrás de proxy |
| `MAX_CV_MB` / `MAX_IMAGE_MB` | `5` / `2` | Limites de upload |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME` | — | Seed do admin |
| `SMTP_*` | vazio | Email opcional; sem SMTP, os avisos vão para o log |

---

## Estrutura

```
migrations/          SQL versionado: tabelas, RLS, views/RPC, storage
src/
  server.js          arranque (verifica o Supabase antes de servir)
  app.js             Express: middlewares, cabeçalhos de segurança, rotas
  config.js          leitura e validação do ambiente
  db/                cliente Supabase, migrate, check, seed, retention
  middleware/        session, csrf, auth, rate limit, uploads
  lib/               crypto, slug, statuses, consent, storage, mailer
  routes/            public (NFC), auth, panel, admin, legal
  views/             templates EJS
public/              CSS e JS do cliente
test/smoke.js        teste E2E
docs/                documentação técnica
```

---

## Segurança

- Autorização sempre no backend, filtrada pelo `restaurant_id` da sessão — IDs alheios devolvem 404.
- Row Level Security **deny-all** em todas as tabelas e direitos revogados a `anon`/`authenticated`.
- CVs em bucket privado com nomes aleatórios, servidos só pela rota autenticada após verificação de posse; sem URLs públicas nem assinadas.
- Uploads validados por extensão, MIME, magic bytes e tamanho.
- Senhas com `scrypt`; sessões com token opaco em cookie `httpOnly`/`SameSite=Lax` (só o hash vai para a BD).
- CSRF em todos os POST, rate limiting, honeypot e deteção de candidaturas duplicadas.
- CSP estrita sem scripts inline, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`.

Inventário completo em [`docs/DOCUMENTACAO.md` §8](docs/DOCUMENTACAO.md#8-segurança-inventário).

> **RGPD:** a arquitetura está preparada para conformidade, mas isso não é uma declaração de conformidade. O texto de `/privacidad` precisa de revisão jurídica antes de uso real. Cada estabelecimento é responsável pelo tratamento; o EZCV é encarregado.

---

## Testes

```bash
npm test
```

`test/smoke.js` sobe o servidor e percorre o fluxo completo contra o Supabase real: registo, vagas, candidatura com CV, validação de PDF, CSRF, filtros, favoritos, pausa, isolamento entre restaurantes (BD e Storage), RLS com a chave anon, rate limiting e admin.

Cada execução marca os seus dados com um prefixo único e apaga-os no fim com `purge_test_data`, incluindo os objetos no Storage.

---

## Antes de ir para produção

- HTTPS com `COOKIE_SECURE=1` e `TRUST_PROXY=1`.
- Backups: point-in-time recovery no Supabase e export do bucket `cvs`.
- SMTP real configurado.
- Revisão jurídica de `/privacidad` e canal formal para exercício de direitos.
- Política de retenção definida e anonimização efetiva em `npm run retention`.
- Recuperação de senha e verificação de email.
- Rate limit persistente se houver mais de uma instância (hoje é em memória).
- Paginação real na lista de candidaturas (hoje: as 200 mais recentes).

Lista completa em [`docs/DOCUMENTACAO.md` §12](docs/DOCUMENTACAO.md#12-pendências-produção).
