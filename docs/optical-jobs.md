# Fichas ópticas unificadas

## Modelo y compatibilidad histórica

Occhiali 1.2.0 presenta receta, graduación y trabajo comercial como una única **Ficha óptica**. La
unificación es de experiencia y de operaciones: el modelo conserva `prescriptions` y `optical_jobs`, sus
identificadores, relaciones e historiales.

Se mantienen compatibles:

- recetas históricas sin trabajo;
- trabajos históricos sin receta;
- recetas asociadas con uno o varios trabajos;
- revisiones de graduación anteriores;
- retiros asociados a `optical_jobs`.

No se inventan relaciones ni se duplican registros al listar. Cada trabajo representa una ficha comercial;
una receta histórica sin trabajo aparece como registro histórico compatible.

## Alta unificada

La ruta principal `/fichas` ofrece un listado único y `/fichas/nueva` muestra un único formulario, en este
orden:

1. cliente, fecha, profesional y número de ficha;
2. graduaciones LEJOS y CERCA para OD y OI;
3. producto, cristal, marca, color, coloración y tratamientos;
4. condición, material, modelo y proveedor del armazón;
5. observaciones generales.

Una nueva ficha crea receta, graduaciones, trabajo y asociaciones de tratamientos en una sola transacción.
La validación ocurre antes de escribir. Si falla cualquier etapa, se revierte la operación completa.

## Campos comerciales

- `job_number`: texto opcional, manual y único cuando se informa; conserva letras y ceros iniciales.
- `product`: opcional; la interfaz ofrece Anteojos de receta, Lentes de sol, Lentes de contacto y Otro.
- `lens`: cristal libre y opcional, agregado por la migración 007.
- `brand`: marca libre y opcional, agregada por la migración 007.
- `model`: modelo libre existente; no se duplicó para incorporar marca.
- `color`: color del producto, separado de la coloración.
- `tint`: coloración de lentes, con valores reales Color pleno y Color degradé.
- `supplier`: proveedor libre dentro de Armazón.
- `frame_condition`: NEW o USED. La interfaz muestra **Propio** para el valor histórico USED sin cambiar el
  dato almacenado.
- `frame_material`: material opcional del armazón.
- `observations`: única fuente editable de observaciones generales para fichas comerciales.

Los tratamientos continúan normalizados en `treatments` y relacionados mediante
`optical_job_treatments`. El campo libre acepta comas o saltos de línea, elimina entradas vacías y evita
duplicados sin borrar el catálogo histórico.

## Graduaciones, revisiones y ADD histórico

La interfaz muestra solamente LEJOS y CERCA, con filas OD/OI y campos ESF, CIL, EJE, DIP y ALT. Un valor
vacío significa no informado; cero es un valor real. La necesidad de graduación se valida también en la
capa de persistencia según el producto, no solo en React.

Las columnas históricas de ADD no se eliminan ni se sobrescriben. Sus valores se preservan en SQLite y en
revisiones existentes, pero no forman parte de la interfaz 1.2.0.

Al editar una ficha existe un único **Guardar cambios**. Los datos comerciales y ópticos se actualizan en
una transacción. Solo se crea una revisión cuando cambia la graduación; el motivo es obligatorio en ese
caso. Las notas históricas de `prescriptions.notes` se conservan para consulta, mientras las observaciones
generales nuevas se guardan exclusivamente en `optical_jobs.observations`.

## Recetas compartidas

Una receta puede estar vinculada a varias fichas. Antes de modificar su graduación, el servicio obtiene el
total real de fichas relacionadas, muestra cuáles se verán afectadas y exige confirmación explícita. La
validación vuelve a comprobarse en persistencia para que el canal histórico de corrección no eluda la
protección.

Si una receta tiene una sola ficha, la navegación conduce a su edición integrada. Si tiene varias, la
usuaria debe elegir una; nunca se selecciona arbitrariamente. Las recetas históricas sin trabajo conservan
el flujo de corrección anterior.

## Detalle, retiros y snapshots

El detalle unificado reúne cliente, datos comerciales, armazón, observaciones, graduación, tratamientos,
historial de revisiones y retiro. Los campos opcionales sin valor permanecen vacíos.

Los retiros continúan vinculados al trabajo. Al emitir un comprobante se guarda un snapshot histórico que
incluye cristal y marca para comprobantes nuevos. Cambiar la ficha después no modifica un comprobante ya
emitido. Los comprobantes anteriores siguen siendo legibles con sus campos históricos vacíos.

## Persistencia, migración e IPC

La migración `007_optical_job_commercial_details` agrega columnas nullable para cristal y marca en
`optical_jobs` y en el snapshot de retiros. No modifica las migraciones 001–006. Los registros 1.1.0
quedan con `NULL` en los campos nuevos.

React utiliza contratos IPC específicos. No recibe `ipcRenderer`, SQL ni rutas de archivos. Las altas y
ediciones unificadas pasan por validadores compartidos y servicios transaccionales; las operaciones
históricas siguen restringidas por sus reglas de compatibilidad.

## Búsqueda y navegación

`/fichas` pagina y busca registros unificados. Las respuestas fuera de orden no reemplazan una búsqueda
más reciente, la página vuelve a un rango válido cuando cambian los resultados y las rutas históricas
redirigen o muestran el contexto compatible. Clientes, Inicio y búsqueda global enlazan a la nueva
experiencia.

## Alcance comercial

Occhiali administra información de una óptica; no diagnostica, prescribe ni calcula graduaciones. Tampoco
incluye inventario, precios, ventas, caja, facturación ni logística. Los tratamientos son características
comerciales de lentes, no procedimientos médicos.

## Pruebas relevantes

La cobertura automatizada incluye migración 006→007, compatibilidad con registros anteriores, creación y
edición transaccional, rollback, graduaciones requeridas, recetas compartidas, revisiones, tratamientos,
snapshots de retiro, búsquedas, paginación, IPC restringido y rutas históricas.
