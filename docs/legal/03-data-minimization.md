# 03 — Minimización de datos (art. 5.1.c y 25 RGPD)

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA.** AEPD: «Únicamente cabe solicitar datos relevantes para el desempeño del puesto de trabajo y no información indiscriminada» (guía «La protección de datos en las relaciones laborales», III.1).

## Formulario de candidatura (`/r/:slug`)

| Campo | ¿Necesario en esta fase? | Decisión |
|---|---|---|
| Nombre | Sí, para identificar y dirigirse al candidato | Obligatorio |
| Apellidos | Útil, no imprescindible | Opcional |
| Email | Sí, contacto | Obligatorio |
| Teléfono | Sí: en hostelería/comercio el contacto es telefónico; además permite al negocio llamar | Obligatorio — *revisar si basta email o teléfono* |
| Puesto | Sí | Opcional (lista cerrada de vacantes u «otro») |
| Disponibilidad | Sí, criterio del puesto | Opcional (lista cerrada) |
| Experiencia | Sí | Opcional, texto ≤ 2000 |
| Observaciones | Marginal; riesgo de datos sensibles | Opcional, ≤ 1000, con aviso y placeholder neutro |
| CV (PDF) | Sí | Obligatorio, 1 archivo, ≤ 5 MB |
| **DNI/NIE/pasaporte** | **No.** Solo al contratar (alta en la Seguridad Social, contrato) | **ELIMINADO del formulario** (antes era opcional). El servidor ignora el campo aunque se envíe (`test/smoke.js`). |
| Fecha de nacimiento, nacionalidad, dirección completa, estado civil, familia, foto | No | Nunca solicitados |
| Categorías especiales (art. 9) | No | Nunca solicitadas; aviso para no incluirlas ni en el CV |

**Dato histórico:** la base contenía 1 candidatura con número de documento recogido antes del cambio. Se muestra con la advertencia «Dato antiguo: ya no se recoge» y se suprimirá con la retención. *Decisión del responsable (N)*: puede suprimirlo antes.

## Formulario de interés (contratación pausada)

Nombre, email, teléfono, una frase opcional (≤ 500). Sin CV.

## Cuenta del negocio

Obligatorios: nombre del establecimiento, **razón social o titular** (exigido para informar del responsable, art. 13.1.a), persona de contacto, email, ciudad, tipo. **Teléfono y dirección pasan a opcionales.**

## Datos técnicos

| Dato | Antes | Ahora |
|---|---|---|
| Sesión anónima de candidato | IP + user-agent, 30 días | **Sin IP ni UA, 2 horas** |
| Logs de eventos de candidatos | IP completa + UA | **IP truncada (/24, /48), sin UA** |
| Login fallido | email en claro | `user=<id>` o HMAC del email (seudónimo) |
| Detalle de logs | algunos con emails/nombres | solo ids internos y acción (migración 0005 redactó los antiguos) |
| Email de nueva candidatura | nombre del candidato + puesto | **solo puesto + enlace autenticado** |
| Console log del email (sin SMTP) | destinatario + cuerpo completo | solo «no enviado» |
| Rate limiting | — | hash SHA-256 de ip+ruta, 1 día |
| Búsqueda libre | incluía nº de documento | **excluido** |

## Lo que la minimización no resuelve

- El **contenido del CV** lo decide el candidato. El sistema no lo lee ni lo procesa; aconseja quitar datos innecesarios. No se aplica ninguna detección automática sobre el CV (sería un tratamiento adicional).
- Las **notas internas**: ver [04](04-recruitment-discrimination-risks.md).
