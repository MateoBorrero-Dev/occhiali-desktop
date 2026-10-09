# Dashboard y búsqueda integrada

## Alcance

Fase 7 mejora la consulta y navegación sin agregar ventas, precios, caja, stock ni información
clínica. Antes de esta fase, Inicio contenía mensajes estáticos, no había búsqueda transversal, el
selector de recetas de una ficha se detenía en 100 registros y faltaba el recorrido receta → fichas.
Los buscadores, filtros y paginaciones existentes ya eran seguros y se conservaron.

## Dashboard

Inicio consulta `dashboard:get-summary` cada vez que se monta. `QueryRepository.dashboard()` ejecuta
una única sentencia con tres subconsultas agregadas y devuelve:

- clientes activos;
- total histórico de recetas;
- total histórico de fichas ópticas.

Un cliente archivado deja de integrar el primer conteo, pero sus recetas y fichas permanecen en los
totales históricos. La interfaz muestra cero para una base vacía, carga y error recuperable. Los
accesos rápidos navegan a nuevo cliente, clientes, nueva receta y nueva ficha.

## Búsqueda global

El buscador está en `AppLayout`. Espera al menos dos caracteres, usa debounce de 250 ms y solicita
como máximo cinco resultados por grupo:

- clientes por nombre, apellido, DNI o teléfono;
- recetas por los datos del cliente;
- fichas por cliente, número o producto.

Los resultados abren la ruta específica. Las recetas no muestran graduaciones y las fichas no
exponen observaciones. `fold_text` permite buscar sin distinguir acentos o mayúsculas; `escapedLike`
trata `%`, `_` y `\` como texto, y todas las entradas se enlazan como parámetros. Un contador de
secuencia impide que una respuesta antigua reemplace una búsqueda posterior.

`Ctrl+K` enfoca el campo mientras Occhiali está activa. `Escape` cierra los resultados. No se usa un
atajo global de Windows ni privilegios adicionales.

## Filtros, paginación y relaciones

Clientes conserva estado Activos/Archivados/Todos; recetas conserva búsqueda y rango de fechas;
fichas conserva búsqueda por número, cliente, producto y modelo. Cambiar un filtro reinicia la
primera página. Los listados muestran carga, error, vacío y limpieza explícita.

Cliente enlaza sus recetas y fichas; ficha enlaza cliente y receta; receta enlaza cliente y ahora
pagina las fichas que la utilizan mediante `optical-jobs:list-by-prescription`. La clave foránea
compuesta sigue impidiendo cruzar datos de clientes diferentes.

El selector de recetas consulta 50 registros por vez. La carga incremental conserva la validación
en Main y permite seleccionar historiales mayores a 100 sin cargar miles de filas.

## IPC y seguridad

Canales nuevos:

- `dashboard:get-summary`, sin argumentos;
- `search:global`, con consulta y límite validados;
- `optical-jobs:list-by-prescription`, con ID y paginación validados.

Preload expone objetos congelados y específicos. No expone `ipcRenderer`, SQL, rutas, red ni sistema
de archivos. Los errores internos se convierten en mensajes genéricos. Las consultas de dashboard y
búsqueda son de solo lectura.

## Rendimiento e índices

Dashboard usa conteos SQLite y nunca carga tablas en memoria. La búsqueda limita cada grupo y los
selectores/listados se paginan. No se agregó una migración: los índices existentes cubren archivado,
relaciones y orden cronológico. La coincidencia parcial global usa comodín inicial y normalización,
por lo que un índice B-tree de texto convencional no evitaría el recorrido; para el volumen esperado
de una óptica pequeña, una migración adicional no está justificada. Si el volumen real creciera,
deberá medirse antes de evaluar FTS.

## Pruebas y limitaciones

SQLite real cubre dashboard vacío/con datos, archivado, historiales, nombre, apellido, acentos, DNI,
teléfono, número, producto, agrupación, límites, inyección, ausencia de resultados, paginación por
receta y preservación de registros. IPC valida argumentos y oculta errores. Renderer cubre conteos,
accesos, grupos, navegación, `Ctrl+K`, `Escape`, limpieza, estados y más de 100 recetas.

El controlador gráfico de Windows devolvió inventario vacío en la validación disponible. El flujo
funcional completo y la revisión visual quedan pendientes para ejecución manual con un perfil y una
base temporal, sin usar datos habituales.
