# Backup, restauración y recuperación

## Ubicaciones

- Base activa: `app.getPath('userData')/optica.sqlite3`.
- Backups administrados: `app.getPath('userData')/backups`.
- Configuración: `backup-settings.json` dentro de `userData`.
- Exportación: carpeta elegida mediante diálogo nativo, fuera del control de Occhiali.
- Temporales: nombres únicos `.sqlite.tmp`, `.partial` y `.restore-staging-*`.
- Estado durable de restauración: `optica.sqlite3.restore-state.json`.
- Rollback transitorio: `optica.sqlite3.restore-rollback`.

React nunca envía rutas arbitrarias. Main abre los diálogos de carpeta y archivo y solo conserva en
memoria la ruta de restauración seleccionada.

## Creación consistente

Con WAL activo no se copia el archivo principal. `ApplicationDatabase.backupTo()` usa la API de
backup de `better-sqlite3`, crea una base temporal consistente y comprueba `integrity_check` y
`foreign_key_check`. Luego incorpora metadatos, cifra, escribe con nombre `.partial`, descifra y
abre la copia para volver a validar SQLite. Solo entonces renombra al nombre final.

Un respaldo incompleto nunca se publica como `.ocbackup`. Los temporales locales se limpian en
`finally` y se impiden dos operaciones simultáneas. El nombre contiene exclusivamente fecha y hora,
sin nombres, DNI, teléfonos ni graduaciones.

## Formato OCCHIALI_BACKUP v1

El contenedor JSON versionado incluye:

- marca y versión de formato;
- fecha UTC, versión de aplicación e IDs de migraciones;
- descriptor `scrypt`, salt aleatorio de 16 bytes y parámetros;
- descriptor AES-256-GCM, nonce aleatorio de 12 bytes y tag;
- SQLite cifrado en base64.

La clave de 256 bits se deriva de la contraseña de recuperación con `scrypt` (`N=32768`, `r=8`,
`p=1`). AES-256-GCM autentica el contenido y la cabecera relevante —incluidos metadatos, parámetros,
algoritmo y nonce— como AAD. Cada archivo usa salt y nonce nuevos. Los metadatos no contienen datos
personales, pero no pueden alterarse sin invalidar el tag.

Contraseña incorrecta, tag inválido, truncamiento, formato desconocido o migración futura se
rechazan antes de tocar la base activa. Un respaldo anterior compatible se abre en staging y recibe
las migraciones incrementales normales. No se modifican migraciones históricas.

## Programación asistida y retención

Configuración permite elegir modo asistido o automático, hora y conservar entre 2 y 90 copias; el
valor inicial es 14. En modo automático la contraseña de recuperación se protege con `safeStorage`
de Electron/DPAPI y no puede mostrarse ni recuperarse desde la interfaz.

Occhiali no crea copias cuando está cerrado o la computadora está apagada. La contraseña debe
conservarse también fuera del equipo porque la protección DPAPI está ligada a la cuenta Windows.

La rotación se ejecuta después de publicar y verificar una copia local nueva. Sólo considera archivos
regulares con nombre y estructura administrados dentro de la carpeta local; conserva como mínimo
uno, protege copias en uso y nunca sigue enlaces ni borra archivos externos, manuales o ajenos. La
versión actual conserva los últimos N; no implementa estratos diarios/semanales/mensuales.

Desde 1.1.0, el estado se calcula contra la hora local configurada y el sistema comprueba si el
último archivo administrado continúa disponible. Las alertas de 24 y 72 horas y el estado externo se
muestran en todas las pantallas. El scheduler se ejecuta sólo mientras la aplicación permanece
abierta.

Las operaciones se registran en `backup-history.json`, separado de SQLite y limitado a 90 eventos.
Su diseño, seguridad y recuperación se documentan en [Alertas e historial](backup-observability.md).

El modo automático opcional reutiliza exactamente esta creación verificada y el mismo formato. La
contraseña se protege fuera de SQLite mediante `safeStorage`; el scheduler, sus bloqueos y límites se
documentan en [Respaldos automáticos](backup-automation.md).
Las transferencias verificadas, reintentos y reglas conservadoras de eliminación se documentan en
[Copias externas robustas y retención segura](backup-resilience.md).

## Restauración

