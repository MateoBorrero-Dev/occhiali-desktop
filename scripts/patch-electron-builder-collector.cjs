'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const EXPECTED_APP_BUILDER_LIB_VERSION = '26.16.1';
const appBuilderLibRoot = join(process.cwd(), 'node_modules', 'app-builder-lib');
const packageMetadata = JSON.parse(readFileSync(join(appBuilderLibRoot, 'package.json'), 'utf8'));

if (packageMetadata.version !== EXPECTED_APP_BUILDER_LIB_VERSION) {
  throw new Error(
    `Unsupported app-builder-lib version ${packageMetadata.version}. ` +
      `Expected ${EXPECTED_APP_BUILDER_LIB_VERSION}; review the collector before packaging.`,
  );
}

const target = join(appBuilderLibRoot, 'out', 'util', 'appFileCopier.js');
const upstream =
  'const pmApproaches = [await packager.getPackageManager(), node_module_collector_1.PM.TRAVERSAL];';
const patched =
  'const pmApproaches = [node_module_collector_1.PM.TRAVERSAL, await packager.getPackageManager()];';
const source = readFileSync(target, 'utf8');

if (source.includes(patched)) {
  process.stdout.write('electron-builder collector patch already applied.\n');
} else if (source.includes(upstream)) {
  writeFileSync(target, source.replace(upstream, patched), 'utf8');
  process.stdout.write('electron-builder collector patch applied.\n');
} else {
  throw new Error(
    'The pinned app-builder-lib collector no longer matches the reviewed patch. Review before packaging.',
  );
}
