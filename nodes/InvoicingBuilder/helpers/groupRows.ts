import type { IDataObject } from 'n8n-workflow';

export interface RowGroup {
	groupKey: string;
	rows: IDataObject[];
	itemIndexes: number[];
}

/**
 * Pure function to group items by a column value.
 * If groupByColumn is empty or undefined, each row becomes its own group.
 * Preserves the original arrival order of groups and rows.
 */
export function groupRows(
	items: IDataObject[],
	groupByColumn?: string,
): RowGroup[] {
	if (!items || items.length === 0) {
		return [];
	}

	const trimmedColumn = groupByColumn?.trim();

	// If empty, each incoming item is its own invoice with one line
	if (!trimmedColumn) {
		return items.map((item, index) => ({
			groupKey: String(index),
			rows: [item],
			itemIndexes: [index],
		}));
	}

	const groupsMap = new Map<string, RowGroup>();

	items.forEach((item, index) => {
		const rawVal = item[trimmedColumn];
		const key = rawVal === null || rawVal === undefined ? '' : String(rawVal);

		const existing = groupsMap.get(key);
		if (existing) {
			existing.rows.push(item);
			existing.itemIndexes.push(index);
		} else {
			groupsMap.set(key, {
				groupKey: key,
				rows: [item],
				itemIndexes: [index],
			});
		}
	});

	return Array.from(groupsMap.values());
}
