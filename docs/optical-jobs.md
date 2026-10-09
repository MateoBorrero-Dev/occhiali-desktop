# Fichas de trabajo y pedidos ópticos

## Contexto comercial

Occhiali es una óptica comercial, no un consultorio oftalmológico. Una ficha registra las
características del producto o pedido que antes se anotaban en papel. No diagnostica, prescribe,
calcula graduaciones ni incorpora precios, ventas, stock, caja, facturación o logística.

Los elementos del catálogo se muestran como **Tratamientos y acabados de lentes**. Son recubrimientos,
acabados o modificaciones comerciales de los lentes —por ejemplo antirrayas, antirreflejo o pulido—,
no tratamientos médicos ni procedimientos clínicos. Pueden ser realizados por terceros.

## Cliente, receta y ficha

- El cliente representa a la persona.
- La receta conserva una prescripción emitida por un profesional.
- La ficha describe un producto o pedido de la óptica.

Toda ficha pertenece a un cliente. Puede referenciar una receta, pero es opcional y debe pertenecer
a la misma persona. Lentes de sol pueden guardarse sin receta; nunca se crea una receta ficticia. La
relación apunta al estado actual de la receta y no congela sus graduaciones.

## Campos

- Número de ficha opcional y textual; conserva ceros iniciales, admite letras y es único cuando se
  informa.
- Producto libre con sugerencias para “Anteojos recetados” y “Lentes de sol”.
- Receta opcional.
- Condición del armazón: nuevo, usado o sin especificar.
- Material: zilo, metal o sin especificar.
- Modelo libre opcional.
- Coloración: color pleno, degradé o sin especificar.
- Uno, varios o ningún tratamiento/acabado del catálogo SQLite.
- Observaciones opcionales.

No se exige armazón ni receta para todos los productos y no se inventan marcas, tonos o
incompatibilidades.

## Flujos de interfaz

`/trabajos` pagina y busca por número, cliente, producto y modelo. El alta general busca clientes de
a diez resultados mediante el repositorio existente, sin cargar miles. Desde `/clientes/:id`, el
cliente queda preseleccionado. Al seleccionarlo se consultan solamente sus recetas, ordenadas desde
la más reciente.

El detalle enlaza cliente y receta, muestra campos vacíos como “Sin especificar” y diferencia los
tratamientos comerciales. La edición conserva ID y cliente. La ficha del cliente muestra su
historial y permite consultar registros aun cuando está archivado; solo se bloquean nuevas altas.

## Persistencia y validaciones

Fase 6 reutiliza `optical_jobs`, `treatments` y `optical_job_treatments`; no agrega migraciones. Main
valida runtime, longitudes, enumeraciones, IDs, unicidad, estado del cliente, pertenencia de receta y
existencia/no duplicación de tratamientos. Las consultas son parametrizadas.

Crear o editar una ficha y sus asociaciones es una única transacción. La edición sin cambios no
escribe ni cambia `updated_at`. No existe borrado permanente.

## IPC y privacidad

El preload expone únicamente cinco operaciones `optical-jobs:*` y `treatments:list`. React no recibe
`ipcRenderer`, SQL o acceso al sistema de archivos. Los errores discriminados no exponen rutas ni
detalles internos. La aplicación funciona offline, sin telemetría ni datos en `localStorage`.

## Pruebas

SQLite real cubre altas con/sin receta, productos, ceros iniciales, armazones, coloración,
tratamientos, búsquedas, paginación, edición, no-op, rollback, archivado, reapertura e integridad.
Las pruebas IPC verifican contratos y errores seguros; Testing Library cubre búsquedas, formularios,
recetas compatibles, selección múltiple, detalle, edición, doble envío y clientes archivados.

## Limitaciones y ampliaciones futuras

No se generan números consecutivos ni se gestionan marcas, inventario, precios, ventas, proveedores
o estados logísticos. Esas ampliaciones deben conservar la separación entre producto comercial,
persona y receta óptica. Fase 7 permanece pendiente.
