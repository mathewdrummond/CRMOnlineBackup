import React from "react";
import { render, screen } from "@testing-library/react";
import ReviewStateBadge, { getQuoteItemReviewState, getReviewStateMeta, getReviewStateRowClass } from "./ReviewStateBadge";

describe("ReviewStateBadge", () => {
  test("renders standard visual states consistently", () => {
    render(<ReviewStateBadge state="missing_cost" />);

    expect(screen.getByText("Missing Cost")).toBeInTheDocument();
    expect(getReviewStateMeta("missing_cost").color).toBe("red");
    expect(getReviewStateRowClass("missing_cost")).toContain("#eedbd7");
  });

  test("detects missing cost and imported quote line items", () => {
    expect(getQuoteItemReviewState({ unit_cost: 0, total: 100 })).toBe("missing_cost");
    expect(getQuoteItemReviewState({ import_id: "import-1", unit_cost: 25, total: 50 })).toBe("imported");
    expect(getQuoteItemReviewState({ source: "triggered_auto_inclusion" })).toBe("auto_added");
  });
});
