# 06 — Derechos de los interesados: procedimiento operativo

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA.**

## 1. Quién responde

| Interesado | Responsable | Canal | Papel de Fíchame |
|---|---|---|---|
| Candidato | **El negocio** al que se candidató | Formulario en `/r/:slug/privacidad` (o email de privacidad del negocio, visible en esa página) | Encargado: transmite la solicitud al panel del negocio y le da herramientas. **No decide** (art. 28.3.e RGPD) |
| Candidato que escribe a Fíchame | El negocio | Email `OPERATOR_PRIVACY_EMAIL` | Reenviar al negocio **sin demora** y avisar al interesado de que se ha trasladado |
| Usuario de un negocio | **Fíchame** | `OPERATOR_PRIVACY_EMAIL` | Responsable |

## 2. Flujo implementado (candidatos)

1. El candidato abre «Información completa y ejercicio de derechos» (enlace en el formulario, en la confirmación y en `/r/:slug/privacidad`).
2. Elige el tipo (acceso, rectificación, supresión, oposición, limitación, portabilidad, retirada del consentimiento, otra), indica nombre, email con el que se candidató y detalles.
3. Se crea `rights_requests` con **referencia opaca** (`FCH-…`), estado `recibida` y **plazo = +1 mes** (art. 12.3). La respuesta en pantalla es **idéntica exista o no una candidatura** con ese email (no permite averiguar si alguien se candidató).
4. El negocio recibe aviso en el panel (y email al contacto de privacidad, **sin datos del interesado**).
5. En `/panel/derechos` el negocio ve el plazo (vencidos en rojo), las candidaturas de **su** negocio con ese email, y registra estado y nota (`en_curso`, `resuelta`, `denegada`; prórroga única de 2 meses).
6. Herramientas en la ficha del candidato:
   - **Acceso / portabilidad**: «Exportar datos (JSON)» — datos, todas sus candidaturas en ese negocio, notas, historial, base jurídica y consentimientos, metadatos del CV; el PDF del CV se descarga aparte. Auditado (`candidato_exportado`).
   - **Rectificación**: hoy **no hay edición** de los datos del candidato en el panel. *Pendiente*: el negocio responde por email; si se necesita, añadir edición auditada.
   - **Supresión**: «Suprimir datos del candidato» — todas sus candidaturas en ese negocio, CV (BD y Storage), notas, historial, consentimientos y notificaciones; respeta `legal_hold`. No afecta a otros negocios. Auditado (`candidato_suprimido`).
   - **Retirada del consentimiento**: registra la fecha; si estaba en reserva, pasa a cerrada con supresión en la siguiente ejecución de la retención.
   - **Limitación / oposición**: «Bloqueo de conservación» (con motivo obligatorio) impide supresión; para limitación del uso, el negocio no debe tratar la candidatura (*no hay bloqueo de uso técnico*).
7. Verificación de identidad **proporcional**: responder al email que figura en la candidatura; si el email de la solicitud no coincide, pedir verificación razonable. Nunca pedir copia del DNI por defecto.

## 3. Qué se borra y qué queda tras una supresión

| Dónde | ¿Se borra? |
|---|---|
| `candidates`, `applications`, `cvs`, `consents`, `application_notes`, `application_history`, `notifications` | Sí (transacción `delete_candidate` / cascadas) |
| Objeto PDF en Storage | Sí (después de la BD; si falla, la detección de huérfanos lo elimina en la siguiente retención) |
| `rights_requests` | No inmediatamente: es prueba de cumplimiento; se borra 3 años tras cerrarse (*plazo provisional*) |
| `security_logs` | Quedan registros con **ids internos** (no nombre/email), IP truncada en eventos del candidato. Se borran a los 365 días. Son datos **seudonimizados**, no anonimizados |
| Copias de seguridad de Supabase | **Siguen existiendo** hasta que expira su ciclo (según plan: backups diarios de 7-30 días o PITR — *confirmar en el plan contratado*). No se restauran salvo incidente; si se restaura, hay que **reaplicar las supresiones** posteriores al backup (registro `candidato_suprimido` / `retencion_aplicada`) |
| Emails ya enviados al negocio | No contienen datos del candidato (solo puesto + enlace) |
| CV descargados por el negocio a sus dispositivos | Fuera del control de Fíchame: responsabilidad del negocio |

**Bloqueo (art. 32 LOPDGDD)**: la ley española obliga al responsable a bloquear los datos al suprimirlos cuando proceda, conservándolos solo a disposición de jueces, Ministerio Fiscal y administraciones competentes durante la prescripción de responsabilidades. **Fíchame no implementa un bloqueo automático tras la supresión** (implicaría conservar más datos). `legal_hold` permite al negocio bloquear casos concretos. *LEGAL REVIEW REQUIRED*: si el bloqueo general es exigible y cómo.

## 4. Anonimización

Fíchame **no** «anonimiza» candidatos: suprime. La antigua columna `anonymized_at` no se usa. Quitar el nombre no es anonimizar (email, teléfono, CV, notas, timestamps combinados identifican). Los registros que permanecen (logs con ids) se tratan como **datos seudonimizados**.

## 5. Plazos

Respuesta: 1 mes desde la recepción, prorrogable 2 meses informando dentro del primer mes (art. 12.3). Gratuito salvo solicitudes manifiestamente infundadas o excesivas (art. 12.5).
