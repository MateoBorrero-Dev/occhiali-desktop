# Recetas ópticas

## Alcance

El módulo registra prescripciones proporcionadas por profesionales o clientes. No interpreta
graduaciones, calcula diagnósticos ni recomienda tratamientos. Funciona completamente offline y
vincula cada receta con un cliente existente, sin duplicarlo.

## Campos y convenciones

El encabezado conserva ID estable, cliente, fecha de prescripción, profesional opcional, adición
opcional e independiente para OD y OI, observaciones opcionales y fechas de creación/actualización.
La fecha de prescripción es independiente de la fecha de carga.

Cada receta admite como máximo una fila por combinación:

- `FAR` / Lejos — `OD` (ojo derecho) y `OI` (ojo izquierdo).
- `NEAR` / Cerca — `OD` y `OI`.

Cada fila puede informar ESF, CIL, EJE, DIP y ALT parcialmente. ADD se carga una sola vez por ojo,
fuera de las filas Lejos/Cerca: ambos pueden quedar vacíos, puede informarse solo OD u OI y pueden
tener valores distintos. Una receta requiere al menos una graduación o una adición informada. El eje,
cuando se informa, es un entero entre 0 y 180. No se exige eje a partir del cilindro porque no se
confirmó una regla de negocio. Tampoco se imponen límites clínicos arbitrarios ni se realizan cálculos
entre Lejos, Cerca y ADD.

## Precisión decimal

ESF, CIL, DIP, ALT y ADD aceptan coma o punto y hasta dos decimales no ambiguos. El validador convierte la
entrada a una cadena canónica y el repositorio la almacena como centésimas enteras: `+1,25` → `125`,
`-2.50` → `-250`, `0,00` → `0`. Un campo vacío es `NULL`, nunca cero. Al leer se vuelve a una cadena
exacta de dos decimales, sin usar `REAL` ni redondeo binario.

## Flujos

- Desde `/clientes/:id`, “Nueva receta” abre el formulario con cliente fijo.
- Desde `/recetas`, el alta general permite seleccionar un cliente activo.
- El historial de la ficha pagina recetas en orden cronológico descendente.
- El listado general busca por nombre/apellido, filtra fechas y enlaza al cliente y al detalle.
- El detalle muestra valores actuales, observaciones, fechas y revisiones anteriores.
- El detalle lista y pagina las fichas ópticas que referencian la receta.
- Un cliente archivado conserva su historial, pero debe reactivarse para nuevas recetas.

El formulario presenta ADD por ojo y dos paneles claramente separados: **Lejos** y **Cerca**, cada uno
con filas OD/OI y columnas ESF, CIL, EJE, DIP y ALT alineadas. Sigue el orden natural de tabulación.
En ventanas estrechas, cada tabla gestiona su propio desplazamiento horizontal sin ensanchar la
página. Solo se persisten las filas con algún valor. Los errores conservan lo escrito y el botón
deshabilitado evita doble envío.

## Correcciones y trazabilidad

Una nueva prescripción se registra como una receta distinta. Una corrección administrativa usa la
misma receta e ID, exige motivo y guarda primero una instantánea relacional del estado anterior —incluidas
las adiciones OD/OI— en
`prescription_revisions` y `prescription_revision_values`. La revisión, actualización y sustitución
de graduaciones se ejecutan en una transacción. No hay borrado permanente ni sobrescritura silenciosa.

## IPC, integridad y privacidad

React solo usa los seis canales `prescriptions:*` expuestos por el preload. Main vuelve a validar
payloads e identificadores y ejecuta SQL parametrizado. Las claves foráneas usan `RESTRICT`; no se
guardan datos en `localStorage`, logs o servicios externos. Las recetas de QA son ficticias y usan
bases temporales.

## Pruebas

La cobertura combina SQLite real, handlers IPC y renderer. Incluye migraciones históricas y 004→005
con datos, ADD vacío/cero/un ojo/ambos ojos/valores distintos, coma/punto decimal, cuatro
combinaciones, búsqueda, fechas, paginación, reinicio,
archivado, rollback, integridad, correcciones, revisiones, ID estable, no-op y aislamiento entre
recetas. Las pruebas de interfaz cubren estados, navegación, formulario, validación, doble envío,
detalle y bloqueo de clientes archivados.

## Limitaciones conocidas

La ficha física no aclara si DIP y ALT son mediciones monoculares, binoculares o compartidas. Se
conservan por fila sin inferencia clínica hasta confirmar el criterio. La estrategia integral de
backup y restauración está documentada en [backup-restore.md](backup-restore.md).

Una ficha de trabajo puede referenciar una receta existente del mismo cliente. La relación apunta al
registro actual de la receta: una corrección posterior se refleja al abrirla y no modifica la ficha
ni guarda una copia congelada de las graduaciones.

La búsqueda global localiza recetas por los datos identificatorios del cliente y muestra solamente
fecha y persona, sin exponer graduaciones en el panel de resultados.
