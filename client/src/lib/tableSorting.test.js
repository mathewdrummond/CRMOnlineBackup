import { describe, expect, it } from "vitest";
import { compareSortValues, getNextSortState, sortRows } from "./tableSorting";

describe("tableSorting", () => {
  it("cycles sort state through ascending, descending, and unsorted", () => {
    expect(getNextSortState({}, "name")).toEqual({ key: "name", direction: "asc" });
    expect(getNextSortState({ key: "name", direction: "asc" }, "name")).toEqual({ key: "name", direction: "desc" });
    expect(getNextSortState({ key: "name", direction: "desc" }, "name")).toEqual({ key: null, direction: null });
  });

  it("sorts text with natural numeric ordering", () => {
    const rows = [{ name: "Item 10" }, { name: "Item 2" }, { name: "Item 1" }];
    expect(sortRows(rows, { key: "name", direction: "asc" }, { name: { type: "text" } }).map((row) => row.name)).toEqual(["Item 1", "Item 2", "Item 10"]);
  });

  it("sorts number, currency, percent, and date values", () => {
    const rows = [
      { id: "b", qty: "12", cost: "$1,200.00", markup: "30%", date: "2026-05-04" },
      { id: "a", qty: "2", cost: "$55.00", markup: "5%", date: "2026-01-10" },
    ];
    expect(sortRows(rows, { key: "qty", direction: "asc" }, { qty: { type: "number" } }).map((row) => row.id)).toEqual(["a", "b"]);
    expect(sortRows(rows, { key: "cost", direction: "asc" }, { cost: { type: "currency" } }).map((row) => row.id)).toEqual(["a", "b"]);
    expect(sortRows(rows, { key: "markup", direction: "desc" }, { markup: { type: "percent" } }).map((row) => row.id)).toEqual(["b", "a"]);
    expect(sortRows(rows, { key: "date", direction: "asc" }, { date: { type: "date" } }).map((row) => row.id)).toEqual(["a", "b"]);
  });

  it("keeps empty values last in both directions", () => {
    expect(compareSortValues("", "A", "text", "asc")).toBeGreaterThan(0);
    expect(compareSortValues("", "A", "text", "desc")).toBeGreaterThan(0);
    const rows = [{ name: "" }, { name: "B" }, { name: "A" }];
    expect(sortRows(rows, { key: "name", direction: "desc" }, { name: { type: "text" } }).map((row) => row.name)).toEqual(["B", "A", ""]);
  });
});
