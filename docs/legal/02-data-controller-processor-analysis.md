# 02 — Responsable / encargado por tratamiento

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA ANTES DE USO COMERCIAL.**
> Método: art. 4.7 y 4.8 RGPD y Directrices 07/2020 del EDPB sobre los conceptos de responsable y encargado: es responsable quien determina **fines y medios esenciales** *de hecho*. Se analiza cada tratamiento por separado; **no** se asume que «el restaurante siempre es responsable».

Abreviaturas: **N** = negocio cliente (restaurante, tienda…); **F** = titular de Fíchame.

| Id | Tratamiento | Responsable | Encargado | ¿Corresponsabilidad? | Base jurídica propuesta | Finalidad | Datos | Conservación |
|---|---|---|---|---|---|---|---|---|
| A | Candidatura a un negocio (formulario + CV + notas + estados + historial) | **N** | **F** (subencargados: Supabase, Vercel) | No, mientras F no use los datos para fines propios ni influya en la selección | 6.1.b RGPD (medidas precontractuales a petición del interesado) — AEPD, guía relaciones laborales, III.1 | Gestionar el proceso de selección de N | Nombre, apellidos, email, teléfono, puesto, disponibilidad, experiencia, observaciones, CV, notas, estados | Activa: última actividad + 180 d; cerrada: +90 d (provisional) |
| A2 | Reserva / futuras oportunidades en el **mismo** negocio | **N** | **F** | No | 6.1.a (consentimiento separado, opcional, registrado) — AEPD III.7 | Considerar al candidato para vacantes futuras de N | Igual que A | Consentimiento + 365 d o hasta retirada |
| A3 | Solicitudes de derechos de candidatos | **N** | **F** (canal y herramientas) | No | 6.1.c (arts. 12-22 RGPD) | Atender derechos | Nombre, email, tipo, mensaje | 3 años tras cierre (provisional) |
| B | Cuenta del negocio (registro, perfil, aceptación de términos) | **F** | — | No | 6.1.b (contrato con N) | Prestar el servicio | Razón social, nombre comercial, persona de contacto, emails, teléfono (opcional), dirección (opcional) | Duración del contrato + plazo legal *(pendiente)* |
| C | Autenticación (contraseña con hash, sesiones, recuperación) | **F** | — | No | 6.1.b + 6.1.f (seguridad) | Acceso seguro | Email, hash de contraseña, token de sesión (hash), IP y UA de sesiones autenticadas | Sesión: 30 d máx.; tokens de recuperación: 30 min |
| D | Facturación | **F** | — | — | 6.1.b + 6.1.c (obligaciones fiscales) | — | **No implementado** | *Pendiente* |
| E | Prevención de fraude/abuso (rate limit, honeypot) | **F** | — | No | 6.1.f (ponderación pendiente) + art. 32 | Proteger la plataforma | Hash de IP+ruta (sin IP en claro) | 1 día |
| F | Logs de seguridad / auditoría | **F** (seguridad de la plataforma). *Los registros de accesos a CV de N también sirven a N como responsable: LEGAL REVIEW* | — | **Posible** respecto de los registros de acceso a datos de candidatos (F decide su existencia, N los necesita para su responsabilidad proactiva). Analizar | 6.1.f + art. 32 | Detectar/investigar incidentes, rendición de cuentas | Actor, acción, recurso (ids), fecha, IP (truncada para candidatos), UA | 365 d |
| G | Soporte | **F** para datos del cliente; **F como encargado** si accede a datos de candidatos por instrucción de N | — | No | 6.1.b | Resolver incidencias | Mínimos | Mientras dure la incidencia |
| H | Métricas agregadas de plataforma | **F** | — | No | 6.1.f | Gestión del servicio | Recuentos (sin datos identificativos) | — |
| I | Cookies / analítica | **F** (cookie técnica) | — | No | Art. 22.2 LSSI: exenta de consentimiento (estrictamente necesaria) | Sesión y CSRF | Identificador aleatorio | 2 h (anónima) / 30 d (cuenta) |
| J | Emails transaccionales | **F** (a N, sobre su cuenta) / **F encargado** (aviso de nueva candidatura por cuenta de N) | Proveedor SMTP *(por definir)* | No | 6.1.b | Avisos del servicio | Email de N; **sin datos del candidato** | Registro del envío ligado a la candidatura |
| K | Marketing propio de F | **F** | — | — | 6.1.a / art. 21 LSSI | **No existe** | — | — |
| L | Obligaciones legales (requerimientos de autoridades, conservación) | **F** o **N** según el dato | — | — | 6.1.c | — | — | Según norma |
| M | Mejora del producto con datos de candidatos | — | — | — | **Prohibido por diseño**: F no usa datos de candidatos para fines propios. Si lo hiciera, F pasaría a ser **responsable** de ese tratamiento (art. 28.10 RGPD) y necesitaría base propia y transparencia | — | — | — |

## Riesgos de recalificación

- Si F usase datos de candidatos para fines propios (estadísticas no agregadas, entrenamiento de modelos, «candidate pool»), **se convertiría en responsable** (art. 28.10 RGPD) y, en el caso del pool, aumentaría el riesgo del [doc. 01](01-analisis-agencia-colocacion.md).
- Si F definiera de forma determinante **qué datos se piden y para qué** en la selección, podría argumentarse **corresponsabilidad** (art. 26) en el tratamiento A. Mitigación: el formulario se limita a datos estándar mínimos; N decide sus vacantes, plazos (configurables) y todo el proceso. *LEGAL REVIEW REQUIRED.*
- Los accesos de la **administración de F** a datos de candidatos se limitan por diseño (el rol admin no tiene rutas de candidatos; ver [route-audit](../security/route-audit.md)). Pero quien tenga acceso al proyecto Supabase (clave service_role o panel) **puede leer todo**: eso es un acceso de encargado que debe regirse por el art. 28.3.b (confidencialidad) y quedar registrado manualmente (ver [operational-security](../security/operational-security.md)).

## Flujos separados (no mezclar)

1. Candidato → Negocio (A, A2, A3): F encargado.
2. Negocio → F (B, C, G, J): F responsable.
3. F → sus datos administrativos (D, F, H, L): F responsable.
4. F → proveedores (Supabase, Vercel, SMTP): subencargados (de A) / encargados (de B-J).
