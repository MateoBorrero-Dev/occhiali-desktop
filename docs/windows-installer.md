# Instalador Windows

## Alcance y requisitos

Occhiali 1.1.0 es una candidata offline para Windows 10 u 11 x64. La usuaria final solo
necesita ejecutar el instalador; no necesita Node.js, npm, Git, PowerShell ni herramientas de
desarrollo. No hay versión portable, activación, telemetría, servidor ni actualizaciones
automáticas.

## Generación

Desde un checkout confiable con las dependencias fijadas:

```powershell
npm ci --ignore-scripts
npm run package:candidate
npm run verify:candidate
```

`--ignore-scripts` evita que npm intente una compilación local innecesaria de `better-sqlite3` y
reduce la ejecución de código durante la instalación. La distribución fijada ya contiene el
prebuild Windows x64; las verificaciones posteriores prueban que Electron puede cargarlo realmente.

electron-builder 26.16.1 genera el candidato aislado en `release/candidates/1.1.0`:

- `Occhiali-Setup-1.1.0-x64.exe`: instalador NSIS asistido.
- `win-unpacked/Occhiali.exe`: aplicación desempaquetada para inspección.
- `Occhiali-Setup-1.1.0-x64.exe.blockmap`: mapa auxiliar; no se usa para autoactualizar.

El destino separado impide que electron-builder reemplace instaladores históricos o sus metadatos.
El comando `npm run package` conserva el destino tradicional y se reserva para una promoción final
explícita, no para candidatos.

La versión se identifica con `appId` estable `com.occhiali.desktop`, `productName` y ejecutable
`Occhiali`. NSIS instala por usuario, no solicita elevación, permite elegir carpeta, crea accesos en
Escritorio y menú Inicio y agrega desinstalador.

## Primera ejecución y datos

El primer inicio crea las migraciones SQLite y solicita configurar una contraseña de acceso. Los
datos viven fuera del directorio de instalación:

```text
%APPDATA%\optica-desktop\
  optica.sqlite3
  security.json
  backup-settings.json
  backups\
```

La carpeta `optica-desktop` está fijada deliberadamente para conservar la identidad de datos de las
fases anteriores aunque el nombre visible sea Occhiali. El instalador no incluye una base y nunca
reemplaza una existente por una vacía.

## Actualización manual

Cerrar Occhiali y conservar un backup cifrado verificado antes de ejecutar el instalador posterior.
El nuevo instalador debe mantener `appId`, nombre interno de `userData` y migraciones incrementales.
No debe ejecutar resets ni borrar el perfil. En Fase 9 se comprobó reinstalar 0.9.0 conservando
SQLite, seguridad, configuración y backup byte a byte. La actualización real desde 0.9.0 a 1.0.0
se completó en la cuenta aislada de Windows `OcchialiQA`, instalando por usuario y sin desinstalar la
versión anterior. Se conservaron información y credenciales, se comprobó persistencia y se restauró
correctamente desde 1.0.0 un backup creado en 0.9.0.

## Desinstalación y reinstalación

El desinstalador retira programa y accesos directos, pero `deleteAppDataOnUninstall` está desactivado.
La prueba real confirmó que el perfil permanece y que la reinstalación puede leerlo. Las carpetas de
exportación o sincronización externas nunca forman parte de la desinstalación.

La eliminación definitiva es una operación separada: cerrar Occhiali, verificar un backup, ejecutar
el desinstalador y luego eliminar manualmente la carpeta exacta `%APPDATA%\optica-desktop` solo por
decisión explícita de la dueña. Nunca automatizar ese borrado desde una actualización.

## SQLite, ASAR y seguridad

Main externaliza `better-sqlite3 13.0.3`. Se incluye únicamente
`prebuilds/win32-x64.node` en `app.asar.unpacked`; las otras arquitecturas y plataformas se excluyen.
No se usa node-gyp durante el empaquetado porque este módulo distribuye un prebuild Node-API.
electron-builder 26.16.1 presenta en este entorno Windows un fallo de su recolector npm; antes de
empaquetar, un parche local idempotente y de coincidencia exacta prioriza el recolector por traversía
que mantiene el propio proveedor. El script comprueba explícitamente `app-builder-lib 26.16.1`; si
cambia esa versión o el archivo upstream, falla cerrado y exige revisión. Se aplica automáticamente
desde los scripts de empaquetado después de una instalación limpia, sin cambios manuales en
`node_modules`. El verificador exige que `better-sqlite3`, `node-addon-api` y el binario x64 estén realmente
incluidos y ejecuta el binario desde Occhiali empaquetado con Electron 44.7.0: aplica migraciones,
inserta, cierra, reabre y consulta.

