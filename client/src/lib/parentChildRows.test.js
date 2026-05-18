import { describe, expect, test } from "vitest";

import { groupRowsWithChildren } from "./parentChildRows";

const columns = {
  description: { accessor: (row) => row.description, type: "text" },
  qty: { accessor: (row) => row.quantity, type: "number" },
};

describe("groupRowsWithChildren", () => {
  test("places triggered inclusions directly below their parent", () => {
    const rows = [
      { id: "parent-1", description: "MERIVO E", quantity: 5 },
      { id: "child-1", description: "Fixing screws", parent_pricing_quote_item_id: "parent-1", sort_order: 1 },
      { id: "parent-2", description: "LEGRABOX", quantity: 2 },
    ];

    expect(groupRowsWithChildren(rows, { columnDefinitions: columns }).map((row) => row.id)).toEqual([
      "parent-1",
      "child-1",
      "parent-2",
    ]);
  });

  test("keeps multiple children grouped under the same parent", () => {
    const rows = [
      { id: "parent-1", description: "Guide", quantity: 5 },
      { id: "child-2", description: "Caps", parent_pricing_quote_item_id: "parent-1", sort_order: 2 },
      { id: "child-1", description: "Screws", parent_pricing_quote_item_id: "parent-1", sort_order: 1 },
    ];

    expect(groupRowsWithChildren(rows, { columnDefinitions: columns }).map((row) => row.id)).toEqual([
      "parent-1",
      "child-1",
      "child-2",
    ]);
  });

  test("sorting moves the parent group together", () => {
    const rows = [
      { id: "parent-b", description: "B item", quantity: 1 },
      { id: "child-b", description: "B child", parent_pricing_quote_item_id: "parent-b", sort_order: 1 },
      { id: "parent-a", description: "A item", quantity: 1 },
      { id: "child-a", description: "A child", parent_pricing_quote_item_id: "parent-a", sort_order: 1 },
    ];

    expect(groupRowsWithChildren(rows, {
      sortState: { key: "description", direction: "asc" },
      columnDefinitions: columns,
    }).map((row) => row.id)).toEqual([
      "parent-a",
      "child-a",
      "parent-b",
      "child-b",
    ]);
  });

  test("does not orphan child rows when the parent is filtered out", () => {
    const rows = [
      { id: "child-1", description: "Orphan child", parent_pricing_quote_item_id: "missing-parent", sort_order: 1 },
      { id: "parent-1", description: "Shown parent", quantity: 1 },
      { id: "child-2", description: "Shown child", parent_pricing_quote_item_id: "parent-1", sort_order: 1 },
    ];

    expect(groupRowsWithChildren(rows, { columnDefinitions: columns }).map((row) => row.id)).toEqual([
      "parent-1",
      "child-2",
    ]);
  });
});
