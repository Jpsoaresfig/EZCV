# 04 — Riesgos de discriminación y datos sensibles en la selección

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA.**

## Marco

- **Ley 3/2023 de Empleo**: art. 5.a (igualdad y no discriminación en el acceso al empleo por edad, sexo, discapacidad, salud, orientación sexual, identidad de género, expresión de género, características sexuales, nacionalidad, origen racial o étnico, religión o creencias, opinión política, afiliación sindical…); art. 40.2.c (selección «evitando cualquier sesgo o estereotipo de género, edad o discapacidad»); art. 45.2.
- **TRLISOS (RDLeg 5/2000) art. 16.1.c**: infracción muy grave «solicitar datos de carácter personal en los procesos de selección o establecer condiciones… que constituyan discriminaciones para el acceso al empleo…» (citado por la AEPD, guía relaciones laborales, III.3).
- **Ley 15/2022**, integral para la igualdad de trato y la no discriminación; **LO 3/2007** de igualdad efectiva de mujeres y hombres; **Estatuto de los Trabajadores** art. 4.2.c y 17. *(Verificar articulado concreto.)*
- **RGPD art. 9**: prohibición general de tratar categorías especiales salvo excepción.
- AEPD: las impresiones o valoraciones subjetivas de quien selecciona **son datos personales** y el candidato tiene derecho de acceso (guía III.1, cita STS 31/10/2000). Las respuestas en entrevista **no equivalen a consentimiento** (III.3).

## Dónde puede entrar información sensible o discriminatoria

| Punto | Riesgo | Medida implementada | Riesgo residual |
|---|---|---|---|
| Formulario | Se pidan datos protegidos | No se pide ninguno; lista cerrada de campos; el servidor ignora campos extra | Bajo |
| Campo «Observaciones» | El candidato cuente salud, familia, etc. | Aviso visible «Comparte solo lo necesario…» con la lista de datos a no incluir; placeholder neutro; ≤ 1000 caracteres | Medio (no se puede impedir) |
| CV | Foto, edad, nacionalidad, estado civil, salud | Aviso para quitarlos; el sistema **no lee ni procesa** el contenido del CV | Medio (depende del candidato) |
| **Notas internas** | Registro de datos sensibles o juicios discriminatorios («embarazada», «muy mayor», «extranjero», «no contratar mujeres») | (1) Aviso permanente sobre qué no anotar; (2) placeholder neutro (se eliminó «Buen nivel de español», que podía incentivar valoraciones por origen); (3) **detector de términos** (`src/lib/sensitive.js`) que **impide guardar** la nota salvo confirmación explícita, y registra el bloqueo/confirmación en el log de auditoría **sin el texto**; (4) notas exportadas en el derecho de acceso; (5) aisladas por negocio (FK compuesta), nunca públicas, creación y borrado auditados | **Alto**: el detector es una lista de palabras con falsos positivos y negativos; reformular evita el aviso. **No es una solución**: la responsabilidad es del negocio |
| Filtros y búsqueda del panel | Filtrar por atributos protegidos | Solo estado, vacante, disponibilidad, fechas, favoritos y texto libre. **No existen** campos de sexo, edad, nacionalidad, etc. | Bajo — la búsqueda libre puede encontrar palabras en el CV/experiencia, no en el PDF |
| Automatización | Rechazo/eliminación automática | **No existe**: ningún estado cambia sin acción humana. La supresión por retención es por plazo, no por evaluación | Bajo |
| WhatsApp / contacto | — | Decisión del negocio | — |

## Quién puede leer/editar notas

Solo usuarios del propio negocio (hoy: un único usuario «owner» por negocio). La administración de Fíchame no tiene ruta de acceso. Edición: no hay edición, solo crear y eliminar (ambas auditadas: `nota_creada`, `nota_eliminada`, `nota_sensible_bloqueada`, `nota_sensible_confirmada`).

## Recomendaciones (organizativas, para el negocio)

1. Criterios de selección por escrito, ligados al puesto.
2. Formación mínima sobre preguntas prohibidas en entrevistas.
3. Revisar periódicamente las notas.
4. Atender el derecho de acceso entregando también las notas.

## Pendiente (LEGAL REVIEW REQUIRED)

- Base jurídica cuando el CV contiene categorías especiales aportadas espontáneamente.
- Si el negocio necesita datos de discapacidad para medidas de ajuste o cuotas (LGD): base art. 9.2.b y momento adecuado (no en la candidatura).
