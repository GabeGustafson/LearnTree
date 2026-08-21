import { useParams } from 'react-router';

export function TreePage() {
  const { treeId } = useParams();
  return <main className="p-6 text-sm text-neutral-500">Tree canvas for “{treeId}” arrives in M3.</main>;
}
