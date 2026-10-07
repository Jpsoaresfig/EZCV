# Resposta a incidentes e violações de dados

> BORRADOR — REQUIERE REVISIÓN JURÍDICA. A decisão de notificar a AEPD ou os titulares **nunca é automática**: depende de uma avaliação de risco documentada (arts. 33-34 RGPD).

## 1. Papéis

| Papel | Quem | Responsabilidade |
|---|---|---|
| Responsável do incidente | `TODO: nome` (titular do Fíchame) | Coordena, decide contenção, fecha |
| Técnico | `TODO` | Investigação, contenção técnica, preservação de evidências |
| Assessor jurídico | `TODO` | Avaliação de risco, decisão sobre notificações |
| Contacto com negócios afetados | Responsável do incidente | Fíchame é **encarregado**: notifica o negócio (responsável) sem dilação indevida (art. 33.2); o negócio decide notificar a AEPD/titulares, com o apoio do Fíchame |

Para dados de contas de negócio (Fíchame responsável), o Fíchame decide e notifica.

## 2. Exemplos de incidentes

Fuga ou acesso indevido a CV; falha de isolamento entre tenants; bucket tornado público; chave `service_role` exposta (git, logs, screenshot, frontend); conta de negócio comprometida; conta admin ou de cloud comprometida; upload malicioso explorado; perda de dados (apagamento indevido, falha de backup); envio de email a destinatário errado.

## 3. Procedimento

### 3.1 Deteção
Fontes: `npm run check` (autodiagnóstico RLS/grants/buckets), `/admin/logs` (picos de `login_fallido`, `cv_rechazado_activo`, `spam_honeypot`, `cv_descargado` anómalos), alertas do Supabase/Vercel, avisos de utilizadores ou terceiros. **Registar a hora de conhecimento** — o prazo de 72 h (art. 33.1) conta desde que o responsável tem conhecimento.

### 3.2 Contenção (minutos-horas)
- Chave exposta → **rodar** `service_role`/`secret` no Supabase (Project Settings → API) e atualizar a Vercel; invalidar sessões (`delete from sessions;`).
- Conta comprometida → `/admin/usuarios` bloquear (termina sessões); forçar recuperação de senha.
- Bucket público → tornar privado; `npm run check`.
- Falha de isolamento → desativar a funcionalidade/rota ou colocar o site em manutenção.
- **Não apagar** logs nem dados afetados.

### 3.3 Preservação de evidências
Exportar antes de qualquer limpeza: `security_logs` do período (eventos `cv_visto`, `cv_descargado`, `candidatura_vista`, `candidato_exportado`, `login_*`, `password_*`, `admin_*`), logs da Vercel e do Supabase (API/Storage/Auth), lista de objetos do bucket. Guardar com hash e data num local de acesso restrito. **Não** desligar a retenção automática de logs sem registar a decisão (`RETENTION_AUTO=0`).

### 3.4 Investigação — o sistema deve permitir responder
| Pergunta | Fonte |
|---|---|
| O que aconteceu e quando | `security_logs.created_at/event`, logs Vercel/Supabase |
| Que dados / que titulares | ids em `detail` (`app=`, `cv=`) → `applications`/`candidates` (se ainda existirem) |
| Que empresa | `security_logs.restaurant_id` |
| Que vetor | rota, IP, user-agent (utilizadores autenticados), sequência de eventos |
| Que acessos / ficheiros | `cv_visto`/`cv_descargado` por `user_id`, `restaurant_id` |
| Que ações foram tomadas | registo do incidente (este processo) |

**Limitação conhecida:** leituras feitas diretamente no Supabase (painel, SQL, service key) **não** ficam em `security_logs`. Ver [operational-security.md](operational-security.md).

### 3.5 Avaliação de risco e decisão de notificação
Fatores: tipo de dados (CV pode conter dados sensíveis), volume, identificabilidade, possibilidade de dano (discriminação, fraude, phishing), se os dados estavam inteligíveis, se a exposição foi contida. Ferramentas de referência: guia da AEPD sobre notificação de brechas e ferramenta «Comunica-Brecha RGPD» (*verificar versão atual*), Diretrizes 9/2022 do EDPB sobre notificação.
- **AEPD (art. 33)**: salvo que seja improvável um risco para os direitos e liberdades — em 72 h, pela sede eletrónica da AEPD; se não houver toda a informação, notificação por fases.
- **Titulares (art. 34)**: se for provável um **alto risco**; linguagem clara, medidas recomendadas.
- **Documentar sempre** (art. 33.5), notificando ou não: factos, efeitos, medidas, raciocínio da decisão.

### 3.6 Erradicação e recuperação
Corrigir a causa (código + migration + teste que reproduza o incidente), restaurar a partir de backup se necessário (**reaplicar supressões posteriores ao backup**), validar com `npm test` e `npm run check`.

### 3.7 Comunicação
Negócios afetados por escrito; titulares conforme 3.5; nunca incluir dados pessoais desnecessários nas comunicações.

### 3.8 Pós-incidente
Relatório em ≤ 2 semanas: cronologia, causa raiz, ações, alterações ao risk assessment e ao gate de produção.

## 4. Registo de incidentes
`TODO`: manter um registo (pode ser um documento privado) com: id, datas (ocorrência, conhecimento, contenção, notificações), descrição, dados/titulares/negócios, avaliação de risco, decisão e fundamento, ações.
