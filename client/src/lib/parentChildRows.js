import { sortRows } from "@/lib/tableSorting";

function defaultGetId(row) {
  return row?.id ? String(row.id) : "";
}

function defaultGetParentId(row) {
  return row?.parent_line_item_id || row?.parent_pricing_quote_item_id
    ? String(row.parent_line_item_id || row.parent_pricing_quote_item_id)
    : "";
}

export function groupRowsWithChildren(
  rows = [],
  {
    sortState = { key: null, direction: null },
    columnDefinitions = {},
    getId = defaultGetId,
    getParentId = defaultGetParentId,
    childSort = (left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0),
  } = {},
) {
  const rowList = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const rowById = new Map(rowList.map((row) => [getId(row), row]));
  const childrenByParentId = new Map();
  const roots = [];

  rowList.forEach((row) => {
    const parentId = getParentId(row);
    if (parentId && rowById.has(parentId)) {
      childrenByParentId.set(parentId, [...(childrenByParentId.get(parentId) || []), row]);
      return;
    }
    if (!parentId) {
      roots.push(row);
    }
  });

  const sortedRoots = sortRows(roots, sortState, columnDefinitions);
  const ordered = [];

  const appendRow = (row) => {
    ordered.push(row);
    const children = [...(childrenByParentId.get(getId(row)) || [])].sort(childSort);
    children.forEach((child) => appendRow(child));
  };

  sortedRoots.forEach((row) => appendRow(row));
  return ordered;
}
