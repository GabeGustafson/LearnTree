import type { SourceFile } from '@learntree/core';
import { FOREST_FILE } from '@learntree/core';
import type { StorageProvider, WriteResult } from './StorageProvider.ts';

export function localFolderSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

async function readFileIfExists(
  dir: FileSystemDirectoryHandle,
  name: string,
): Promise<string | null> {
  try {
    const handle = await dir.getFileHandle(name);
    return await (await handle.getFile()).text();
  } catch {
    return null;
  }
}

/**
 * Chromium-only preview mode: point the app at a forest directory on disk —
 * the agent authoring loop (edit YAML → refocus the app → see the render).
 * No FS watch API exists, so freshness comes from refresh + focus reloads.
 */
export class LocalFolderProvider implements StorageProvider {
  readonly kind = 'local';
  readonly capabilities = { write: true };
  readonly label: string;
  readonly cacheKey: string;

  constructor(
    private readonly root: FileSystemDirectoryHandle,
    cacheId: string,
  ) {
    this.label = `folder: ${root.name}`;
    this.cacheKey = `local:${cacheId}`;
  }

  async loadForestFiles(): Promise<{ files: SourceFile[]; version: string | null }> {
    const files: SourceFile[] = [];
    const forestText = await readFileIfExists(this.root, FOREST_FILE);
    if (forestText !== null) files.push({ path: FOREST_FILE, text: forestText });

    const walk = async (dir: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
      const entries: Array<FileSystemDirectoryHandle | FileSystemFileHandle> = [];
      for await (const entry of dir.values()) entries.push(entry);
      entries.sort((a, b) => a.name.localeCompare(b.name));
      for (const entry of entries) {
        if (entry.kind === 'directory') {
          await walk(entry, `${prefix}${entry.name}/`);
        } else if (/\.ya?ml$/.test(entry.name)) {
          const text = await (await entry.getFile()).text();
          files.push({ path: `${prefix}${entry.name}`, text });
        }
      }
    };
    try {
      const trees = await this.root.getDirectoryHandle('trees');
      await walk(trees, 'trees/');
    } catch {
      // no trees/ directory yet — loadForest reports the empty forest
    }
    return { files, version: null };
  }

  async readProgress(): Promise<{ text: string | null; version: string | null }> {
    try {
      const dir = await this.root.getDirectoryHandle('.learntree');
      const handle = await dir.getFileHandle('progress.json');
      const file = await handle.getFile();
      return { text: await file.text(), version: String(file.lastModified) };
    } catch {
      return { text: null, version: null };
    }
  }

  async writeProgress(text: string): Promise<WriteResult> {
    try {
      const dir = await this.root.getDirectoryHandle('.learntree', { create: true });
      const handle = await dir.getFileHandle('progress.json', { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      const file = await handle.getFile();
      return { ok: true, version: String(file.lastModified) };
    } catch (err) {
      return { ok: false, reason: 'other', detail: String(err) };
    }
  }

  /** True when the persisted handle can be used without another prompt. */
  async hasPermission(): Promise<boolean> {
    // OPFS handles have no permission model — absence of the API means granted.
    if (typeof this.root.queryPermission !== 'function') return true;
    return (await this.root.queryPermission({ mode: 'readwrite' })) === 'granted';
  }

  /** Must be called from a user gesture. */
  async requestPermission(): Promise<boolean> {
    if (typeof this.root.requestPermission !== 'function') return true;
    return (await this.root.requestPermission({ mode: 'readwrite' })) === 'granted';
  }
}
