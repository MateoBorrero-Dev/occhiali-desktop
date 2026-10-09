# Gestión de clientes

## Alcance

El módulo Clientes permite registrar, buscar, consultar, editar, archivar y reactivar personas. La
información se guarda exclusivamente en la tabla `clients` existente; no se crearon tablas ni
migraciones adicionales.

## Campos y validaciones

Nombre y apellido son obligatorios y admiten hasta 100 caracteres. DNI, teléfono, dirección, fecha
de nacimiento y observaciones son opcionales. Las cadenas vacías opcionales se guardan como `NULL`.

- El DNI acepta números, puntos, espacios y guiones, y se persiste únicamente con sus dígitos.
- La fecha debe ser un día calendario válido y no puede ser futura.
- Teléfono admite hasta 50 caracteres, dirección 300 y observaciones 2000.
- Los espacios externos se eliminan; los nombres también compactan espacios internos repetidos.
- El índice único parcial existente impide repetir un DNI informado y permite múltiples valores
  `NULL`.

Las mismas reglas se aplican en el formulario para feedback inmediato y nuevamente en el proceso
principal; la validación del renderer no se considera una frontera de seguridad.

## Listado, búsqueda y filtros

`/clientes` muestra nombre completo, DNI, teléfono, fecha de registro, estado y acceso a la ficha.
Contempla carga, error recuperable, listado, ausencia total y búsqueda sin resultados.

La búsqueda parcial cubre nombre, apellido, nombre completo, DNI y teléfono. Se ejecuta con un
debounce de 300 ms, parámetros enlazados y paginación de 25 elementos. Una función determinista de
SQLite normaliza mayúsculas y acentos sin concatenar entradas dentro del SQL. Los filtros disponibles
son Activos, Archivados y Todos.

## Alta, ficha y edición

`/clientes/nuevo` contiene el formulario de alta. El botón se deshabilita durante el guardado y una
protección adicional evita envíos simultáneos. Un alta correcta navega a `/clientes/:id`.

La ficha muestra todos los campos, fechas y estado. Incluye edición en `/clientes/:id/editar`, retorno
al listado y una sección informativa para el historial de recetas de Fase 5. Una edición conserva el
ID y omite la escritura si los valores normalizados no cambiaron.

## Archivado lógico

Archivar cambia `is_archived` y nunca elimina la fila. La acción requiere confirmación e informa que
el historial se conserva. Recetas y trabajos relacionados permanecen intactos por diseño. Los
clientes archivados pueden consultarse con el filtro correspondiente y reactivarse desde su ficha.

## IPC y manejo de errores

El flujo es React → preload → IPC específico → proceso principal → `ClientRepository` → SQLite.

- `clients:list`
- `clients:get`
- `clients:create`
- `clients:update`
- `clients:archive`
- `clients:restore`

Cada canal valida cantidad y forma de argumentos. Los resultados usan códigos seguros:
`VALIDATION`, `DUPLICATE_DOCUMENT`, `NOT_FOUND`, `CONFLICT` y `PERSISTENCE`. La interfaz recibe
mensajes en español y no detalles de SQLite, rutas locales ni trazas internas.

## Privacidad y limitaciones

No se usa `localStorage`, analítica, red ni servicios externos. Las pruebas contienen únicamente
personas ficticias y bases temporales. El historial de recetas es informativo hasta la Fase 5 y no
existe borrado permanente en esta fase.
