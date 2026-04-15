import { openDb } from '../db/connection.js';
import { defaultProdartsDir, importProdartsX01 } from './prodarts.js';

const db = openDb();
const summary = importProdartsX01({
  db,
  prodartsDir: process.env.PRODARTS_DIR || defaultProdartsDir(),
});

console.log(JSON.stringify(summary, null, 2));
