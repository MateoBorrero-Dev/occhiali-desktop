const Database = require('better-sqlite3');
const { app } = require('electron');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

app
  .whenReady()
  .then(() => {
    const temporaryDirectory = mkdtempSync(join(tmpdir(), 'occhiali-electron-sqlite-'));
    const databasePath = join(temporaryDirectory, 'qa.sqlite3');
    const database = new Database(databasePath);

    try {
      database.pragma('foreign_keys = ON');
      database.exec('CREATE TABLE qa_check (value TEXT NOT NULL) STRICT');
      database.prepare('INSERT INTO qa_check (value) VALUES (?)').run('electron-ok');
      const row = database.prepare('SELECT value FROM qa_check').get();

      if (!row || row.value !== 'electron-ok') {
        throw new Error('La consulta de QA no devolvió el valor esperado.');
      }

      process.stdout.write(
        `ELECTRON_SQLITE_QA_OK electron=${process.versions.electron} sqlite=${database.pragma('compile_options').length > 0}\n`,
      );
    } finally {
      database.close();
      rmSync(temporaryDirectory, { recursive: true, force: true });
    }
  })
  .then(() => app.quit())
  .catch((error) => {
    process.stderr.write(`ELECTRON_SQLITE_QA_FAILED ${String(error)}\n`);
    app.exit(1);
  });
