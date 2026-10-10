import Dexie from 'dexie';
import { openDb, SCHEMA_V1, type MeuPlanoDB } from '../../src/lib/db';

export const PDF_BYTES = new TextEncoder().encode('%PDF-1.4\n% teste MeuPlano\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n');

export function pdfBlob(): Blob {
  return new Blob([PDF_BYTES], { type: 'application/pdf' });
}

export async function bytes(b: Blob | undefined): Promise<number[]> {
  return b ? [...new Uint8Array(await b.arrayBuffer())] : [];
}

let n = 0;
export function uniqueName(prefix = 't') {
  return `${prefix}-${Date.now()}-${n++}`;
}

/** cria um banco exatamente como a v6 (schema 1) deixava, com arquivos dentro dos registros */
export async function makeV1(name: string) {
  const v1 = new Dexie(name);
  v1.version(1).stores(SCHEMA_V1);
  await v1.open();
  const now = '2026-10-01T10:00:00.000Z';
  await v1.table('tasks').bulkAdd([
    { title: 'Estudar Matemática', area: 'academica', status: 'hoje', priority: 'alta', createdAt: now },
    { title: 'Corrida no parque', area: 'saude', status: 'adiada', priority: 'media', postponedCount: 2, createdAt: now },
  ]);
  await v1.table('imprevistos').add({
    title: 'Reunião extra', area: 'profissional', type: 'Trabalho', date: '2026-09-30', start: '14:00', end: '16:30', durationMin: 150, postponedTasks: false, createdAt: now,
  });
  await v1.table('docs').bulkAdd([
    { name: 'Edital.pdf', type: 'Documento', storage: 'arquivo', blob: pdfBlob(), mime: 'application/pdf', size: PDF_BYTES.length, createdAt: now },
    { name: 'Pasta do concurso', type: 'Outro', storage: 'drive', driveUrl: 'https://drive.google.com/drive/folders/abc', createdAt: now },
  ]);
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  await v1.table('settings').put({
    id: 'me', name: 'Alexia', fullName: 'Alexia', scenario: 'noite', customPhoto: png, widgets: [], desiredFocus: {},
    city: { name: 'Rio', lat: 0, lon: 0 }, recurrenceThreshold: 3, phrase: '', accent: '#c8a97e',
  });
  v1.close();
}

export function open(name: string): MeuPlanoDB {
  return openDb(name);
}
