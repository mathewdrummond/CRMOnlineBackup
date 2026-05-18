export const DOCUMENT_EDITOR_SECTION_DEFAULTS = {
  documentSetup: true,
  clientDetails: true,
  jobDetails: true,
  lineItems: true,
  pricing: true,
  paymentTerms: true,
  disclaimer: false,
  termsAndConditions: false,
};

export function normaliseDocumentEditorSections(savedState) {
  return {
    ...DOCUMENT_EDITOR_SECTION_DEFAULTS,
    ...(savedState && typeof savedState === "object" ? savedState : {}),
  };
}

export function getDocumentEditorSectionStorageKey({ quoteId, documentType }) {
  return `quote-document-editor-sections:${quoteId || "new"}:${documentType || "contract"}`;
}

export function loadDocumentEditorSections(storage, options) {
  const fallback = normaliseDocumentEditorSections();
  if (!storage) {
    return fallback;
  }
  try {
    const rawValue = storage.getItem(getDocumentEditorSectionStorageKey(options));
    if (!rawValue) {
      return fallback;
    }
    return normaliseDocumentEditorSections(JSON.parse(rawValue));
  } catch {
    return fallback;
  }
}

export function saveDocumentEditorSections(storage, options, sections) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(
      getDocumentEditorSectionStorageKey(options),
      JSON.stringify(normaliseDocumentEditorSections(sections))
    );
  } catch {
    // Best effort only. The editor still works even if persistence is unavailable.
  }
}
