/**
 * In-process registry for book-source adapters.
 * UI and library code should only talk to this layer — never a named vendor API.
 */

import type { BookSourceAdapter, BookSourceDescriptor } from "./types";

const adapters = new Map<string, BookSourceAdapter>();

export function registerBookSource(adapter: BookSourceAdapter): void {
  if (!adapter?.id?.trim()) {
    throw new Error("BookSourceAdapter.id is required");
  }
  adapters.set(adapter.id, adapter);
}

export function unregisterBookSource(id: string): boolean {
  return adapters.delete(id);
}

export function getBookSource(id: string): BookSourceAdapter | undefined {
  return adapters.get(id);
}

export function listBookSources(): BookSourceDescriptor[] {
  return [...adapters.values()].map(({ id, name, description, capabilities }) => ({
    id,
    name,
    description,
    capabilities,
  }));
}

/** Test / teardown helper */
export function clearBookSources(): void {
  adapters.clear();
}
