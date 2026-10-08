# Desarrollo

## Preparación

Desde la raíz del repositorio:

```bash
npm install
```

Las versiones exactas se resuelven desde `package-lock.json`. No se requieren servicios externos,
contenedores ni una base de datos para la Fase 1.

## Iniciar la aplicación

```bash
npm run dev
```

El proceso queda activo mientras la ventana de Electron esté abierta. Los cambios del renderer se
recargan mediante Vite; los cambios en main o preload reinician el proceso correspondiente.

## Verificaciones

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
git diff --check
```

- `typecheck` valida por separado los contextos Node/Electron y web.
- `lint` usa la configuración plana de ESLint y reglas con información de tipos.
- `format:check` comprueba el formato sin modificar archivos.
- `test` ejecuta Vitest una sola vez.
- `build` repite el typecheck y genera `out/main`, `out/preload` y `out/renderer`.

## Estructura de salida

Los artefactos generados se guardan en `out/` y no se versionan. El punto de entrada de Electron es
`out/main/index.js`, configurado mediante el campo `main` de `package.json`.

## Reglas para cambios futuros

- La interfaz no debe importar Node.js ni Electron.
- Todo IPC debe usar un canal enumerado y validación de argumentos.
- La base de datos solo se abrirá desde el proceso principal.
- No deben guardarse datos del negocio dentro del repositorio o del paquete instalado.
- No deben usarse datos reales en pruebas automatizadas.

## Problemas conocidos

- No hay instalador en esta fase; su configuración corresponde a la Fase 9.
- SQLite y el módulo nativo se incorporan en Fase 2.
- La pantalla inicial no contiene flujos de negocio por decisión de alcance.
