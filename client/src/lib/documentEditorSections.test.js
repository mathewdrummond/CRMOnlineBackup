import { describe, expect, it, vi } from "vitest";

import {
  DOCUMENT_EDITOR_SECTION_DEFAULTS,
  getDocumentEditorSectionStorageKey,
  loadDocumentEditorSections,
  normaliseDocumentEditorSections,
  saveDocumentEditorSections,
} from "./documentEditorSections";

describe("documentEditorSections", () => {
  it("defaults sections below payment terms to collapsed in the editor", () => {
    expect(DOCUMENT_EDITOR_SECTION_DEFAULTS.paymentTerms).toBe(true);
    expect(DOCUMENT_EDITOR_SECTION_DEFAULTS.disclaimer).toBe(false);
    expect(DOCUMENT_EDITOR_SECTION_DEFAULTS.termsAndConditions).toBe(false);
  });

  it("merges saved state onto the editor defaults", () => {
    expect(normaliseDocumentEditorSections({ disclaimer: true })).toEqual({
      ...DOCUMENT_EDITOR_SECTION_DEFAULTS,
      disclaimer: true,
    });
  });

  it("persists and reloads section state per quote and document type", () => {
    const storage = {
      getItem: vi.fn(),
      setItem: vi.fn(),
    };

    saveDocumentEditorSections(storage, { quoteId: "quote-1", documentType: "contract" }, { disclaimer: true });

    expect(storage.setItem).toHaveBeenCalledWith(
      getDocumentEditorSectionStorageKey({ quoteId: "quote-1", documentType: "contract" }),
      JSON.stringify({
        ...DOCUMENT_EDITOR_SECTION_DEFAULTS,
        disclaimer: true,
      })
    );

    storage.getItem.mockReturnValueOnce(JSON.stringify({ termsAndConditions: true }));

    expect(loadDocumentEditorSections(storage, { quoteId: "quote-1", documentType: "contract" })).toEqual({
      ...DOCUMENT_EDITOR_SECTION_DEFAULTS,
      termsAndConditions: true,
    });
  });
});
