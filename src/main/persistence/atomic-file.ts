import { randomBytes } from 'node:crypto';
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from 'node:fs';

export type AtomicTextFileWriter = (path: string, contents: string) => void;

function replaceFile(nextPath: string, path: string): void {
  const signal = new Int32Array(new SharedArrayBuffer(4));
  for (let attempt = 0; ; attempt += 1) {
    try {
      renameSync(nextPath, path);
      return;
    } catch (error: unknown) {
      const transient =
        error instanceof Error &&
        'code' in error &&
        (error.code === 'EPERM' || error.code === 'EACCES');
      if (!transient || attempt >= 7) throw error;
      Atomics.wait(signal, 0, 0, (attempt + 1) * 10);
    }
  }
}

export const atomicWriteTextFileSync: AtomicTextFileWriter = (path, contents) => {
  const nextPath = `${path}.${process.pid}-${randomBytes(8).toString('hex')}.next`;
  let descriptor: number | null = null;
  try {
    descriptor = openSync(nextPath, 'wx', 0o600);
    writeFileSync(descriptor, contents, 'utf8');
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = null;
    replaceFile(nextPath, path);
  } catch (error: unknown) {
    if (descriptor !== null) {
      try {
        closeSync(descriptor);
      } catch {
        // Preserve the original write error.
      }
    }
    rmSync(nextPath, { force: true });
    throw error;
  }
};

export function quarantineFileSync(path: string, label: string): string {
  const quarantinePath = `${path}.${label}-${randomBytes(6).toString('hex')}`;
  renameSync(path, quarantinePath);
  return quarantinePath;
}
