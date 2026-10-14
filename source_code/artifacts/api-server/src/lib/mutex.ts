/** Tiny in-process keyed mutex — serialises check-then-insert sequences (e.g. booking a hall). */
const chains = new Map<string, Promise<unknown>>();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((r) => (release = r));
  const chained = prev.then(() => current);
  chains.set(key, chained);
  await prev.catch(() => undefined);
  try {
    return await fn();
  } finally {
    release();
    if (chains.get(key) === chained) chains.delete(key);
  }
}
