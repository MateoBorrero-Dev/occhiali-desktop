import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resolveStableUserDataPath,
  STABLE_USER_DATA_DIRECTORY_NAME,
} from '../src/main/database/data-location';

interface PackageConfiguration {
  name: string;
  version: string;
  productName: string;
  main: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  build: {
    appId: string;
    productName: string;
    asar: boolean;
    npmRebuild: boolean;
    asarUnpack: string[];
    extraResources: Array<{ from: string; to: string }>;
    files: string[];
    win: {
      executableName: string;
      artifactName: string;
      icon: string;
      signExecutable: boolean;
    };
    nsis: Record<string, unknown>;
  };
}

const packageConfiguration = JSON.parse(
  readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
) as PackageConfiguration;
const collectorPatchSource = readFileSync(
  join(process.cwd(), 'scripts', 'patch-electron-builder-collector.cjs'),
  'utf8',
);

describe('configuración de distribución de Windows', () => {
  it('mantiene identidad, versión preliminar e instalador NSIS x64 estables', () => {
    expect(packageConfiguration).toMatchObject({
      name: 'optica-desktop',
      version: '0.9.0',
      productName: 'Occhiali',
      main: './out/main/index.js',
      dependencies: { 'better-sqlite3': '13.0.3' },
      devDependencies: { 'electron-builder': '26.16.1' },
      build: {
        appId: 'com.occhiali.desktop',
        productName: 'Occhiali',
        asar: true,
        npmRebuild: false,
        win: {
          executableName: 'Occhiali',
          artifactName: 'Occhiali-Setup-${version}-${arch}.${ext}',
          icon: 'resources/branding/occhiali-windows.ico',
          signExecutable: false,
        },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowElevation: false,
          createDesktopShortcut: 'always',
          createStartMenuShortcut: true,
          installerIcon: 'resources/branding/occhiali-windows.ico',
          uninstallerIcon: 'resources/branding/occhiali-windows.ico',
          installerHeaderIcon: 'resources/branding/occhiali-windows.ico',
          deleteAppDataOnUninstall: false,
        },
      },
    });
    expect(packageConfiguration.scripts['package:win']).toContain('electron-builder');
    expect(packageConfiguration.scripts.package).toBe('npm run package:win');
    expect(packageConfiguration.scripts.verify).toBe('npm run verify:package');
    expect(packageConfiguration.scripts['package:win']).toContain(
      'patch-electron-builder-collector.cjs',
    );
    expect(collectorPatchSource).toContain("const EXPECTED_APP_BUILDER_LIB_VERSION = '26.16.1';");
    expect(collectorPatchSource).toContain('packageMetadata.version !==');
    expect(packageConfiguration.build.files).toEqual(
      expect.arrayContaining([
        'node_modules/better-sqlite3/**/*',
        'node_modules/node-addon-api/**/*',
      ]),
    );
    expect(packageConfiguration.build.extraResources).toContainEqual({
      from: 'resources/branding/occhiali-windows.ico',
      to: 'branding/occhiali-windows.ico',
    });
  });

  it('incluye un ICO multirresolución apto para Windows', () => {
    const icon = readFileSync(join(process.cwd(), 'resources', 'branding', 'occhiali-windows.ico'));
    expect(icon.readUInt16LE(0)).toBe(0);
    expect(icon.readUInt16LE(2)).toBe(1);
    const count = icon.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, index) => {
      const value = icon[6 + index * 16];
      return value === 0 ? 256 : value;
    });
    expect(sizes).toEqual([16, 24, 32, 48, 64, 128, 256]);
  });

  it('desempaqueta solamente el binario nativo Windows x64 y excluye datos sensibles', () => {
    expect(packageConfiguration.build.asarUnpack).toEqual([
      'node_modules/better-sqlite3/prebuilds/win32-x64.node',
    ]);
    for (const pattern of [
      '!**/*.sqlite3',
      '!**/*.ocbackup',
      '!**/security.json',
      '!**/backup-settings.json',
      '!**/.env',
    ])
      expect(packageConfiguration.build.files).toContain(pattern);
  });

  it('conserva la carpeta histórica de userData aunque cambie el nombre visible', () => {
    expect(STABLE_USER_DATA_DIRECTORY_NAME).toBe('optica-desktop');
    expect(resolveStableUserDataPath('C:\\Users\\QA\\AppData\\Roaming')).toBe(
      'C:\\Users\\QA\\AppData\\Roaming\\optica-desktop',
    );
  });
});
