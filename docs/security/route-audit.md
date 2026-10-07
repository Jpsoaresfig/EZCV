# Auditoria de rotas (2026-10-06)

Legenda — **Auth**: P = pública, O = owner (sessão + papel `owner` + restaurante ativo, `requireOwner`), A = admin (`requireAdmin`, 404 para outros), S = segredo (Bearer). **Tenant**: sempre derivado da sessão (`req.user.restaurant_id`), nunca do pedido. **CSRF**: token por sessão (corpo `_csrf` ou cabeçalho), comparação em tempo constante; em multipart é verificado depois do multer. **RL**: M = rate limit em memória, D = partilhado na BD (entre instâncias).

Comuns a todas as respostas: CSP estrita, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, COOP/CORP, HSTS + `upgrade-insecure-requests` em produção, `Cache-Control: no-store` em todas as respostas dinâmicas, `X-Robots-Tag: noindex` exceto landing/legais/página pública do negócio. Sem CORS (nenhuma rota o ativa). Limite global M 3000/15 min por IP.

| Rota | Auth | Dados pessoais | Autorização | RL | CSRF | Log | Risco / notas |
|---|---|---|---|---|---|---|---|
| `GET /` | P | — | — | — | — | — | — |
| `GET /privacidad`, `/cookies`, `/terminos`, `/encargo` | P | — | — | — | — | — | Textos borrador |
| `GET /robots.txt` | P | — | — | — | — | — | — |
| `GET /r/:slug` | P | — | slug validado; negócio inexistente = desativado (404 idêntico) | — | gera token | — | Enumeração de slugs: slugs derivam do nome (públicos por natureza; a URL está numa etiqueta física) |
| `POST /r/:slug/apply` | P | Candidato + CV | negócio ativo e a contratar | M 20/h IP+slug; D 60/h IP | ✓ (pós-multer) | `candidatura_enviada` (IP truncado) | Honeypot; limites multipart; PDF: ext/MIME + magic bytes + heurística de conteúdo ativo + %%EOF + ≤5 MB; duplicado → resposta idêntica |
| `POST /r/:slug/interes` | P | Contacto | idem | M 20/h; D 60/h | ✓ | `interes_registrado` | Consentimento obrigatório (única finalidade) |
| `GET /r/:slug/enviado` | P | — | — | — | — | — | Não revela nada interno |
| `GET /r/:slug/privacidad` | P | — | negócio ativo | — | gera token | — | 2.ª camada art. 13 |
| `POST /r/:slug/derechos` | P | Nome/email do titular | negócio ativo | M 5/h; D 10/dia IP | ✓ | `derechos_solicitud` | Resposta idêntica com/sem candidatura |
| `GET /r/:slug/imagen/:tipo` | P | — (imagem do negócio) | negócio ativo | — | — | — | Cache pública (conteúdo público do negócio) |
| `GET/POST /registro` | P | Conta do negócio | — | M 10/15 min; D 10/h | ✓ | `registro_restaurante` | **WARNING**: «email já existe» permite enumerar contas de negócio (sem verificação de email) |
| `GET/POST /login` | P | Credenciais | senha verificada antes de revelar bloqueio; hash fictício (tempo) | M 10/15 min IP+email; D 30/15 min IP; D 20/h conta | ✓ | `login_ok/fallido/bloqueado` (sem email) | Sessão nova ao autenticar |
| `POST /logout` | O/A | — | — | — | ✓ | `logout` | — |
| `GET/POST /recuperar`, `/recuperar/nueva` | P | Email | token 256 bits, hash, 30 min, uso único, `no-referrer` | M 5/15 min; D 10/h IP; D 3/h conta | ✓ | `password_reset_*` | Token no fragmento `#` (não chega a logs). Invalida todas as sessões |
| `GET /internal/retention` | S | — (só contagens) | `CRON_SECRET` ≥ 32 + `RETENTION_AUTO=1`, senão 404 | — | n/a | `retencion_aplicada` | — |
| `GET /panel` | O | Lista recente | tenant | — | — | — | — |
| `GET /panel/candidaturas` | O | Lista + pesquisa | tenant; filtros validados por lista branca; `ilike` com escape; queries parametrizadas (PostgREST) | — | — | — | Máx. 200 linhas |
| `GET /panel/candidaturas/:id` | O | Ficha completa | `id` numérico; filtro tenant (404 igual a inexistente) | — | — | `candidatura_vista` | — |
| `POST …/:id/estado`, `/favorito` | O | — | RPC com `restaurant_id` | — | ✓ | `estado_cambiado` | «reserva» exige consentimento |
| `POST …/:id/notas`, `/notas/:noteId/eliminar` | O | Notas | tenant | M 30/10 min | ✓ | `nota_*` (sem texto) | Detetor de características protegidas |
| `POST …/:id/eliminar` | O | — | RPC tenant; respeita `legal_hold` | — | ✓ | `candidatura_eliminada` | Apaga CV do Storage |
| `POST …/:id/eliminar-candidato` | O | — | RPC tenant; confirmação; `legal_hold` | — | ✓ | `candidato_suprimido` | Direito de supressão |
| `POST …/:id/retirar-consentimiento`, `/bloqueo` | O | — | RPC tenant | — | ✓ | `consentimiento_retirado`, `bloqueo_*` | — |
| `GET …/:id/exportar` | O | Todos os dados do candidato no tenant | tenant | — | — | `candidato_exportado` | JSON attachment, no-store |
| `GET /panel/cv/:id` | O | CV | filtro tenant na BD + prefixo `r/<rid>/` + CHECK na BD | — | — | `cv_visto` / `cv_descargado` (await) | `no-store`, nome saneado |
| `GET/POST /panel/vagas…` | O | — | tenant em todas as escritas | M 20/10 min (criar) | ✓ | `vacante_eliminada` | — |
| `POST /panel/contratacion` | O | — | tenant | — | ✓ | `candidaturas_*` | — |
| `GET/POST /panel/restaurante`, `/panel/qr(.png)` | O | Conta do negócio | tenant | — | ✓ | `restaurante_actualizado` | Imagens: magic bytes, sem SVG |
| `GET/POST /panel/configuracion` | O | Credenciais | senha atual obrigatória | M 10/15 min | ✓ | `password_cambiada`, `email_cambiado` | Termina as outras sessões |
| `GET/POST /panel/notificaciones…` | O | Nome do candidato | tenant | — | ✓ | — | `volver` só caminhos internos (anti open-redirect) |
| `GET/POST /panel/privacidad…` | O | — | tenant | — | ✓ | `retencion_configurada` | Prazos dentro de limites (CHECK na BD) |
| `GET/POST /panel/derechos…` | O | Pedidos | tenant | — | ✓ | `derechos_actualizada` | — |
| `GET /admin`, `/admin/usuarios`, `/admin/logs` | A | Metadados de negócios e utilizadores; logs | papel admin | — | — | `admin_lista_usuarios` | **Sem rotas de candidatos/CV**; admin → `/panel/*` = 403 (testado) |
| `GET /admin/divulgacion`, `/admin/divulgacion/qr.png`, `/qr.svg` | A | — | papel admin | — | — | — | QR fixo para `APP_URL/conoce`; não aceita URL do pedido (sem gerador aberto). Anónimo/owner → 404 (testado) |
| `POST /admin/restaurantes/:id/toggle`, `/admin/usuarios/:id/bloquear` | A | — | `id` numérico | — | ✓ | `restaurante_toggle`, `usuario_bloqueo` | Bloquear termina sessões |

## Notas transversais

- **SQL injection**: não há SQL construído com strings no Node; todas as queries usam o query builder do PostgREST (parâmetros) ou funções RPC com um parâmetro `jsonb`. As funções SQL não usam `execute` com dados de entrada (os `format(%I)` das migrations só usam listas fixas).
- **XSS**: EJS com `<%= %>` (escape) em todos os dados; `<%- %>` só para includes, ícones fixos e o SVG do QR gerado no servidor. CSP sem `unsafe-inline`. Testado com `<script>` no nome e HTML no nome do ficheiro.
- **Template/command injection**: sem `eval`, sem renderização de templates vindos do utilizador; `child_process` só nas CLIs (`migrate`, testes) com argumentos fixos.
- **Header/email injection**: `Content-Disposition` com nome ASCII saneado + `filename*` codificado; endereços SMTP validados contra CR/LF/`<>`; assunto sem quebras de linha.
- **Mensagens `?ok=`/`?err=`**: texto refletido e escapado (sem XSS), mas permite *content spoofing* com um link manipulado. **WARNING** (baixo).
- **RBAC**: só existem os papéis `owner` (1 por negócio) e `admin`. Não há utilizadores múltiplos por negócio nem papéis manager/staff — ver gate.
