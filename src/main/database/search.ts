import type Database from 'better-sqlite3';

export function foldSearchText(value: unknown): string {
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-AR');
}

export function escapedLike(value: string): string {
  return `%${foldSearchText(value).replace(/[\\%_]/g, '\\$&')}%`;
}

export function registerSearchFunction(database: Database.Database): void {
  database.function('fold_text', { deterministic: true }, foldSearchText);
}
