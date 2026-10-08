# Arquitectura

## Visión general

La aplicación separa los privilegios de Electron de la interfaz. `electron-vite` compila tres
contextos independientes:

1. `src/main`: ciclo de vida de la aplicación, ventana, seguridad y futura persistencia.
2. `src/preload`: API mínima disponible para la interfaz mediante `contextBridge`.
3. `src/renderer`: aplicación React sin acceso directo a Node.js ni a Electron.

`src/shared` contiene contratos sin dependencias del DOM para compartir nombres de canales y tipos.
Los directorios de componentes, features, layouts y páginas se agregarán cuando exista código real;
en Fase 1 no se crean capas vacías.

## Proceso principal

`src/main/index.ts` crea una sola `BrowserWindow`, aplica la política de contenidos, niega permisos
web, nuevas ventanas y navegaciones iniciadas por el renderer. También registra los manejadores IPC.
Los fallos de carga y de inicio se registran sin ocultarlos.

La ventana usa:

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`

En desarrollo se carga la URL local provista por electron-vite. En producción se carga únicamente el
HTML compilado y local.

## Preload

`src/preload/index.ts` expone `window.optica`, un objeto congelado con una sola operación tipada:
`getAppInfo()`. No se expone `ipcRenderer`, nombres de canales arbitrarios, acceso al sistema de
archivos ni objetos completos de Electron.

## Renderer

`src/renderer` contiene HTML, React y estilos Tailwind. El renderer solo consume la API declarada en
`vite-env.d.ts`; no importa paquetes de Node.js. La pantalla inicial es responsive y no incluye aún
formularios ni navegación funcional.

## IPC

Los canales se enumeran en `src/shared/ipc-contracts.ts`. Cada handler se registra de forma explícita
y valida sus argumentos antes de ejecutar lógica. La Fase 1 incluye solamente `app:get-info`, sin
argumentos. Los futuros contratos deberán declarar sus tipos y validadores en la capa compartida; no
se implementará un método genérico `send` o `invoke`.

## Política de seguridad de contenido

El proceso principal agrega una cabecera CSP a todas las respuestas. En producción solo permite
recursos locales y `script-src 'self'`. En desarrollo, `connect-src` habilita el servidor local y
WebSocket, y `script-src` permite el preámbulo inline que React Refresh inyecta mediante Vite. Esa
excepción no se aplica a la aplicación compilada y no se permite contenido remoto.

## SQLite

La Fase 1 no instala el motor, no abre una conexión y no crea esquema ni migraciones. El helper
`src/main/database/paths.ts` establece la futura ubicación:

```text
join(app.getPath('userData'), 'optica.sqlite3')
```

De este modo, los datos vivirán fuera de `src`, `resources`, `app.asar` y del directorio del
instalador, y podrán persistir entre actualizaciones.

En Fase 2 se evaluará e integrará `better-sqlite3` contra la versión exacta de Electron. La
compilación/reconstrucción del módulo nativo y su desempaquetado se validarán antes de elegir la
configuración del instalador.
