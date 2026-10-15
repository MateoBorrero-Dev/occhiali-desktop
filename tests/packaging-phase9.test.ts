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
    files: string[];
    win: { executableName: string; artifactName: string; signAndEditExecutable: boolean };
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
          signAndEditExecutable: false,
        },
        nsis: {
          oneClick: false,
          perMachine: false,
          allowElevation: false,
          createDesktopShortcut: 'always',
          createStartMenuShortcut: true,
          deleteAppDataOnUninstall: false,
        },
      },
    });
    expect(packageConfiguration.scripts['package:win']).toContain('electron-builder');
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
