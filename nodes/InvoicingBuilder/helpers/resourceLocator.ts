/**
 * Helper utilities for n8n resourceLocator dynamic loading,
 * in-flight request deduplication, and record deduplication.
 */

const inflightRequests = new Map<string, Promise<unknown>>();

/**
 * Executes an async fetcher, ensuring concurrent identical calls share the same in-flight promise.
 */
export async function fetchWithInflightDeduplication<T>(
	key: string,
	fetcher: () => Promise<T>,
): Promise<T> {
	const existing = inflightRequests.get(key);
	if (existing) {
		return existing as Promise<T>;
	}

	const promise = fetcher().finally(() => {
		inflightRequests.delete(key);
	});

	inflightRequests.set(key, promise);
	return promise;
}

/**
 * Deduplicates an array of items by their `value` property, preserving order.
 */
export function deduplicateByValue<T extends { value: string | number | boolean }>(
	items: T[],
): T[] {
	const seen = new Set<string | number | boolean>();
	const results: T[] = [];
	for (const item of items) {
		if (item && item.value !== undefined && item.value !== null && !seen.has(item.value)) {
			seen.add(item.value);
			results.push(item);
		}
	}
	return results;
}

/**
 * Safely extracts a string ID value from a resourceLocator parameter or raw string/primitive.
 * Supports:
 *  - string ('6ba7b810-...')
 *  - resource locator object ({ mode: 'list', value: '6ba7b810-...' })
 *  - resource locator object ({ mode: 'id', value: '6ba7b810-...' })
 *  - null/undefined (returns fallback)
 */
export function extractResourceLocatorValue(
	val: unknown,
	fallback = '',
): string {
	if (val === null || val === undefined) {
		return fallback;
	}
	if (typeof val === 'string') {
		return val;
	}
	if (typeof val === 'object' && 'value' in val) {
		const inner = (val as { value: unknown }).value;
		if (inner === null || inner === undefined) {
			return fallback;
		}
		return typeof inner === 'string' ? inner : String(inner);
	}
	return String(val);
}

export interface RecursiveComponentItem {
	type?: string;
	properties?: {
		text?: string;
		invoiceNumber?: string;
		date?: string;
	};
	children?: RecursiveComponentItem[];
}

/**
 * Recursively traverses a component tree to find a component matching any of the specified types.
 */
export function findComponentRecursive(
	components: RecursiveComponentItem[] | undefined,
	types: string[],
): RecursiveComponentItem | undefined {
	if (!components || !Array.isArray(components)) return undefined;
	for (const comp of components) {
		if (comp?.type && types.includes(comp.type)) {
			return comp;
		}
		if (Array.isArray(comp?.children) && comp.children.length > 0) {
			const nested = findComponentRecursive(comp.children, types);
			if (nested) return nested;
		}
	}
	return undefined;
}

