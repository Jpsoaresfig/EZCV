# 05 — IA en la selección: riesgos y condiciones

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA.**
> **Estado actual: NO hay ninguna funcionalidad de IA, ranking, scoring ni filtrado automático en Fíchame** (verificado en el código el 2026-10-06; no hay dependencias de modelos ni llamadas a APIs de IA). Existe una nota interna de producto («IA de matching adiada») que confirma que se decidió no implementarla.

## Regla del proyecto

Cualquier funcionalidad de IA aplicada a candidatos queda **desactivada por defecto** y **bloqueada** hasta superar: análisis jurídico específico, EIPD, revisión de [01](01-analisis-agencia-colocacion.md) (el *matching* acerca a Fíchame a la intermediación) y actualización de la información a candidatos.

## Prohibiciones de diseño (aunque la IA se active en el futuro)

La IA solo podría ser **apoyo** al recruiter, nunca:

- tomar la decisión final, rechazar, contratar o eliminar automáticamente;
- generar puntuaciones ocultas o rankings no explicables;
- inferir salud, religión, orientación sexual, origen, nacionalidad, edad, estado emocional, personalidad o inteligencia;
- analizar fotografías, voz o vídeo; reconocimiento facial;
- usar datos de un negocio para otro, ni datos de candidatos para entrenar modelos.

## Marco aplicable

- **Art. 22 RGPD**: derecho a no ser objeto de decisiones basadas únicamente en tratamiento automatizado, incluida la elaboración de perfiles, que produzcan efectos jurídicos o afecten significativamente de modo similar (ser descartado de un proceso de selección es el ejemplo que usa la AEPD, guía relaciones laborales, III.5). Excepción del art. 22.2.a interpretada **restrictivamente**.
- **Arts. 13.2.f y 15.1.h RGPD**: informar de la existencia de decisiones automatizadas, la lógica aplicada y las consecuencias.
- **Elaboración de perfiles (art. 4.4)**: aunque «la IA solo recomiende», ordenar o puntuar candidatos es perfilado; no elimina las obligaciones de transparencia ni de evaluación de impacto.
- **Intervención humana significativa**: persona autorizada y competente, que pueda cambiar la decisión, y no un gesto simbólico (AEPD III.5; Directrices WP251 rev.01 del GT29, ratificadas por el EDPB).
- **Contestación**: cauce para que el candidato exprese su punto de vista e impugne; explicación de la decisión (considerando 71).
- **EIPD (art. 35.3.a RGPD)**: la AEPD indica que en el diseño de algoritmos de selección debe realizarse una evaluación de impacto.
- **Nota de la AEPD (23-09-2026)** sobre garantías al usar IA en el análisis de currículums: protección de datos desde el diseño, evaluación de riesgos e impacto, transparencia clara sobre el papel de la herramienta, intervención humana real que valore críticamente el resultado, y medidas técnicas y organizativas adecuadas.
- **Reglamento (UE) 2024/1689 de Inteligencia Artificial**:
  - Anexo III, punto 4.a: sistemas destinados a la contratación o selección (anuncios dirigidos, análisis y filtrado de solicitudes, evaluación de candidatos) → **alto riesgo**, con obligaciones para proveedores y responsables del despliegue (gestión de riesgos, gobernanza de datos, documentación técnica, registros, transparencia, supervisión humana, exactitud y robustez; información a trabajadores).
  - Art. 5.1.f: **prohibido** el reconocimiento de emociones en el lugar de trabajo (aplicable desde el 2-2-2025).
  - Fechas: según fuentes secundarias, el «Digital Omnibus» sobre IA (en vigor desde julio de 2026) aplaza las obligaciones del Anexo III al **2-12-2027**. **Verificar en el DOUE** antes de planificar.
- **Discriminación**: Ley 3/2023 (arts. 5, 40.2.c, 45), Ley 15/2022 — un sistema que produzca resultados discriminatorios debe modificarse (AEPD III.5, ejemplo de contratación desproporcionada de hombres).

## Checklist previa a cualquier piloto de IA (todos obligatorios)

1. Dictamen jurídico (RGPD, AI Act, Ley 3/2023 / agencia de colocación).
2. EIPD con participación del DPD si lo hubiera.
3. Proveedor de modelo con DPA, región UE, sin uso de datos para entrenamiento.
4. Función opcional por negocio, **desactivada por defecto**, sin efecto en el orden ni en la visibilidad de candidaturas sin acción humana.
5. Información previa al candidato en el formulario y en `/r/:slug/privacidad`.
6. Registro de cada sugerencia y de la decisión humana; canal de impugnación.
7. Pruebas de sesgo antes y durante el uso.
