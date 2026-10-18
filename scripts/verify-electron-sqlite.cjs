const Database = require('better-sqlite3');
const { app, BrowserWindow } = require('electron');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

app
  .whenReady()
  .then(async () => {
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

      const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
      });
      try {
        await pdfWindow.loadURL(
          `data:text/html;charset=utf-8,${encodeURIComponent('<!doctype html><meta charset="utf-8"><style>@page{size:A4}</style><h1>OCCHIALI</h1><p>Comprobante José Pérez — Ñ</p>')}`,
        );
        const pdf = await pdfWindow.webContents.printToPDF({
          printBackground: true,
          pageSize: 'A4',
          preferCSSPageSize: true,
        });
        if (pdf.length < 1_000 || pdf.subarray(0, 4).toString('ascii') !== '%PDF')
          throw new Error('Electron no generó un PDF válido.');
      } finally {
        pdfWindow.destroy();
      }

      process.stdout.write(
        `ELECTRON_SQLITE_QA_OK electron=${process.versions.electron} sqlite=${database.pragma('compile_options').length > 0} pdf=true\n`,
      );
    } finally {
      database.close();
      rmSync(temporaryDirectory, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 100,
      });
    }
  })
  .then(() => app.quit())
  .catch((error) => {
    process.stderr.write(`ELECTRON_SQLITE_QA_FAILED ${String(error)}\n`);
    app.exit(1);
  });
