import type { StudioProject } from './model.ts';

export interface SavedProject { project: StudioProject; audio: Blob; updated: number }
const DB = 'reclone-chart-studio';

// Unlike optional preference storage, saving a user's authored chart must report failures.
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'project.id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveProject(project: StudioProject, audio: Blob): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').put({ project, audio, updated: Date.now() } satisfies SavedProject);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Saving was interrupted'));
    });
  } finally { db.close(); }
}

export async function listProjects(): Promise<SavedProject[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').getAll();
      request.onsuccess = () => resolve((request.result as SavedProject[]).sort((a, b) => b.updated - a.updated));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function readProject(id: string): Promise<SavedProject> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const request = db.transaction('projects').objectStore('projects').get(id);
      request.onsuccess = () => request.result ? resolve(request.result as SavedProject) : reject(new Error('This studio project no longer exists.'));
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}

export async function deleteProject(id: string): Promise<void> {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('projects', 'readwrite');
      tx.objectStore('projects').delete(id);
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
