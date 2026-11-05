# Occhiali Desktop 1.2.0 — preparación de release

## Estado

Este documento describe la preparación del código y la actualización desde 1.1.0. El instalador candidato
1.2.0 todavía no fue generado ni instalado en esta etapa. Su artefacto esperado es:

```text
release/candidates/1.2.0/Occhiali-Setup-1.2.0-x64.exe
```

## Principales novedades

- **Fichas ópticas unificadas:** receta, graduación y trabajo comercial se crean y consultan desde una sola
  experiencia.
- **Edición atómica:** un único guardado actualiza datos comerciales y ópticos; si falla una etapa, se
  revierte toda la operación.
- **Graduaciones trazables:** las revisiones se crean solo cuando cambian valores ópticos y las recetas
  compartidas requieren confirmación explícita.
- **Datos comerciales:** cristal y marca son campos independientes; se conservan producto, modelo, color,
  coloración, tratamientos, proveedor y armazón.
- **Retiros:** sección propia con búsqueda, filtros, paginación, detalle, aclaraciones y anulaciones.
- **Comprobante digital:** PDF sin espacios de firma y con advertencia de que no es comprobante fiscal.
- **WhatsApp asistido:** prepara el PDF y abre WhatsApp; la usuaria adjunta y envía manualmente.
- **Accesibilidad:** tipografía y controles ampliados, foco visible y adaptación a ventanas estrechas.

## Cambios técnicos relevantes

- Versión de producto: `1.2.0`.
- `appId` conservado: `com.occhiali.desktop`.
- Carpeta histórica de datos conservada: `%APPDATA%\optica-desktop`.
- Runtime fijado: Electron 44.10.2.
- SQLite nativo: `better-sqlite3` 13.0.3 para Windows x64.
- Migración 007: agrega `lens` y `brand` como columnas opcionales en `optical_jobs` y en el snapshot de
  retiros. No reescribe los registros anteriores.
- Persistencia atómica de `security.json` y `backup-settings.json`.
- Rechazo de `.ocbackup` mayores a 128 MiB antes de cargarlos por completo en memoria.
- Contratos IPC específicos; renderer sin acceso directo a Node.js, SQL o sistema de archivos.

El formato `.ocbackup`, las migraciones 001–006 y las identidades históricas no se modificaron.

## Requisitos

- Windows 10 u 11 x64.
- Una cuenta de Windows con permiso para instalar aplicaciones por usuario.
- Espacio disponible para la aplicación, la base activa y los respaldos.
- No se necesitan Node.js, npm, Git ni conexión a internet para utilizar Occhiali.

WhatsApp y las carpetas sincronizadas son servicios externos y pueden necesitar conexión. Occhiali no
incluye sincronización en la nube ni actualizaciones automáticas.

## Instalación limpia

1. Verificar el SHA-256 publicado del instalador candidato.
2. Ejecutar `Occhiali-Setup-1.2.0-x64.exe`.
3. Revisar la advertencia de Windows. El instalador no está firmado digitalmente.
4. Completar el asistente sin desactivar protecciones del sistema.
5. Abrir Occhiali y crear una contraseña de acceso.
6. Registrar datos ficticios, cerrar y volver a abrir para confirmar persistencia.
7. Crear, verificar y conservar un respaldo cifrado.

## Actualización segura desde 1.1.0

1. Abrir Occhiali 1.1.0 y crear un `.ocbackup` cifrado y verificado.
2. Copiarlo fuera de la computadora o en otro dispositivo.
3. Conservar la contraseña de recuperación separada del archivo.
4. Cerrar completamente Occhiali.
5. Ejecutar el instalador 1.2.0 sin desinstalar previamente 1.1.0.
6. Iniciar con la contraseña de acceso existente.
7. Comprobar clientes, fichas, graduaciones, tratamientos, retiros, configuración e historial de respaldos.
8. Cerrar y volver a abrir para confirmar persistencia.
9. Crear y verificar un nuevo respaldo desde 1.2.0.

La compatibilidad de base y respaldo 1.1.0→1.2.0 fue demostrada con fixtures auténticos generados desde el
tag `v1.1.0`, bases temporales y el flujo real de restauración. La actualización del ejecutable instalado
debe verificarse nuevamente con el candidato.

## Advertencia de migración y rollback

> **Importante:** después de aplicar la migración 007, la base no puede abrirse directamente con Occhiali
> 1.1.0. El control de migraciones rechaza el downgrade para evitar una interpretación insegura del esquema.

Para regresar a 1.1.0:

1. No abrir la base migrada con 1.1.0 ni editarla manualmente.
2. Conservar aparte la base y los respaldos de 1.2.0.
3. Instalar 1.1.0 solamente en el entorno aislado definido para el rollback.
4. Restaurar un respaldo compatible creado por 1.1.0 antes de aplicar la migración.
5. Comprobar los datos antes de continuar trabajando.

Los datos creados o modificados únicamente en 1.2.0 no estarán en ese respaldo anterior.

## Respaldos antes de actualizar

- Verificar el archivo antes de iniciar la actualización.
- Conservar al menos una copia externa y la contraseña de recuperación por separado.
- No copiar solo `optica.sqlite3` mientras Occhiali está abierto.
- No asumir que una carpeta de OneDrive u otro proveedor ya terminó de sincronizar.
- No eliminar el respaldo 1.1.0 después del primer inicio de 1.2.0.

## Recuperación

1. Instalar una versión capaz de abrir el respaldo elegido.
2. Crear la contraseña de acceso local del equipo nuevo.
3. Seleccionar el `.ocbackup`, ingresar su contraseña y usar **Verificar**.
4. Revisar fecha y versión antes de restaurar.
5. Confirmar la restauración y no cerrar la aplicación durante el proceso.
6. Después del reinicio, comprobar clientes, fichas, graduaciones, retiros y configuración incluida en la
   base.
7. Configurar nuevamente la programación automática, la carpeta externa y la credencial protegida.

La contraseña de acceso, la credencial DPAPI, la programación automática, la carpeta externa, el historial
de respaldos y los PDF exportados no viajan dentro del `.ocbackup`.

## Limitaciones conocidas

- Instalador sin firma Authenticode; SmartScreen puede mostrar una advertencia.
- No hay actualización automática.
- WhatsApp es asistido: no adjunta ni envía el PDF automáticamente.
- Una copia externa verificada localmente no confirma sincronización remota.
- Los respaldos automáticos requieren que Occhiali pueda ejecutarse y que el destino esté disponible.
- No hay inventario, precios, ventas, caja, facturación ni integración directa con servicios de nube.
- No existe downgrade directo de una base que ya aplicó la migración 007.

## Verificaciones previas al candidato

La Etapa 2 informó 444/444 pruebas automatizadas aprobadas, además de TypeScript, ESLint, formato, build,
SQLite nativo y compatibilidad auténtica 1.1.0→1.2.0. La Etapa 3A debe repetir las validaciones después del
cambio de versión y documentación.

Antes de publicar se debe completar además:

- empaquetado aislado del candidato;
- verificación nativa del ejecutable empaquetado;
- SHA-256 del instalador;
- instalación limpia y actualización real desde 1.1.0 en una cuenta Windows aislada;
- persistencia, autenticación, backup, restauración, PDF y WhatsApp asistido;
- QA visual y manual final.

## Referencias

- [Manual de usuario](manual-usuario.md)
- [Fichas ópticas unificadas](optical-jobs.md)
- [Backup y restauración](backup-restore.md)
- [Recuperación ante desastres](disaster-recovery.md)
- [Instalador Windows](windows-installer.md)
- [Preparación histórica 1.1.0](release-1.1.0.md)
