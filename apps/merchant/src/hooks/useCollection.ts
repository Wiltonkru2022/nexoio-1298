import { useCallback, useState } from 'react';
export type StoredItem = { id: string; createdAt: string } & Record<string, string>;
export function useCollection(key: string) {
  const storageKey = `nexoio:${key}:v1`;
  const [items, setItems] = useState<StoredItem[]>(() => { try { return JSON.parse(localStorage.getItem(storageKey) ?? '[]') as StoredItem[]; } catch { return []; } });
  const add = useCallback((data: Record<string, string>) => setItems((current) => { const next = [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), ...data }, ...current]; localStorage.setItem(storageKey, JSON.stringify(next)); return next; }), [storageKey]);
  const remove = useCallback((id: string) => setItems((current) => { const next = current.filter((item) => item.id !== id); localStorage.setItem(storageKey, JSON.stringify(next)); return next; }), [storageKey]);
  return { items, add, remove };
}
export function formValues(event: React.FormEvent<HTMLFormElement>): Record<string, string> { event.preventDefault(); return Object.fromEntries([...new FormData(event.currentTarget).entries()].map(([key, value]) => [key, String(value)])); }
