import type { Project, Point } from './models';

export const DATABASE_NAME = 'smart-home';
export const DATABASE_VERSION = 1;
export const PROJECT_STORE = 'projects';
const METADATA_STORE = 'metadata';
const LEGACY_KEY = 'smart-home.projects.v1';
const MIGRATION_KEY = 'local-storage-v1-imported';
const copy = <T>(value: T): T => structuredClone(value);
const points = (value: unknown): value is Point[] => Array.isArray(value) &&
  value.length <= 10000 && value.every(p => p && Number.isFinite(p.x) && Number.isFinite(p.y));

export function isProject(value: unknown): value is Project {
  if (!value || typeof value !== 'object') return false;
  const p = value as Project;
  return typeof p.id === 'string' && p.id.length > 0 && typeof p.name === 'string' &&
    points(p.points) && Array.isArray(p.contours) && p.contours.length <= 2000 &&
    p.contours.every(c => c && typeof c.id === 'string' && typeof c.name === 'string' &&
      points(c.points) && c.points.length >= 3 &&
      (c.color === undefined || /^#[0-9a-f]{6}$/i.test(c.color)));
}

export function decodeProjects(raw: string | null): Project[] {
  if (!raw) return [];
  const data: unknown = JSON.parse(raw);
  if (!data || typeof data !== 'object') throw new Error('Unknown project format');
  const payload = data as { format?: string; version?: number; projects?: unknown[] };
  if (payload.format !== 'smart-home' || payload.version !== 1 ||
    !Array.isArray(payload.projects) || !payload.projects.every(isProject)) {
    throw new Error('Invalid project document');
  }
  return payload.projects;
}

/** Browser-local project persistence. A resolved write means the transaction committed. */
export class ProjectsRepository {
  private connection?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    if (this.connection) return this.connection;
    const connection = new Promise<IDBDatabase>((resolve, reject) => {
      if (!globalThis.indexedDB) {
        reject(new Error('IndexedDB недоступна в этом браузере.'));
        return;
      }
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      let rejected = false;
      const fail = (message: string) => { rejected = true; reject(new Error(message)); };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
        if (!db.objectStoreNames.contains(METADATA_STORE)) db.createObjectStore(METADATA_STORE);
      };
      request.onerror = () => fail('Не удалось открыть IndexedDB. Проверьте доступ к данным сайта.');
      request.onblocked = () => fail('Закройте другие вкладки Smart Home и повторите сохранение.');
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) { db.close(); return; }
        db.onversionchange = () => { db.close(); this.connection = undefined; };
        resolve(db);
      };
    });
    this.connection = connection;
    void connection.catch(() => { if (this.connection === connection) this.connection = undefined; });
    return connection;
  }

  private async read<T>(storeName: string, key?: string): Promise<T> {
    const db = await this.open();
    return new Promise<T>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = key === undefined ? store.getAll() : store.get(key);
      let result: T;
      request.onsuccess = () => { result = request.result as T; };
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(tx.error ?? new Error('Не удалось прочитать проекты из IndexedDB.'));
      tx.onerror = () => { /* The transaction abort handler reports the failure. */ };
    });
  }

  async list(): Promise<Project[]> {
    const records = await this.read<unknown[]>(PROJECT_STORE);
    if (!records.every(isProject)) throw new Error('Сохранённые данные повреждены. Исходные записи не изменены.');
    return copy(records);
  }

  async get(id: string): Promise<Project | undefined> {
    const record = await this.read<unknown>(PROJECT_STORE, id);
    if (record === undefined) return undefined;
    if (!isProject(record)) throw new Error('Не удалось прочитать сохранённый проект.');
    return copy(record);
  }

  async save(project: Project): Promise<Project> {
    if (!isProject(project)) throw new Error('Некорректные данные проекта. Сохранение отменено.');
    const name = project.name.trim();
    if (!name || name.length > 120) throw new Error('Введите название проекта: от 1 до 120 символов.');
    const record = copy({ ...project, name, updatedAt: new Date().toISOString() });
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(PROJECT_STORE, 'readwrite');
      // Success of put alone is not sufficient: quota/commit failures may still abort the transaction.
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Запись в IndexedDB отменена. Проект не сохранён.'));
      tx.onerror = () => { /* Let IndexedDB abort atomically. */ };
      tx.objectStore(PROJECT_STORE).put(record);
    });
    return copy(record);
  }

  /** Import legacy saves once, without deleting or overwriting the source. */
  async migrateLegacy(): Promise<void> {
    if (await this.read<boolean | undefined>(METADATA_STORE, MIGRATION_KEY)) return;
    let raw: string | null;
    try { raw = localStorage.getItem(LEGACY_KEY); }
    catch { return; } // IndexedDB remains usable even when legacy localStorage is blocked.
    const legacy = decodeProjects(raw);
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([PROJECT_STORE, METADATA_STORE], 'readwrite');
      const store = tx.objectStore(PROJECT_STORE);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('Не удалось перенести старые сохранения. Исходные данные не удалены.'));
      tx.onerror = () => {};
      for (const project of legacy) {
        const request = store.get(project.id);
        request.onsuccess = () => {
          if (request.result === undefined) store.put(copy(project));
        };
      }
      tx.objectStore(METADATA_STORE).put(true, MIGRATION_KEY);
    });
  }
}
