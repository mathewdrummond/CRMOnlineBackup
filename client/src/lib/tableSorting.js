import { useMemo, useState } from "react";

export function getNextSortDirection(currentDirection) {
  if (currentDirection === "asc") return "desc";
  if (currentDirection === "desc") return null;
  return "asc";
}

export function getNextSortState(currentState, columnKey) {
  if (!columnKey) return { key: null, direction: null };
  if (currentState?.key !== columnKey) return { key: columnKey, direction: "asc" };
  const direction = getNextSortDirection(currentState.direction);
  return direction ? { key: columnKey, direction } : { key: null, direction: null };
}

function isEmptySortValue(value) {
  return value == null || String(value).trim() === "";
}

function numericValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const cleaned = String(value ?? "").replace(/[$,%\s,]/g, "");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateValue(value) {
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normaliseSortValue(value, type = "text") {
  if (isEmptySortValue(value)) return null;
  if (["number", "currency", "percent"].includes(type)) return numericValue(value);
  if (type === "date") return dateValue(value);
  return String(value).trim().toLocaleLowerCase();
}

export function compareSortValues(leftValue, rightValue, type = "text", direction = "asc") {
  const leftEmpty = isEmptySortValue(leftValue);
  const rightEmpty = isEmptySortValue(rightValue);
  if (leftEmpty && rightEmpty) return 0;
  if (leftEmpty) return 1;
  if (rightEmpty) return -1;

  const left = normaliseSortValue(leftValue, type);
  const right = normaliseSortValue(rightValue, type);
  const leftInvalid = left == null || (typeof left === "number" && !Number.isFinite(left));
  const rightInvalid = right == null || (typeof right === "number" && !Number.isFinite(right));
  if (leftInvalid && rightInvalid) return 0;
  if (leftInvalid) return 1;
  if (rightInvalid) return -1;

  let result = 0;
  if (typeof left === "number" && typeof right === "number") {
    result = left - right;
  } else {
    result = String(left).localeCompare(String(right), undefined, { sensitivity: "base", numeric: true });
  }
  return direction === "desc" ? -result : result;
}

export function sortRows(rows = [], sortState = {}, columnDefinitions = {}) {
  const { key, direction } = sortState || {};
  if (!key || !direction) return rows;
  const definition = columnDefinitions[key] || {};
  const accessor = typeof definition === "function" ? definition : definition.accessor;
  const type = typeof definition === "object" ? definition.type || "text" : "text";

  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftValue = accessor ? accessor(left.row) : left.row?.[key];
      const rightValue = accessor ? accessor(right.row) : right.row?.[key];
      const comparison = compareSortValues(leftValue, rightValue, type, direction);
      return comparison || left.index - right.index;
    })
    .map(({ row }) => row);
}

export function useSortableRows(rows = [], columnDefinitions = {}, initialSort = { key: null, direction: null }) {
  const [sortState, setSortState] = useState(initialSort);
  const requestSort = (columnKey) => {
    setSortState((current) => getNextSortState(current, columnKey));
  };
  const sortedRows = useMemo(
    () => sortRows(rows, sortState, columnDefinitions),
    [columnDefinitions, rows, sortState]
  );
  return { sortedRows, sortState, requestSort, setSortState };
}
