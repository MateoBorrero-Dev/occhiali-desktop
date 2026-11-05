# Instalador Windows

## Alcance y requisitos

Occhiali 1.2.0 está preparado para Windows 10 u 11 x64. La usuaria final solo necesita ejecutar el
instalador; no necesita Node.js, npm, Git, PowerShell ni herramientas de desarrollo. La aplicación funciona
offline y no incluye versión portable, activación, telemetría, servidor ni actualizaciones automáticas.

En esta etapa todavía no se generó el instalador 1.2.0. La creación y la prueba del candidato corresponden
a la etapa siguiente.

## Generación del candidato

Desde un checkout confiable con las dependencias fijadas:

```powershell
npm ci --ignore-scripts
npm run package:candidate
npm run verify:candidate
```

`--ignore-scripts` evita una compilación local innecesaria de `better-sqlite3`. Las verificaciones
posteriores deben demostrar que Electron puede cargar realmente el binario Windows x64.

electron-builder 26.16.1 genera el candidato aislado en `release/candidates/1.2.0`:

- `Occhiali-Setup-1.2.0-x64.exe`: instalador NSIS asistido.
- `win-unpacked/Occhiali.exe`: aplicación desempaquetada para inspección.
- `Occhiali-Setup-1.2.0-x64.exe.blockmap`: mapa auxiliar; no se usa para autoactualizar.

El destino separado evita sobrescribir instaladores históricos o sus metadatos. `npm run package` conserva
el destino tradicional y se reserva para una promoción final explícita.

La identidad permanece estable:

- `appId`: `com.occhiali.desktop`;
- `productName` y ejecutable: `Occhiali`;
- instalación NSIS por usuario, sin elevación obligatoria;
- accesos directos en Escritorio y menú Inicio;
- desinstalador sin borrado automático de datos.

## Primera ejecución y datos

El primer inicio crea la base y solicita una contraseña de acceso. Los datos viven fuera del directorio de
instalación:

```text
%APPDATA%\optica-desktop\
  optica.sqlite3
  security.json
  backup-settings.json
  backups\
```

La carpeta histórica `optica-desktop` se conserva deliberadamente. El instalador no incluye una base de
usuario y nunca debe reemplazar una existente por una vacía.

## Actualización desde 1.1.0

1. Abrir 1.1.0 y crear un respaldo cifrado y verificado.
2. Copiar ese `.ocbackup` a un dispositivo o carpeta externa y conservar la contraseña por separado.
3. Cerrar completamente Occhiali.
4. Ejecutar el instalador 1.2.0 sin desinstalar antes la versión existente.
5. Iniciar con la contraseña de acceso anterior.
6. Comprobar clientes, fichas, graduaciones, retiros, configuración y respaldos.
7. Crear y verificar un nuevo respaldo desde 1.2.0.

El `appId`, el directorio de datos y la instalación por usuario no cambian. Al primer inicio, 1.2.0 aplica la
migración 007 una sola vez: agrega campos opcionales para cristal y marca en fichas y snapshots de retiros.
Los registros 1.1.0 conservan sus datos y reciben valores nulos en los campos nuevos.

> **Advertencia de downgrade:** una vez aplicada la migración 007, la base ya no puede abrirse directamente
> con 1.1.0. Para regresar a 1.1.0 se necesita restaurar, desde esa versión, un respaldo compatible creado
> antes de la migración. No se debe forzar el inicio de 1.1.0 sobre una base migrada ni editar SQLite a mano.

La compatibilidad de base y `.ocbackup` 1.1.0→1.2.0 fue probada con fixtures auténticos y perfiles
temporales. La actualización mediante instalador todavía debe validarse con el candidato real.

## Desinstalación y reinstalación

`deleteAppDataOnUninstall` permanece desactivado. El desinstalador retira programa y accesos directos, pero
conserva el perfil. Las carpetas externas y los PDF exportados no forman parte de la desinstalación.

La eliminación definitiva de datos es una operación manual y separada. Solo debe realizarse por decisión
explícita, después de cerrar Occhiali y verificar un respaldo. Ninguna actualización debe borrar
`%APPDATA%\optica-desktop`.

## SQLite, ASAR y seguridad

Main externaliza `better-sqlite3 13.0.3`. El paquete debe incluir únicamente el prebuild Windows x64
necesario en `app.asar.unpacked`. El parche acotado del recolector comprueba explícitamente
`app-builder-lib 26.16.1`; si cambia la versión esperada o el archivo upstream, falla cerrado y exige
revisión.

El verificador debe ejecutar el binario empaquetado con Electron 44.10.2 y comprobar migraciones, escritura,
lectura y reapertura de SQLite. También debe comprobar autenticación, creación y verificación de un respaldo
AES-256-GCM, restauración segura y generación de PDF. Se mantienen sandbox, `contextIsolation`, CSP, IPC
específico y `nodeIntegration` deshabilitado.

ASAR debe inspeccionarse para descartar bases SQLite, `.ocbackup`, `.env`, contraseñas, configuraciones y
perfiles QA.

## Firma, icono y SmartScreen

`resources/branding/occhiali-windows.ico` es el icono oficial multirresolución. electron-builder lo utiliza
en ejecutable, instalador y desinstalador; los accesos directos apuntan al ejecutable.

El instalador no tiene firma Authenticode. Windows puede mostrar editor desconocido o advertencias de
SmartScreen. No se debe desactivar ninguna protección. Una entrega firmada requiere un certificado
confiable y una clave privada fuera de Git.

Explorer, menú Inicio y barra de tareas pueden conservar un icono anterior por caché. Si los recursos
extraídos del instalador y ejecutable son correctos, se puede cerrar Occhiali, desanclar y volver a anclar el
acceso o reiniciar Explorer. Nunca se deben borrar datos para resolver una caché visual.

## Evidencia histórica que se conserva

Las pruebas reales de actualización 0.9.0→1.0.0 y 1.0.0→1.1.0, junto con sus hashes y procedimientos,
siguen documentadas en [release-1.0.0.md](release-1.0.0.md) y
[release-1.1.0.md](release-1.1.0.md). Esos resultados son históricos y no sustituyen el QA del candidato
1.2.0.

## Checklist del candidato 1.2.0

- Ejecutar las validaciones y `npm run verify:candidate`.
- Revisar versión 1.2.0, `appId`, SHA-256, firma e icono.
- Inspeccionar ASAR y el binario nativo x64.
- Probar instalación limpia con un perfil temporal.
- Probar actualización real desde 1.1.0 sin desinstalar.
- Confirmar contraseña, datos, configuración y respaldos anteriores.
- Probar fichas unificadas, retiros, PDF y WhatsApp asistido.
- Crear, verificar y restaurar un respaldo cifrado.
- Reiniciar el ejecutable instalado y confirmar persistencia.
- Probar desinstalación/reinstalación y conservación de `userData`.
- Documentar el SHA-256 final y la limitación de SmartScreen.

Ver también [release-1.2.0.md](release-1.2.0.md).
