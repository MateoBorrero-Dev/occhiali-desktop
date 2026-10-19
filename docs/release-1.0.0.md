# Cierre de Occhiali 1.0.0

## Estado

El código fuente de Occhiali 1.0.0 fue verificado para su cierre en Git. El commit, push, tag y la
publicación siguen siendo operaciones manuales y no forman parte de esta verificación.

La aplicación continúa siendo local y offline. No incorpora actualizador automático, telemetría,
servidor, stock, caja ni facturación.

## Origen y artefactos identificados

La referencia histórica 0.9.0 parte del commit de `main`
`0185032ae2917a331a6d28bb6b7b2722af4177b6`, fechado el 17 de octubre de 2026 y titulado
`feat: integrate Occhiali visual identity and Windows icons`.

Los instaladores preservados y verificados son:

```text
Occhiali-Setup-0.9.0-x64.exe
SHA-256: E267E94162EBFE15E5EDC192D2788A5833C55E691247A3EFD6BD208F57959077

Occhiali-Setup-1.0.0-x64.exe
SHA-256: 50561014DC50B287B983381A5702D979267AFFEDF88F9441C2EF43BDE2A06281
```

No deben sustituirse por otros artefactos con el mismo nombre sin registrar nuevamente hash,
versión y origen. `release/` permanece excluida de Git.

## Invariantes de compatibilidad

- `appId`: `com.occhiali.desktop`.
- Producto, ejecutable y accesos directos: `Occhiali`.
- Arquitectura distribuida: Windows x64.
- Instalación NSIS por usuario.
- Perfil histórico: `%APPDATA%\optica-desktop`.
- Base activa: `optica.sqlite3` dentro de ese perfil.
- Migraciones acumuladas e inmutables: 001–006.
- El desinstalador no elimina `userData`.
- El instalador no incluye bases, backups, credenciales, configuraciones ni perfiles de QA.

## Pruebas automatizadas de cierre

El 19 de octubre de 2026 se ejecutaron sobre el código pendiente de cierre:

- `npm run typecheck`: aprobado.
- `npm run lint`: aprobado.
- `npm run format:check`: aprobado.
- `npm test`: 24 archivos y 260/260 pruebas aprobadas.
- `npm run build`: aprobado; Main, preload y renderer generados correctamente.

La suite incluye compatibilidad lógica de un backup con metadatos 0.9.0 abierto por el código 1.0.0.
Comprueba clientes, recetas, revisiones, ADD OD/OI, fichas, tratamientos, color, proveedor,
comprobantes, eventos, migraciones, integridad y autenticación local persistida.

No se ejecutó electron-builder ni se regeneraron instaladores durante el cierre. Los artefactos se
verificaron exclusivamente por existencia, tamaño y SHA-256.

## Actualización real 0.9.0 → 1.0.0

La actualización fue aprobada manualmente utilizando la cuenta independiente de Windows
`OcchialiQA` y datos ficticios:

1. Se instaló 0.9.0 por usuario.
2. Se creó información de clientes, recetas, productos y fichas ópticas.
3. Se instaló 1.0.0 directamente, sin desinstalar 0.9.0.
4. La aplicación conservó la información y aceptó la contraseña de acceso anterior.
5. Se exportaron comprobantes PDF.
6. Los datos persistieron después de cerrar y reabrir la aplicación.
7. Desde 1.0.0 se restauró correctamente un respaldo generado por 0.9.0.

El ensayo confirma la continuidad del `appId`, del perfil histórico y de las migraciones. No debe
repetirse sobre una instalación operativa para futuras versiones: se debe usar otro perfil aislado.

## Seguridad de distribución

El instalador 1.0.0 no está firmado con Authenticode. Windows puede mostrar “editor desconocido” o
una advertencia de SmartScreen. No se deben desactivar Defender o SmartScreen; la identidad del
artefacto debe comprobarse mediante su SHA-256 obtenido por un canal confiable.

La cadena de desarrollo conserva el advisory moderado transitivo `GHSA-hp3w-g68c-fv3c` en
`sprintf-js`, a través de herramientas de empaquetado. No forma parte del runtime instalado. No se
aplica `npm audit fix --force` porque propone un cambio incompatible y no aporta una corrección
mantenible para la cadena utilizada.

## Respaldos en 1.0.0

Los respaldos cifrados y su restauración segura están implementados, pero la programación actual es
manual/asistida: Occhiali no ejecuta respaldos automáticos desatendidos ni confirma que Drive u
OneDrive hayan completado una sincronización remota.

Para operar 1.0.0 de forma segura:

- crear y verificar copias periódicas desde **Configuración**;
- conservar al menos una copia fuera de la computadora;
- comprobar periódicamente que la copia sincronizada exista desde otro dispositivo;
- guardar la contraseña de recuperación fuera del equipo, en un gestor de contraseñas o soporte
  físico protegido.

Perder simultáneamente las copias externas y el equipo impide recuperar la información. Perder la
contraseña de recuperación impide descifrar los `.ocbackup`; no existe clave maestra ni recuperación
remota.

Para 1.1.0 quedan propuestas la ejecución automática mientras la aplicación esté abierta, alertas
globales por antigüedad, historial de resultados, comprobación reforzada del destino externo y una
política de retención y recuperación ante desastres. Estas funciones no forman parte de 1.0.0.
