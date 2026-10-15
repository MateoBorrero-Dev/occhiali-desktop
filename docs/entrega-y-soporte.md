# Entrega y soporte

Este documento prepara Occhiali 0.9.0 para instalación, mantenimiento y futuras actualizaciones.
La versión sigue siendo preliminar: no representa una entrega definitiva ni una versión 1.0.0.

## Requisitos del equipo

- Windows 10 u 11 de 64 bits.
- Cuenta de Windows con permiso para instalar aplicaciones para el usuario actual.
- Espacio disponible para la aplicación, la base SQLite y varias copias de seguridad.
- Cifrado de dispositivo o BitLocker recomendado.

La aplicación funciona offline. No requiere Node.js, npm, Git, servidor, cuenta remota ni conexión
permanente a internet.

## Instalación y primera configuración

1. Cerrá versiones anteriores de Occhiali.
2. Conservá un respaldo cifrado verificado si ya existen datos.
3. Ejecutá `Occhiali-Setup-0.9.0-x64.exe`.
4. Windows puede advertir “editor desconocido” porque la versión preliminar no tiene firma
   Authenticode. No desactives SmartScreen ni Defender de forma permanente.
5. Elegí la carpeta de instalación y completá el asistente.
6. Abrí Occhiali y configurá una contraseña local de acceso.
7. Creá y verificá el primer respaldo.

## Ubicación y protección de datos

El perfil estable está en:

```text
%APPDATA%\optica-desktop\
  optica.sqlite3
  security.json
  backup-settings.json
  backups\
```

La base activa no está cifrada por la contraseña de acceso. Protegé la cuenta de Windows y el disco.
No adjuntes estos archivos a incidencias sin autorización y sin evaluar si contienen datos
personales.

## Contraseñas

- **Acceso:** bloquea la interfaz y los canales IPC; no cifra SQLite.
- **Recuperación:** cifra y autentica cada `.ocbackup`; no se almacena en Occhiali.

Si se pierde la contraseña de recuperación, la copia cifrada no puede abrirse. Si se olvida la de
acceso, soporte debe preservar primero el perfil completo y trabajar en el equipo autorizado; no se
debe improvisar un borrado de configuración sobre la única copia disponible.

## Backups y restauración

- Generá copias periódicas desde **Configuración**.
- Verificá cada copia antes de depender de ella.
- Conservá al menos una copia fuera del equipo.
- Una carpeta sincronizada sólo recibe el archivo; Occhiali no confirma la subida remota.
- Restaurá únicamente un `.ocbackup` verificado y mantené el equipo encendido hasta el reinicio.

Ante `recovery-required`, un marcador dañado o un inicio bloqueado después de restaurar, no borres la
base, el rollback ni el estado. Copiá de forma conservadora el perfil completo a una ubicación
segura y realizá el diagnóstico sobre esa copia.

## Actualizaciones manuales

No existe actualización automática. Para actualizar:

1. Crear y verificar un respaldo.
2. Cerrar Occhiali.
3. Ejecutar el instalador de la versión posterior manteniendo el mismo `appId` y perfil.
4. Abrir, iniciar sesión y comprobar conteos y registros.
5. Crear un nuevo respaldo con la versión instalada.

La reinstalación de 0.9.0 fue validada sin pérdida. Una actualización real entre versiones distintas
debe probarse en un perfil duplicado antes de usarla con información habitual.

## Desinstalación

El desinstalador quita la aplicación y los accesos directos, pero conserva `%APPDATA%\optica-desktop`.
No elimines esa carpeta salvo decisión explícita, después de verificar un respaldo y confirmar que
los datos ya no son necesarios.

## Problemas frecuentes

### Windows muestra una advertencia

La versión preliminar no está firmada. Verificá que el archivo provenga del medio acordado y compará
su hash con el informado para esa compilación. No desactives las protecciones globales de Windows.

### No inicia o informa almacenamiento dañado

Cerrá todas las instancias. No abras ni reemplaces la base. Preservá el perfil completo y registrá el
mensaje exacto, la versión de Windows y la versión de Occhiali.

### No acepta la contraseña

Revisá teclado, mayúsculas y distribución. Esperá si se activó la limitación de intentos. No pruebes
contraseñas indefinidamente ni elimines archivos antes de preservar el perfil.

### No se crea o exporta el respaldo

Comprobá espacio, permisos y disponibilidad de la carpeta. La copia local puede ser válida aunque la
exportación falle; verificá el mensaje y el archivo desde Occhiali.

### No puede verificarse o restaurarse una copia

Confirmá que sea `.ocbackup`, usá la contraseña correspondiente y no modifiques el archivo. Una
copia con contraseña incorrecta, alterada o de una versión futura se rechaza de forma segura.

## Procedimiento de soporte

1. Anotar fecha, versión de Occhiali, versión de Windows y mensaje visible.
2. Confirmar si ocurrió durante inicio, guardado, backup, restauración o actualización.
3. Cerrar Occhiali y evitar nuevos intentos si hay recuperación pendiente.
4. Preservar el perfil completo y el respaldo relevante en una ubicación controlada.
5. Reproducir con una copia y un perfil temporal, nunca sobre la única base habitual.
6. Ejecutar comprobaciones de integridad y recuperación con las herramientas del proyecto.
7. Documentar diagnóstico, archivos reemplazados y resultado antes de devolver el equipo a uso.

Este documento no define canales, horarios, plazos ni acuerdos comerciales de soporte.
