const { listPackage, extractFile } = require('@electron/asar');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdtempSync, readFileSync, rmSync, statSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..');
const releaseDirectory = join(projectRoot, 'release');
const unpackedDirectory = join(releaseDirectory, 'win-unpacked');
const executablePath = join(unpackedDirectory, 'Occhiali.exe');
const resourcesDirectory = join(unpackedDirectory, 'resources');
const sourceIconPath = join(projectRoot, 'resources', 'branding', 'occhiali-windows.ico');
const packagedIconPath = join(resourcesDirectory, 'branding', 'occhiali-windows.ico');
const asarPath = join(resourcesDirectory, 'app.asar');
const nativePath = join(
  resourcesDirectory,
  'app.asar.unpacked',
  'node_modules',
  'better-sqlite3',
  'prebuilds',
  'win32-x64.node',
);
const packageJson = require(join(projectRoot, 'package.json'));
const installerPath = join(releaseDirectory, `Occhiali-Setup-${packageJson.version}-x64.exe`);

function requireFile(path, label) {
  if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`Falta ${label}: ${path}`);
}

requireFile(executablePath, 'el ejecutable desempaquetado');
requireFile(asarPath, 'app.asar');
requireFile(nativePath, 'el binario nativo win32-x64 de better-sqlite3');
requireFile(installerPath, 'el instalador NSIS');
requireFile(sourceIconPath, 'el icono oficial de Windows');
requireFile(packagedIconPath, 'el icono oficial incluido en el paquete');

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

if (sha256(sourceIconPath) !== sha256(packagedIconPath))
  throw new Error('El icono incluido en el paquete no coincide con el recurso oficial.');

const entries = listPackage(asarPath);
for (const required of [
  '\\out\\main\\index.js',
  '\\out\\main\\package-qa.js',
  '\\out\\preload\\index.cjs',
  '\\out\\renderer\\index.html',
  '\\node_modules\\better-sqlite3\\lib\\index.js',
]) {
  if (!entries.includes(required)) throw new Error(`app.asar no contiene ${required}`);
}

const forbidden = entries.filter((entry) =>
  /(?:^|\\)(?:\.env(?:\..*)?|security\.json|backup-settings\.json)$|\.(?:sqlite3?|db|ocbackup)(?:\..*)?$|restore-(?:staging|rollback|state)/i.test(
    entry,
  ),
);
if (forbidden.length > 0)
  throw new Error(`El paquete contiene archivos sensibles: ${forbidden.join(', ')}`);

const packagedMetadata = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
if (
  packagedMetadata.name !== 'optica-desktop' ||
  packagedMetadata.productName !== 'Occhiali' ||
  packagedMetadata.version !== '0.9.0'
)
  throw new Error('La identidad incluida en app.asar no es estable.');

const qaDirectory = mkdtempSync(join(tmpdir(), 'occhiali-packaged-qa-'));
const qaEntry = join(asarPath, 'out', 'main', 'package-qa.js');
const environment = {
  ...process.env,
  ELECTRON_RUN_AS_NODE: '1',
  OCCHIALI_PACKAGED_QA: '1',
};

try {
  const writeOutput = execFileSync(executablePath, [qaEntry, 'write', qaDirectory], {
    cwd: unpackedDirectory,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!writeOutput.includes('PACKAGED_QA_WRITE_OK'))
    throw new Error('Falló la escritura empaquetada.');
  const readOutput = execFileSync(executablePath, [qaEntry, 'read', qaDirectory], {
    cwd: unpackedDirectory,
    env: environment,
    encoding: 'utf8',
    windowsHide: true,
  });
  if (!readOutput.includes('PACKAGED_QA_READ_OK'))
    throw new Error('Falló la reapertura empaquetada.');
  process.stdout.write(writeOutput);
  process.stdout.write(readOutput);
  process.stdout.write(
    `PACKAGED_ARTIFACT_OK installer=${installerPath} native=${nativePath} branding=${packagedIconPath} sensitive=0\n`,
  );
} finally {
  rmSync(qaDirectory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
