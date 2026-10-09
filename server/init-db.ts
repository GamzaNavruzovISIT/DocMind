import { ensureSchema, getPool } from './db.js';

try {
  await ensureSchema();
  console.log('База данных готова: таблицы созданы (или уже существовали).');
} catch (err) {
  console.error('Не удалось подключиться к PostgreSQL:', (err as Error).message);
  console.error('Проверьте DATABASE_URL в .env (см. .env.example).');
  process.exitCode = 1;
} finally {
  await getPool().end();
}