1. La usuaria elige `.ocbackup` mediante diálogo nativo.
2. Ingresa la contraseña y verifica autenticidad, formato, migraciones e integridad SQLite.
3. Revisa fecha, versión y confirma explícitamente.
4. Occhiali crea y verifica un backup cifrado de la base activa.
5. Escribe y sincroniza a disco el estado `pending`; recién entonces transfiere al coordinador la
   responsabilidad del staging descifrado.
6. Cierra SQLite para consolidar WAL, mueve la base anterior a `.restore-rollback` y registra
   `active-moved`.
7. Elimina WAL/SHM ya cerrados, coloca staging como base candidata y registra `candidate-placed`.
8. Abre la candidata, aplica migraciones compatibles y comprueba integridad y claves foráneas.
9. Registra `verified` y luego `confirmed`. Solo `confirmed` hace autoritativa la restauración.
10. Elimina el rollback descifrado, temporales y marcador; finalmente reinicia la aplicación.

Los estados persistentes son `pending`, `active-moved`, `candidate-placed`, `verified`, `confirmed`,
`rollback-restored` y `recovery-required`. `rollback-restored` es la evidencia durable de que el
rollback ya volvió a ser la base activa; la mera existencia de `optica.sqlite3` nunca confirma el
proceso. Si Occhiali reinicia antes de `confirmed`, conserva o repone la base anterior. Si reinicia
después de `confirmed`, conserva la restaurada y completa la limpieza pendiente.

Un estado ilegible, un rollback sin marcador o la ausencia de todos los archivos recuperables hacen
fallar el inicio sin sobrescribir nada, para permitir revisión técnica. Una segunda restauración no
puede empezar mientras exista estado o rollback pendiente.

## Temporales y rollback

`decryptAndValidate` adquiere responsabilidad sobre SQLite, WAL y SHM desde que asigna el nombre de
staging. Cualquier error de escritura, apertura, migración, integridad o excepción inesperada ejecuta
la limpieza. Cuando devuelve un `PreparedRestore`, el llamador debe limpiarlo o transferir
explícitamente su propiedad al coordinador. La verificación sin restauración siempre lo elimina.

El rollback descifrado existe solamente desde el movimiento de la base activa hasta la confirmación
durable. Después se elimina y queda como copia preventiva el `.ocbackup` cifrado creado antes de la
operación. `rm` reduce la exposición lógica, pero no garantiza borrado físico irrecuperable en SSD;
el equipo debe usar cifrado de disco.

Los marcadores sincronizados y renombres en el mismo volumen permiten recuperación determinista,
pero no convierten varios archivos en una transacción atómica. Un corte que además dañe o elimine
simultáneamente base, rollback y marcador requiere soporte y el backup cifrado preventivo.

## Disaster recovery probado

La prueba automatizada crea en SQLite temporal una persona ficticia, receta, graduación, corrección,
ficha, producto, tratamientos y comprobante. Fixtures criptográficos controlados de 0.9.0 y 1.0.0
se producen con una implementación independiente y se restauran en perfiles nuevos sin credencial
DPAPI. Se comparan IDs, valores, revisiones, relaciones y comprobantes. También se prueban base
vacía, contraseña incorrecta, alteración, truncamiento, versión futura, retención, concurrencia,
exportación y recuperación de una interrupción antes del movimiento, después del movimiento, con
candidata colocada, verificada sin confirmar y confirmada pendiente de limpieza.

Si una restauración falla después de cerrar SQLite, el bloqueo crítico se mantiene hasta el
relanzamiento. Una prueba específica demuestra que un reintento externo pendiente tampoco se
ejecuta durante la restauración y que una falla repone la base previa sin perder sus cambios.

Para soporte, usar siempre un perfil temporal o una copia del `userData`, verificar el backup antes
de confirmar, conservar la contraseña fuera de los archivos y no trabajar directamente sobre la
única base disponible.

El contenido incluido y excluido y el procedimiento completo con dos perfiles aislados están en
[Recuperación ante desastres](disaster-recovery.md).

La prueba del runtime empaquetado crea y verifica un `.ocbackup`, prepara la restauración, recorre la
máquina de estados hasta `confirmed`, reabre SQLite y conserva el backup cifrado tras
desinstalación/reinstalación. El reinicio accionado desde la UI instalada permanece dentro del QA
manual pendiente porque el controlador gráfico no pudo completar el recorrido.
