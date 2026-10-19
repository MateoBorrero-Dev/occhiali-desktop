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

Antes de montar las rutas, `SecurityGate` consulta a Main y presenta configuración inicial o login.
La sesión se conserva solo en memoria y el renderer notifica actividad mediante un canal explícito;
Main vuelve a comprobar la sesión en cada operación sensible.

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

`AppLayout` incorpora `GlobalSearch` sobre el contenido principal. El componente espera dos
caracteres, aplica debounce de 250 ms, descarta respuestas asíncronas obsoletas y agrupa resultados
limitados. `Ctrl+K` enfoca el campo dentro de la aplicación y `Escape` cierra los resultados, sin
registrar atajos globales del sistema operativo.

La paleta usa verde petróleo como color de marca, fondos neutros cálidos, tipografía del sistema e
iconos de Lucide. La pantalla de acceso carga el logo oscuro completo sobre fondo claro; el sidebar
usa la marca blanca de anteojos sobre su cápsula turquesa para conservar legibilidad a tamaño
reducido. Los estilos incluyen foco visible, estados activos, soporte de movimiento reducido y una
anchura mínima alineada con la ventana de Electron para evitar una interfaz inutilizable.

## IPC

Los canales se enumeran en `src/shared/ipc-contracts.ts`. Cada handler se registra de forma explícita
y valida tipos, cantidad de argumentos, longitudes, fechas, DNI y filtros en runtime. Los canales de
clientes son `clients:list`, `clients:get`, `clients:create`, `clients:update`, `clients:archive` y
`clients:restore`. Recetas usa `prescriptions:list`, `prescriptions:list-by-client`,
`prescriptions:get`, `prescriptions:create`, `prescriptions:correct` y `prescriptions:revisions`.
No existe un método genérico `send`, `invoke` ni SQL accesible desde React.

Seguridad agrega canales explícitos `security:*` para estado, alta, login, logout, actividad, cambio
de contraseña e inactividad. Backup agrega `backup:*` para estado, configuración, selección mediante
diálogo nativo, creación, historial, verificación y restauración. Todos validan la cantidad de
argumentos en Main. Los canales de datos y mantenimiento requieren la sesión local activa.

Fichas usa `optical-jobs:list`, `optical-jobs:list-by-client`, `optical-jobs:get`,
`optical-jobs:list-by-prescription`, `optical-jobs:create` y `optical-jobs:update`; el catálogo usa
`treatments:list`. Dashboard y búsqueda usan `dashboard:get-summary` y `search:global`. Main valida de
nuevo cliente, receta, enumeraciones, textos y tratamientos antes de ejecutar repositorios.

Comprobantes usa cinco canales explícitos `delivery-receipts:*` para consultar por ID o ficha,
crear, agregar un evento histórico y exportar PDF. Todos requieren sesión autorizada. React no
recibe acceso a archivos: Main abre el diálogo nativo y responde solo cancelación y nombre final.

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

Antes de que Electron quede listo, Main fija `userData` en la carpeta histórica
`app.getPath('appData')/optica-desktop`. Así el nombre visible `Occhiali` no cambia la identidad de
almacenamiento utilizada en fases anteriores. `OPTICA_QA_USER_DATA_PATH` solo permite sustituirla
por una ruta absoluta durante QA aislado.

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

`DeliveryReceiptRepository` reserva la numeración, captura el snapshot y crea el comprobante en una
misma transacción. La unicidad de `optical_job_id` refuerza en SQLite la prevención de duplicados.
Las aclaraciones y anulaciones son eventos append-only. El PDF se genera en Main con una ventana
oculta aislada, HTML escapado y `webContents.printToPDF`; sus detalles están en
[delivery-receipts.md](delivery-receipts.md).

`QueryRepository` contiene exclusivamente lecturas: una consulta agregada para el dashboard y tres
consultas limitadas para la búsqueda agrupada. No comparte una conexión ni SQL con React.

`src/main/backup` implementa backup SQLite consistente, cifrado autenticado, retención, exportación,
historial operativo atómico y recuperación de una restauración interrumpida. El historial permanece
fuera de SQLite para evitar dependencias circulares y sus fallos no invalidan una copia. La estructura
relacional e índices están en [database.md](database.md); los límites de seguridad y recuperación
están en [security.md](security.md) y [backup-restore.md](backup-restore.md).

## Distribución Windows

electron-builder empaqueta `out/main`, `out/preload` y `out/renderer` en `app.asar`. Main mantiene
`better-sqlite3` como dependencia externa y su binario Node-API `win32-x64.node` queda en
`app.asar.unpacked`; el resto de los prebuilds se excluye. NSIS genera un instalador asistido x64 por
usuario con accesos directos y desinstalador. Ningún archivo de negocio se incorpora al paquete.

El `.ico` oficial se asigna al ejecutable y a NSIS desde `package.json`. Además se copia como recurso
externo y Main lo resuelve mediante `process.resourcesPath` para la ventana empaquetada; en desarrollo
usa la ruta del repositorio. El verificador compara por SHA-256 la copia empaquetada con el original.

`src/main/package-qa.ts` es un punto de entrada inerte salvo que se ejecute explícitamente con el
runtime empaquetado, una variable de QA y una ruta bajo el directorio temporal. Valida sin mocks
migraciones, escritura, reapertura, seguridad, backup cifrado y restauración usando los mismos
módulos compilados. El proceso normal nunca lo invoca.

La configuración completa y el procedimiento de entrega están en
[windows-installer.md](windows-installer.md).
