# Preparación de Occhiali 1.1.0

## Alcance

Occhiali 1.1.0 incorpora alertas e historial de respaldos, ejecución automática con credencial
protegida por Windows, transferencias externas verificadas, reintentos persistentes, retención
conservadora y recuperación ante desastres independiente de DPAPI. No agrega servicios de nube,
telemetría ni actualización automática.

La identidad de distribución permanece estable:

- `appId`: `com.occhiali.desktop`;
- producto y ejecutable: `Occhiali`;
- instalador NSIS x64 por usuario;
- perfil: `%APPDATA%\optica-desktop`;
- base: `optica.sqlite3`;
- migraciones inmutables: 001–006;
- `deleteAppDataOnUninstall`: desactivado.

## Compatibilidad con 1.0.0

No hay una migración SQLite nueva. La ruta de datos y `SecurityManager` son idénticos a 1.0.0. La
configuración anterior se completa con valores seguros: conserva carpeta externa, datos del último
respaldo, hora y retención, pero el modo automático queda desactivado hasta una decisión explícita.
Los archivos nuevos `backup-history.json` y `backup-credential.json` no forman parte de SQLite y una
versión anterior los ignora.

La regresión automatizada abre un perfil representativo de 1.0.0 con cliente, receta, ficha,
tratamiento, comprobante, acceso local, configuración y `.ocbackup`. Comprueba integridad, login,
restauración y ausencia de activación automática durante la actualización.

## Candidato aislado

El candidato se genera fuera del directorio histórico:

```text
release/candidates/1.1.0/
```

`npm run package:candidate` usa ese destino y `npm run verify:candidate` inspecciona el ASAR, icono,
binario nativo Windows x64, exclusiones sensibles y runtime empaquetado. No sustituye instaladores
0.9.0 o 1.0.0 ubicados fuera de esa carpeta.

El instalador 1.0.0 aprobado para actualización y rollback debe tener SHA-256:

```text
50561014DC50B287B983381A5702D979267AFFEDF88F9441C2EF43BDE2A06281
```

El candidato verificado el 20 de octubre de 2026 es:

```text
release/candidates/1.1.0/Occhiali-Setup-1.1.0-x64.exe
SHA-256: E4EFE6901336D205FF2AFC0527DB2C38249BD65090CE9ED6687B525A513773A4
```

Permanece sin firma Authenticode y todavía no constituye una publicación.

## Validaciones de release

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test -- --maxWorkers=2
npm run test:electron
npm run build
npm audit
git diff --check
npm run package:candidate
npm run verify:candidate
Get-FileHash -Algorithm SHA256 -LiteralPath `
  'release/candidates/1.1.0/Occhiali-Setup-1.1.0-x64.exe'
```

Resultados de la candidata:

- TypeScript, ESLint y Prettier: aprobados;
- Vitest: 319/319 pruebas en 30 archivos;
- build de Main, preload y renderer: aprobado;
- Electron 44.7.0, SQLite nativo y PDF: aprobados;
- runtime empaquetado: escritura, reapertura, acceso, persistencia, backup y restauración aprobados;
- ASAR: binario x64, branding y exclusión de archivos sensibles aprobados;
- `npm audit`: 0 vulnerabilidades;
- `git diff --check`: aprobado.

El primer empaquetado encontró un bloqueo transitorio `EBUSY` de Windows sobre el ejecutable recién
extraído. No produjo un instalador. El directorio parcial se aisló, el reintento limpio fue correcto
y el parcial se eliminó después de verificar el candidato definitivo.

## QA manual en `OcchialiQA`

Usar exclusivamente la cuenta Windows independiente `OcchialiQA` y datos ficticios. No usar la
instalación habitual ni sus accesos directos o perfil.

### Preparación

1. Verificar el hash del instalador 1.0.0 y del candidato 1.1.0.
2. Confirmar que ningún proceso `Occhiali.exe` esté activo.
3. Instalar o abrir 1.0.0 únicamente en `OcchialiQA`.
4. Crear datos ficticios: cliente, receta y corrección, ficha con tratamientos y comprobante PDF.
5. Configurar una contraseña de acceso ficticia, una carpeta externa temporal y crear/verificar un
   `.ocbackup` con una contraseña de recuperación ficticia.
6. Cerrar Occhiali. Copiar `%APPDATA%\optica-desktop` a una carpeta nueva bajo `%TEMP%` y conservar
   el `.ocbackup` también fuera del perfil. No copiar una base abierta.

### Actualización

1. Ejecutar `Occhiali-Setup-1.1.0-x64.exe` directamente, sin desinstalar 1.0.0.
2. Confirmar que conserva la ubicación instalada y los accesos directos.
3. Abrir, comprobar versión 1.1.0 e ingresar con la contraseña anterior.
4. Verificar clientes, recetas, correcciones, fichas, tratamientos, comprobantes y PDF.
5. Confirmar que configuración, carpeta externa y respaldos existentes siguen disponibles.
6. Confirmar que el modo automático no se activó solo.
7. Activarlo explícitamente, proteger una contraseña de recuperación ficticia y probar scheduler,
   historial, copia externa, reintento y retención sólo en carpetas temporales.
8. Cerrar y reabrir; verificar persistencia y ausencia de duplicados.
9. Crear y verificar un nuevo respaldo 1.1.0 antes del rollback.

### Rollback ensayado

1. Cerrar Occhiali y conservar otra copia del perfil QA completo.
2. Ejecutar el instalador 1.0.0 aprobado sobre 1.1.0, sin desinstalar ni borrar `userData`.
3. Ingresar con la misma contraseña y comprobar los datos comerciales, el respaldo manual y los
   comprobantes.
4. No esperar que 1.0.0 ejecute la automatización de 1.1.0. No eliminar `backup-history.json` ni
   `backup-credential.json`; 1.0.0 los ignora.
5. Reinstalar el candidato 1.1.0 y confirmar que la configuración nueva reaparece en la misma cuenta
   Windows.
6. Ante cualquier error, no borrar nada: preservar el perfil fallido y volver a la copia previa sólo
   dentro de `OcchialiQA`.

## Criterios de aprobación

- Instalador y runtime informan 1.1.0.
- Login anterior y todos los datos ficticios permanecen disponibles.
- SQLite pasa integridad y claves foráneas mediante la verificación empaquetada.
- Los respaldos 1.0.0 se verifican y restauran desde 1.1.0.
- Automatización requiere consentimiento y no duplica copias.
- Rollback no elimina datos, credenciales, respaldos ni archivos nuevos.
- Los instaladores históricos conservan sus hashes.

El instalador continúa sin firma Authenticode; SmartScreen puede mostrar editor desconocido. No se
deben desactivar protecciones de Windows para completar el QA.
