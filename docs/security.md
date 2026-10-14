# Seguridad

## Alcance y modelo de amenazas

Fase 8 reduce acceso casual no autorizado desde la interfaz y protege las copias frente a lectura o
alteración. También contempla pérdida del equipo, falla de disco, borrado accidental, corrupción de
SQLite, cortes durante backup o restauración, archivos incompletos, modificación de una copia
sincronizada, olvido de contraseña y errores durante una actualización.

No confunde dos controles distintos:

- La **contraseña de acceso** bloquea la interfaz y los IPC de datos.
- La **contraseña de recuperación** cifra cada archivo `.ocbackup` y permite llevarlo a otra
  computadora.

La contraseña de acceso no cifra `optica.sqlite3`. Una persona que obtiene acceso al disco y a la
cuenta de Windows puede copiar o abrir esa base con otras herramientas. En el equipo operativo debe
habilitarse BitLocker o Cifrado de dispositivo de Windows, proteger la sesión de Windows y limitar
las cuentas con permisos de administrador. Occhiali no implementa un cifrado propio de SQLite.

## Protección de acceso

En el primer inicio se exige una contraseña de 10 a 128 caracteres. No existe contraseña inicial,
usuario múltiple, rol, JWT, bypass secreto ni contraseña maestra. `SecurityGate` presenta alta o
login, pero la autorización decisiva se ejecuta en Main antes de cada IPC de clientes, recetas,
fichas, dashboard, búsqueda, backup o restauración.

El archivo `security.json`, dentro de `userData`, contiene solamente versión, salt aleatorio,
verificador derivado e intervalo de inactividad. La contraseña nunca se persiste ni se registra. El
verificador se obtiene con `scrypt` de Node (`N=32768`, `r=8`, `p=1`, salida de 32 bytes y salt de 16
bytes) y se compara en tiempo constante. La alternativa se eligió por estar mantenida en el runtime
y no requerir un módulo nativo adicional. Argon2id podría evaluarse durante el empaquetado si su
binario se distribuye y valida de forma confiable.

La sesión vive solamente en memoria: cada reinicio vuelve a pedir contraseña. Hay bloqueo manual,
cambio de contraseña, tiempo de inactividad configurable entre 1 y 240 minutos y actualización de
actividad mediante un canal explícito. Cinco fallos consecutivos introducen espera exponencial
acotada a 30 segundos; cerrar el programa no produce un bloqueo permanente.

## Olvido y archivos dañados

No hay preguntas débiles ni recuperación remota. Si se olvida la contraseña de acceso, soporte debe
trabajar con la dueña sobre el equipo autorizado, cerrar Occhiali, preservar primero `userData` y
retirar `security.json` para volver a configurar el acceso. Esto es coherente con su alcance de
barrera casual: quien controla esos archivos también puede leer el SQLite sin cifrado de disco.

Eliminar la configuración de acceso **no** recupera una contraseña de backup ni descifra copias. Si
se pierde la contraseña de recuperación, el contenido cifrado no puede recuperarse. Debe conservarse
fuera del equipo, por ejemplo en un gestor de contraseñas o sobre sellado. No se guarda junto al
backup, en Git, en logs ni en nombres de archivo.

Un `security.json` ilegible o incompatible detiene el arranque seguro del módulo y muestra un error
controlado; no se inventa una sesión ni se usa un valor por defecto.

## Límites restantes

- Un administrador local puede modificar archivos de configuración o instrumentar la aplicación.
- La base activa no está cifrada por Occhiali. Durante una restauración existe temporalmente un
  rollback descifrado; se elimina después del marcador confirmado, sin garantía de borrado físico en
  SSD. BitLocker o Cifrado de dispositivo cubren esa exposición en reposo.
- Los backups protegen confidencialidad e integridad, no disponibilidad: deben existir copias en más
  de un dispositivo y comprobarse periódicamente.
- No hay telemetría, servidor, autenticación remota ni recuperación por internet.