El mismo escenario configura autenticación, crea y verifica un backup AES-256-GCM, ejecuta la
restauración segura y reabre el resultado. Se mantienen sandbox, `contextIsolation`, CSP, IPC
específico, scrypt y recuperación durable. ASAR fue inspeccionado para descartar SQLite, `.ocbackup`,
`.env`, contraseñas, configuración y perfiles QA.

## Firma, icono y SmartScreen

`resources/branding/occhiali-windows.ico` es el icono oficial multirresolución (16, 24, 32, 48, 64,
128 y 256 px). electron-builder lo incrusta en `Occhiali.exe`, el instalador y el desinstalador; los
accesos directos de Escritorio y menú Inicio apuntan al ejecutable. Main también lo asigna a la
ventana y conserva una copia idéntica en `resources/branding` dentro de la distribución.

El instalador continúa sin certificado Authenticode; Windows puede mostrar editor desconocido o
advertencias de SmartScreen. No se debe desactivar ninguna protección. Para una entrega firmada se
necesita un certificado confiable con clave privada fuera de Git y sello de tiempo.

Explorer, el menú Inicio y la barra de tareas pueden conservar una miniatura anterior después de
reinstalar. Esto es caché de Windows si el icono extraído directamente del instalador y de
`release/win-unpacked/Occhiali.exe` es el oficial y la copia empaquetada coincide por SHA-256. Para
refrescar la vista se puede cerrar Occhiali, desanclar y volver a anclar el acceso, recrear el acceso
directo o reiniciar Explorer/iniciar una nueva sesión. No se deben borrar datos de la aplicación ni
modificar el paquete para resolver una caché visual.

## QA realizado y pendiente

Fase 10 actualizó electron-builder de 26.4.1 a 26.16.1 para retirar vulnerabilidades altas y
críticas de la cadena de empaquetado. La auditoría de 1.0.0 informa siete ocurrencias moderadas del
mismo advisory de `sprintf-js` (`GHSA-hp3w-g68c-fv3c`) en dependencias transitivas de build; no se
incluye en el runtime de Occhiali. `npm audit fix --force` propone un cambio incompatible y una
versión anterior de electron-builder, por lo que no debe aplicarse. Debe reevaluarse cuando el
proveedor publique una corrección compatible.

Se generó e inspeccionó el instalador real. Se instaló silenciosamente en una carpeta temporal, se
comprobaron ejecutable, desinstalador y accesos directos, y la aplicación instalada abrió una ventana
real. El runtime instalado validó SQLite, migraciones, persistencia, autenticación, backup y
restauración. Después se desinstaló, se verificaron hashes del perfil, se reinstaló y se volvió a
leer la información.

El controlador gráfico detectó la ventana, pero agotó el tiempo de aprobación al capturarla. El QA
visual automatizado en las resoluciones 820×600, 1180×760, 1366×768 y 1920×1080 continúa limitado
por ese controlador. La actualización real entre 0.9.0 y 1.0.0, el login, la persistencia, la
exportación PDF y la restauración de un backup anterior fueron validados manualmente en `OcchialiQA`.

La preparación, compatibilidad y procedimiento de actualización y rollback de 1.1.0 están en
[release-1.1.0.md](release-1.1.0.md).

## Checklist de entrega

- Ejecutar todas las validaciones y `npm run verify:candidate`.
- Revisar versión, `appId`, SHA-256, firma e icono.
- Inspeccionar ASAR y el binario nativo x64.
- Probar instalación limpia con un perfil aislado.
- Probar login, clientes, recetas, fichas, búsqueda y dashboard offline.
- Crear, verificar y restaurar un backup cifrado.
- Reiniciar el ejecutable instalado y confirmar persistencia.
- Probar actualización real desde la versión anterior.
- Desinstalar/reinstalar y confirmar que `userData` permanece.
- Entregar instrucciones de backup y la limitación de SmartScreen.
