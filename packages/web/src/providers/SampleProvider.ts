import type { SourceFile } from '@learntree/core';
import forestYaml from '../sample/forest.yaml?raw';
import cppBasicsYaml from '../sample/trees/cpp-basics.yaml?raw';
import systemsYaml from '../sample/trees/systems.yaml?raw';
import type { StorageProvider, WriteResult } from './StorageProvider.ts';

const PROGRESS_KEY = 'learntree.sample.progress';

/**
 * Bundled demo forest. Progress lives in localStorage so the deployed app is
 * a working playground with zero setup.
 */
export class SampleProvider implements StorageProvider {
  readonly kind = 'sample';
  readonly label = 'Sample Forest (demo)';
  readonly capabilities = { write: true };

  loadForestFiles(): Promise<{ files: SourceFile[]; version: string | null }> {
    const files: SourceFile[] = [
      { path: 'forest.yaml', text: forestYaml },
      { path: 'trees/cpp-basics.yaml', text: cppBasicsYaml },
      { path: 'trees/systems.yaml', text: systemsYaml },
    ];
    return Promise.resolve({ files, version: 'sample' });
  }

  readProgress(): Promise<{ text: string | null; version: string | null }> {
    return Promise.resolve({ text: localStorage.getItem(PROGRESS_KEY), version: null });
  }

  writeProgress(text: string): Promise<WriteResult> {
    localStorage.setItem(PROGRESS_KEY, text);
    return Promise.resolve({ ok: true, version: null });
  }
}
