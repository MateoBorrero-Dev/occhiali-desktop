# Arquitectura

## Visión general

La aplicación separa los privilegios de Electron de la interfaz. `electron-vite` compila tres
contextos independientes:

1. `src/main`: ciclo de vida de la aplicación, ventana, seguridad y persistencia SQLite.
2. `src/preload`: API mínima disponible para la interfaz mediante `contextBridge`.
3. `src/renderer`: aplicación React sin acceso directo a Node.js ni a Electron.

`src/shared` contiene contratos sin dependencias del DOM para compartir nombres de canales y tipos.
El renderer separa páginas, layout, navegación y componentes reutilizables; esas capas contienen
solo implementaciones que ya utiliza la interfaz.

## Proceso principal

`src/main/index.ts` crea una sola `BrowserWindow` con tamaño inicial de 1180 × 760 píxeles y mínimo
de 820 × 600, aplica la política de contenidos, niega permisos web, nuevas ventanas y navegaciones
iniciadas por el renderer. También registra los manejadores IPC. Los fallos de carga y de inicio se
registran sin ocultarlos.

La ventana usa:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

En desarrollo se carga la URL local provista por electron-vite. En producción se carga únicamente el
HTML compilado y local.

## Preload

`src/preload/index.ts` expone `window.optica`, un objeto congelado. Incluye `getAppInfo()` y una API
de clientes con operaciones concretas para listar, obtener, crear, actualizar, archivar y reactivar,
y una API de recetas para listar, obtener, crear, corregir y consultar revisiones. También expone
operaciones específicas de fichas de trabajo y una lectura acotada del catálogo de tratamientos.
No se expone `ipcRenderer`, nombres de canales arbitrarios, acceso al sistema de archivos ni objetos
completos de Electron.

## Renderer

`src/renderer` contiene HTML, React y estilos Tailwind. El renderer solo consume la API declarada en
`vite-env.d.ts`; no importa paquetes de Node.js.

`HashRouter` resuelve la navegación dentro de un único documento local, por lo que las rutas
funcionan tanto en el servidor de desarrollo como cuando Electron carga `index.html` mediante
`file://`. `AppLayout` mantiene el sidebar y su estado activo mientras el contenido de cada módulo
se renderiza mediante `Outlet` en un área con scroll independiente.

Las rutas actuales son:

- `/`: Inicio.
- `/clientes`: Clientes.
- `/clientes/nuevo`: alta de cliente.
- `/clientes/:id`: ficha individual.
- `/clientes/:id/editar`: edición.
- `/clientes/:id/recetas/nueva`: alta con cliente preseleccionado.
- `/recetas`: Recetas.
- `/recetas/nueva`: alta general de receta.
- `/recetas/:id`: detalle y revisiones.
- `/recetas/:id/corregir`: corrección administrativa trazable.
- `/trabajos`: Trabajos.
- `/trabajos/nuevo`: alta general de ficha.
- `/trabajos/:id`: detalle de ficha.
- `/trabajos/:id/editar`: edición de ficha.
- `/clientes/:id/trabajos/nuevo`: alta con cliente preseleccionado.
- `/configuracion`: Configuración.
- cualquier otra ruta: pantalla de recurso no encontrado con retorno seguro al inicio.

Los bloques visuales reutilizables se agrupan por responsabilidad: `Button` y `Card` en `ui`,
`PageHeader`, `EmptyState` y `ModulePlaceholder` en `common`, y `Sidebar` en `navigation`. El módulo
de clientes agrega `ClientForm`, `ClientStatusBadge` y `ArchiveClientDialog`. Recetas agrega
`PrescriptionForm`, `PrescriptionValuesTable` y `ClientPrescriptionHistory`. Las fichas reutilizan
`OpticalJobForm` y `ClientOpticalJobHistory` para alta, edición e historial.

La paleta usa verde petróleo como color de marca, fondos neutros cálidos, tipografía del sistema e
iconos de Lucide. Los estilos incluyen foco visible, estados activos, soporte de movimiento reducido
y una anchura mínima alineada con la ventana de Electron para evitar una interfaz inutilizable.

## IPC

Los canales se enumeran en `src/shared/ipc-contracts.ts`. Cada handler se registra de forma explícita
y valida tipos, cantidad de argumentos, longitudes, fechas, DNI y filtros en runtime. Los canales de
clientes son `clients:list`, `clients:get`, `clients:create`, `clients:update`, `clients:archive` y
`clients:restore`. Recetas usa `prescriptions:list`, `prescriptions:list-by-client`,
`prescriptions:get`, `prescriptions:create`, `prescriptions:correct` y `prescriptions:revisions`.
No existe un método genérico `send`, `invoke` ni SQL accesible desde React.

Fichas usa `optical-jobs:list`, `optical-jobs:list-by-client`, `optical-jobs:get`,
`optical-jobs:create` y `optical-jobs:update`; el catálogo usa `treatments:list`. Main valida de
nuevo cliente, receta, enumeraciones, textos y tratamientos antes de ejecutar repositorios.

Los handlers convierten errores internos en resultados discriminados con códigos de validación,
DNI duplicado, registro inexistente, conflicto o persistencia. Las respuestas nunca exponen rutas
locales, SQL ni datos privados en logs.

## Política de seguridad de contenido

El proceso principal agrega una cabecera CSP a todas las respuestas. En producción solo permite
recursos locales y `script-src 'self'`. En desarrollo, `connect-src` habilita el servidor local y
WebSocket, y `script-src` permite el preámbulo inline que React Refresh inyecta mediante Vite. Esa
excepción no se aplica a la aplicación compilada y no se permite contenido remoto.

## SQLite

`better-sqlite3` se carga exclusivamente en el proceso principal. Al iniciar, `ApplicationDatabase`
abre la conexión, activa claves foráneas y WAL, aplica migraciones versionadas y construye
repositorios tipados. Un fallo de apertura o migración impide abrir la ventana y muestra un mensaje
genérico, sin borrar ni reemplazar el archivo existente.

`src/main/database/paths.ts` establece la ubicación:

```text
join(app.getPath('userData'), 'optica.sqlite3')
```

De este modo, los datos vivirán fuera de `src`, `resources`, `app.asar` y del directorio del
instalador, y podrán persistir entre actualizaciones.

La conexión se cierra durante `before-quit`. React no recibe la conexión ni una API SQL. El
repositorio de clientes reutiliza la tabla e índices de la migración inicial, normaliza las entradas,
pagina los resultados y ejecuta búsquedas parametrizadas mediante una función local determinista que
ignora mayúsculas y acentos.

El repositorio de recetas crea encabezado y graduaciones en una transacción, pagina historiales,
filtra por cliente y fechas, y corrige con ID estable. Antes de una corrección guarda una
instantánea relacional del encabezado y valores anteriores; la revisión, actualización y reemplazo
de valores forman una sola transacción.

El repositorio de fichas mantiene cliente e ID estables, valida la receta del mismo cliente y
reemplaza las asociaciones de tratamientos dentro de la misma transacción que la actualización.

La estructura relacional, migraciones, índices y estrategia de backup futura están documentados en
[database.md](database.md).
