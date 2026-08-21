import { del, get, set } from 'idb-keyval';

export type ProviderChoice = 'sample' | 'local' | 'github';

const CHOICE_KEY = 'learntree.providerChoice';
const HANDLE_KEY = 'learntree.localDirHandle';
const HANDLE_ID_KEY = 'learntree.localDirCacheId';

export function getProviderChoice(): ProviderChoice {
  const v = localStorage.getItem(CHOICE_KEY);
  return v === 'local' || v === 'github' ? v : 'sample';
}

export function setProviderChoice(choice: ProviderChoice): void {
  localStorage.setItem(CHOICE_KEY, choice);
}

/** FileSystemDirectoryHandle is structured-cloneable → survives in IndexedDB. */
export async function saveLocalHandle(handle: FileSystemDirectoryHandle): Promise<string> {
  const cacheId = crypto.randomUUID();
  await set(HANDLE_KEY, handle);
  localStorage.setItem(HANDLE_ID_KEY, cacheId);
  return cacheId;
}

export async function loadLocalHandle(): Promise<{
  handle: FileSystemDirectoryHandle;
  cacheId: string;
} | null> {
  const handle = (await get(HANDLE_KEY)) as FileSystemDirectoryHandle | undefined;
  const cacheId = localStorage.getItem(HANDLE_ID_KEY);
  if (handle === undefined || cacheId === null) return null;
  return { handle, cacheId };
}

export async function clearLocalHandle(): Promise<void> {
  await del(HANDLE_KEY);
  localStorage.removeItem(HANDLE_ID_KEY);
}
