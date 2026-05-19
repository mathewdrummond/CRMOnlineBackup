import React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import FolderPickerModal from "./FolderPickerModal";

vi.mock("@/api/localApiClient", () => ({
  crmApi: {
    ai: {
      knowledgeRoots: vi.fn(async () => ({
        roots: [
          { label: "/joinerflow", path: "/volume1/joinerflow", selectable: true },
          { label: "/clients", path: "/volume1/clients", selectable: true },
        ],
      })),
      browseKnowledgeFolders: vi.fn(async ({ path, query }) => ({
        path,
        breadcrumbs: [{ label: "/joinerflow", path: "/volume1/joinerflow" }],
        entries: query === "archive"
          ? [{ name: "Archives", path: "/volume1/joinerflow/Archives", selectable: true, has_children: false }]
          : [
              { name: "Jobs", path: "/volume1/joinerflow/Jobs", selectable: true, has_children: true },
              { name: "Projects", path: "/volume1/joinerflow/Projects", selectable: true, has_children: false },
            ],
        total: 2,
        has_more: false,
      })),
    },
  },
}));

describe("FolderPickerModal", () => {
  test("loads roots, supports keyboard folder selection, and confirms the selected path", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <FolderPickerModal
        open
        onOpenChange={() => {}}
        indexedPaths={[]}
        onSelect={onSelect}
      />
    );

    const tree = await screen.findByRole("tree", { name: /nas folder browser/i });
    expect(within(tree).getByRole("treeitem", { name: /clients/i })).toBeInTheDocument();
    await user.click(within(tree).getByRole("button", { name: /open \/joinerflow/i }));
    const jobs = await within(tree).findByRole("treeitem", { name: /jobs/i });
    jobs.focus();
    await user.keyboard("{Enter}");
    await user.click(screen.getByRole("button", { name: /use selected folder/i }));

    expect(onSelect).toHaveBeenCalledWith("/volume1/joinerflow/Jobs");
  });

  test("debounces filtering and blocks duplicate indexed paths", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <FolderPickerModal
        open
        onOpenChange={() => {}}
        indexedPaths={["/volume1/joinerflow/Archives"]}
        onSelect={onSelect}
      />
    );

    await user.click(await screen.findByRole("button", { name: /open \/joinerflow/i }));
    await user.type(await screen.findByLabelText(/filter folders/i), "archive");
    await waitFor(() => expect(screen.getByText("Archives")).toBeInTheDocument());
    await user.click(screen.getByText("Archives"));

    expect(screen.getByText(/folder already indexed/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /use selected folder/i })).toBeDisabled();
    expect(onSelect).not.toHaveBeenCalled();
  });
});
