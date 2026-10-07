# 08 — Registro de Actividades de Tratamiento (RAT / RoPA, art. 30 RGPD)

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA.** `TODO: REQUIRES LEGAL/COMPANY INPUT` donde falte información.
> Art. 30.5: la exención para organizaciones de menos de 250 personas **no aplica** si el tratamiento puede entrañar riesgo, **no es ocasional** o incluye categorías especiales. El tratamiento de candidaturas por Fíchame no es ocasional → se recomienda mantener el registro en todo caso.

## Parte I — Fíchame como RESPONSABLE (art. 30.1)

**Responsable**: `[RAZÓN SOCIAL]`, `[NIF]`, `[DOMICILIO]`, `[EMAIL DE PRIVACIDAD]` — TODO. **DPD**: no designado (ver [09](09-dpia-assessment.md)).

| Actividad | Finalidad | Base | Interesados | Datos | Destinatarios | Transferencias | Plazo | Medidas |
|---|---|---|---|---|---|---|---|---|
| Gestión de clientes (cuentas de negocio) | Prestar el servicio | 6.1.b | Personas de contacto/usuarios de negocios | Identificativos, contacto, credenciales (hash) | Supabase, Vercel, SMTP (encargados) | Ver [07](07-data-processing-vendors.md) | Contrato + `TODO` | Hash scrypt, sesiones opacas, rate limit, CSRF |
| Seguridad y auditoría | Proteger la plataforma, investigar incidentes | 6.1.f (ponderación `TODO`) + art. 32 | Usuarios de negocios; candidatos (eventos) | Ids, acción, fecha, IP (truncada para candidatos), UA (solo usuarios) | Supabase | Ver 07 | 365 días | Sin contenido personal en `detail`, purga automática |
| Prevención de abuso | Limitar spam/fuerza bruta | 6.1.f | Cualquier visitante | Hash de IP+ruta | Supabase | Ver 07 | 1 día | Sin IP en claro |
| Atención de derechos propios | Cumplir arts. 12-22 | 6.1.c | Usuarios | Solicitud | — | — | 3 años `TODO` | — |

## Parte II — Fíchame como ENCARGADO (art. 30.2)

**Por cuenta de**: cada negocio registrado (lista en la tabla `restaurants`; razón social en `legal_name`).
**Categorías de tratamiento**: alojamiento de página de empleo, recepción y almacenamiento de candidaturas y CV, organización del proceso, avisos, canal de derechos, supresión automática.
**Subencargados / transferencias**: Supabase Inc., Vercel Inc. — ver [07](07-data-processing-vendors.md).
**Medidas de seguridad (art. 32)**: ver [risk assessment](../security/data-protection-risk-assessment.md).

## Parte III — Matriz de tratamientos (insumo para el RAT de cada negocio)

TRATAMIENTO → DATO → FINALIDAD → TITULAR → RESPONSABLE → BASE → DESTINATARIOS → RETENCIÓN → RIESGO → MEDIDA

| Tratamiento | Dato | Finalidad | Titular | Responsable | Base | Destinatarios | Retención (por defecto, provisional) | Riesgo | Medida |
|---|---|---|---|---|---|---|---|---|---|
| Recogida de candidatura | Nombre, apellidos, email, teléfono, puesto, disponibilidad, experiencia, observaciones | Selección | Candidato | Negocio | 6.1.b | Fíchame (encargado), Supabase, Vercel | Activa: +180 d sin actividad; cerrada: +90 d | Exceso de datos; datos sensibles en texto libre | Campos mínimos, sin DNI; aviso; límites de longitud |
| Almacenamiento de CV | PDF | Selección | Candidato | Negocio | 6.1.b | Igual | Igual | Fuga; PDF malicioso | Bucket privado, nombre aleatorio, carpeta por tenant (CHECK en BD), magic bytes + heurística de contenido activo, límites de tamaño, sin URL pública |
| Visualización/descarga de CV | PDF | Selección | Candidato | Negocio | 6.1.b | Usuario del negocio | — | Acceso indebido / IDOR | Sesión + filtro por tenant en BD + prefijo de ruta; `no-store`; auditado |
| Búsqueda/filtros | Campos de texto | Organizar | Candidato | Negocio | 6.1.b | — | — | Discriminación | Sin filtros por atributos protegidos |
| Notas internas | Texto libre | Selección | Candidato | Negocio | 6.1.b | — | Con la candidatura | Datos sensibles, discriminación | Aviso + detector con confirmación + auditoría + exportables |
| Estados/historial | Eventos | Selección | Candidato | Negocio | 6.1.b | — | Con la candidatura | — | Cambios solo humanos, historial |
| Reserva (futuras oportunidades) | Igual + texto del consentimiento | Vacantes futuras del mismo negocio | Candidato | Negocio | 6.1.a | Igual | Consentimiento + 365 d o retirada | Reutilización indebida | Opcional, separado, específico, versionado, fecha, revocable; «reserva» exige consentimiento |
| Aviso de nueva candidatura | Puesto + enlace | Avisar al negocio | Candidato (indirecto) | Negocio | 6.1.b | SMTP | — | Fuga por email | Sin datos del candidato ni CV |
| Solicitudes de derechos | Nombre, email, tipo, mensaje | Cumplir derechos | Candidato | Negocio | 6.1.c | — | 3 años tras cierre | — | Plazo visible, auditoría |
| Logs de eventos de candidatos | Ids, IP truncada | Seguridad | Candidato | Fíchame (ver [02](02-data-controller-processor-analysis.md) F) | 6.1.f | Supabase | 365 d | Seguimiento | Sin UA, sin email, IP truncada |
| Sesión anónima | Token (hash), token CSRF | Seguridad del formulario | Visitante | Fíchame | 6.1.f / art. 22.2 LSSI | Supabase | 2 h | — | Sin IP/UA |

**Supresión automática**: `npm run retention` (simulación por defecto; `--aplicar` para ejecutar) o `GET /internal/retention` con `CRON_SECRET` y `RETENTION_AUTO=1`. Regla por negocio en `recompute_retention` (migración 0005); excepción: `legal_hold`.
