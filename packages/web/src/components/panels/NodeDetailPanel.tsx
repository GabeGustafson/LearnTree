import type { ModuleId, ResolvedForest, ResolvedNode, StatusMap } from '@learntree/core';
import { Markdown } from '../Markdown.tsx';
import { StatusCheckbox } from '../StatusCheckbox.tsx';

interface Props {
  node: ResolvedNode;
  forest: ResolvedForest;
  statuses: StatusMap;
  onToggle: (id: ModuleId, done: boolean) => void;
  onClose: () => void;
}

const TAG_STYLES: Record<string, string> = {
  book: 'bg-purple-50 text-purple-700',
  video: 'bg-red-50 text-red-700',
  website: 'bg-blue-50 text-blue-700',
  course: 'bg-teal-50 text-teal-700',
  paper: 'bg-slate-100 text-slate-700',
  exercise: 'bg-emerald-50 text-emerald-700',
  other: 'bg-neutral-100 text-neutral-600',
};

const DIFFICULTY_STYLES: Record<string, string> = {
  easy: 'text-emerald-700',
  medium: 'text-amber-700',
  hard: 'text-red-700',
};

export function NodeDetailPanel({ node, forest, statuses, onToggle, onClose }: Props) {
  return (
    <aside className="flex w-[400px] shrink-0 flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <h2 className="truncate text-sm font-semibold">{node.title}</h2>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          aria-label="Close panel"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {node.description !== undefined && <Markdown text={node.description} />}

        {node.categories.map((cat) => (
          <section key={cat.name} className="mt-4">
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              {cat.name}{' '}
              <span className="font-normal normal-case tracking-normal text-neutral-400">
                {countDone(cat.moduleIds, statuses)}/{new Set(cat.moduleIds).size}
              </span>
            </h3>
            <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
              {[...new Set(cat.moduleIds)].map((id) => {
                const module = forest.registry.get(id);
                if (module === undefined) return null;
                const { def } = module;
                const status = statuses.get(id) ?? { kind: 'none' as const };
                return (
                  // items-start + mt on the checkbox: rows grow with wrapped
                  // text while the checkbox stays on the first line.
                  <li key={id} className="flex items-start gap-2.5 px-2.5 py-2">
                    <span className="mt-[1px]">
                      <StatusCheckbox status={status} onToggle={(done) => onToggle(id, done)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-[13px] leading-snug text-neutral-900">
                        {def.url !== undefined ? (
                          <a
                            href={def.url}
                            target="_blank"
                            rel="noreferrer noopener"
                            className="hover:underline"
                          >
                            {def.title} <span className="text-neutral-400">↗</span>
                          </a>
                        ) : (
                          def.title
                        )}
                      </div>
                      {/* Section/exercise lists wrap in full — verbosity is
                          content here, never hidden behind an ellipsis. */}
                      {def.section !== undefined && (
                        <div className="mt-0.5 break-words text-[11px] leading-snug text-neutral-500">
                          {def.section}
                        </div>
                      )}
                    </div>
                    <span className="mt-[2px] flex shrink-0 items-center gap-1.5">
                      {def.weight !== 1 && (
                        <span className="text-[10px] text-neutral-400" title="Progress weight">
                          ×{def.weight}
                        </span>
                      )}
                      {def.tag !== undefined && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${TAG_STYLES[def.tag] ?? TAG_STYLES['other']}`}
                        >
                          {def.tag}
                        </span>
                      )}
                      {def.difficulty !== undefined && (
                        <span
                          className={`text-[10px] font-medium ${DIFFICULTY_STYLES[def.difficulty] ?? ''}`}
                        >
                          {def.difficulty}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </aside>
  );
}

function countDone(ids: ModuleId[], statuses: StatusMap): number {
  let n = 0;
  for (const id of new Set(ids)) {
    const s = statuses.get(id);
    if (s?.kind === 'done' || s?.kind === 'satisfied') n++;
  }
  return n;
}
