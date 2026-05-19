import * as SQLite from 'expo-sqlite';
import { Achievement, BodyMeasurement, BodyProfile, Exercise, ProgressPhoto, Routine, SetLog } from '../domain/types';
import { seedAchievements, seedExercises, seedLogs, seedRoutines } from './seed';

type StoredRow = {
  id: string;
  data: string;
};

type TransactionExecutor = {
  runAsync(source: string, ...params: SQLite.SQLiteVariadicBindParams): Promise<SQLite.SQLiteRunResult>;
};

export type PersistedData = {
  exercises: Exercise[];
  routines: Routine[];
  logs: SetLog[];
  achievements: Achievement[];
  bodyProfile: BodyProfile | null;
  bodyMeasurements: BodyMeasurement[];
  progressPhotos: ProgressPhoto[];
};

const DATABASE_NAME = 'gymetric.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let saveQueue: Promise<void> = Promise.resolve();

async function getDatabase() {
  if (databasePromise) {
    return databasePromise;
  }

  databasePromise = openAndPrepareDatabase();
  return databasePromise;
}

async function openAndPrepareDatabase() {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.runAsync('PRAGMA journal_mode = WAL');
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS set_logs (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS body_profile (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS body_measurements (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS progress_photos (
      id TEXT PRIMARY KEY NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  await db.runAsync(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    )
  `);
  return db;
}

function parseRows<T>(rows: StoredRow[]): T[] {
  return rows.map((row) => JSON.parse(row.data) as T);
}

async function loadTable<T>(db: SQLite.SQLiteDatabase, tableName: string) {
  const rows = await db.getAllAsync<StoredRow>(`SELECT id, data FROM ${tableName} ORDER BY updated_at DESC`);
  return parseRows<T>(rows);
}

async function replaceTableInTransaction<T extends { id: string }>(
  db: TransactionExecutor,
  tableName: string,
  records: T[],
  now: number,
) {
  await db.runAsync(`DELETE FROM ${tableName}`);
  for (const record of records) {
    await db.runAsync(
      `INSERT INTO ${tableName} (id, data, updated_at) VALUES (?, ?, ?)`,
      record.id,
      JSON.stringify(record),
      now,
    );
  }
}

async function seedDatabase(db: SQLite.SQLiteDatabase) {
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await replaceTableInTransaction(txn, 'exercises', seedExercises, now);
    await replaceTableInTransaction(txn, 'routines', seedRoutines, now);
    await replaceTableInTransaction(txn, 'set_logs', seedLogs, now);
    await replaceTableInTransaction(txn, 'achievements', seedAchievements, now);
    await replaceTableInTransaction(txn, 'body_measurements', [], now);
    await replaceTableInTransaction(txn, 'progress_photos', [], now);
    await txn.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', 'seeded', 'true');
  });
}

export async function loadPersistedData(): Promise<PersistedData> {
  const db = await getDatabase();
  const meta = await db.getFirstAsync<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', 'seeded');

  if (!meta) {
    await seedDatabase(db);
  }

  const data = {
    exercises: await loadTable<Exercise>(db, 'exercises'),
    routines: await loadTable<Routine>(db, 'routines'),
    logs: await loadTable<SetLog>(db, 'set_logs'),
    achievements: await loadTable<Achievement>(db, 'achievements'),
    bodyProfile: (await loadTable<BodyProfile>(db, 'body_profile'))[0] ?? null,
    bodyMeasurements: await loadTable<BodyMeasurement>(db, 'body_measurements'),
    progressPhotos: await loadTable<ProgressPhoto>(db, 'progress_photos'),
  };

  if (data.routines.length > 0 && data.exercises.length === 0) {
    const repairedData = { ...data, exercises: seedExercises };
    await savePersistedData(repairedData);
    return repairedData;
  }

  return data;
}

export async function savePersistedData(data: PersistedData) {
  const snapshot = {
    exercises: [...data.exercises],
    routines: [...data.routines],
    logs: [...data.logs],
    achievements: [...data.achievements],
    bodyProfile: data.bodyProfile ? { ...data.bodyProfile } : null,
    bodyMeasurements: [...data.bodyMeasurements],
    progressPhotos: [...data.progressPhotos],
  };

  saveQueue = saveQueue
    .catch(() => {
      // Keep the queue alive even if the previous write failed.
    })
    .then(() => writePersistedData(snapshot));

  return saveQueue;
}

async function writePersistedData(data: PersistedData) {
  const db = await getDatabase();
  const now = Date.now();
  await db.withExclusiveTransactionAsync(async (txn) => {
    await replaceTableInTransaction(txn, 'exercises', data.exercises, now);
    await replaceTableInTransaction(txn, 'routines', data.routines, now);
    await replaceTableInTransaction(txn, 'set_logs', data.logs, now);
    await replaceTableInTransaction(txn, 'achievements', data.achievements, now);
    await replaceTableInTransaction(txn, 'body_profile', data.bodyProfile ? [data.bodyProfile] : [], now);
    await replaceTableInTransaction(txn, 'body_measurements', data.bodyMeasurements, now);
    await replaceTableInTransaction(txn, 'progress_photos', data.progressPhotos, now);
    await txn.runAsync('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)', 'seeded', 'true');
  });
}
