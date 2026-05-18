import {
  buildContactActivityTimeline,
  buildMergedContactPayload,
  getContactDuplicateMap,
  getContactDisplayName,
  getContactHealth,
} from "./contactHelpers";

describe("contactHelpers", () => {
  test("getContactDuplicateMap finds duplicates by email and company/name", () => {
    const contacts = [
      { id: "contact-1", first_name: "Jane", last_name: "Fletcher", company_name: "Harbour Homes", email: "jane@example.com" },
      { id: "contact-2", first_name: "Jane", last_name: "Fletcher", company_name: "Harbour Homes", email: "" },
      { id: "contact-3", first_name: "Sophia", last_name: "Ngata", company_name: "Atelier", email: "sophia@example.com" },
      { id: "contact-4", first_name: "Different", last_name: "Person", company_name: "Elsewhere", email: "jane@example.com" },
    ];

    const duplicateMap = getContactDuplicateMap(contacts);

    expect(duplicateMap.get("contact-1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "contact-2" }),
        expect.objectContaining({ id: "contact-4" }),
      ])
    );
  });

  test("buildMergedContactPayload preserves primary values and merges arrays", () => {
    const merged = buildMergedContactPayload(
      {
        id: "contact-1",
        first_name: "Jane",
        last_name: "Fletcher",
        company_name: "Harbour Homes",
        email: "jane@example.com",
        emails: ["jane@example.com"],
        phone: "021 111 1111",
        phones: ["021 111 1111"],
        tags: ["builder"],
        notes: "Primary note",
        status: "active",
      },
      {
        id: "contact-2",
        first_name: "Jane",
        last_name: "Fletcher",
        company_name: "Harbour Homes",
        email: "alternate@example.com",
        emails: ["alternate@example.com"],
        phone: "09 555 0101",
        phones: ["09 555 0101"],
        tags: ["priority"],
        notes: "Secondary note",
        status: "archived",
      }
    );

    expect(merged.email).toBe("jane@example.com");
    expect(merged.emails).toEqual(["jane@example.com", "alternate@example.com"]);
    expect(merged.phones).toEqual(["021 111 1111", "09 555 0101"]);
    expect(merged.tags).toEqual(["builder", "priority"]);
    expect(merged.notes).toContain("Primary note");
    expect(merged.notes).toContain("Secondary note");
  });

  test("buildContactActivityTimeline sorts newest first", () => {
    const events = buildContactActivityTimeline({
      interactions: [{ id: "interaction-1", type: "call", subject: "Latest call", summary: "Discussed scope", interaction_date: "2026-04-05T10:00:00.000Z" }],
      notes: [{ id: "note-1", content: "Older note", created_date: "2026-04-04T10:00:00.000Z" }],
      tasks: [{ id: "task-1", title: "Call back", status: "pending", due_date: "2026-04-03" }],
      leads: [],
      quotes: [],
      jobs: [],
      attachments: [{ id: "attachment-1", name: "Brief.pdf", mime_type: "application/pdf", created_date: "2026-04-02T10:00:00.000Z", url: "/filesystem/brief.pdf" }],
    });

    expect(events[0].title).toBe("Latest call");
    expect(events.some((event) => event.kind === "file" && event.title === "Brief.pdf")).toBe(true);
  });

  test("getContactHealth marks overdue follow-up as needing attention", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(getContactHealth({ next_follow_up_date: yesterday, status: "active" }, [])).toEqual({
      label: "Needs attention",
      color: "red",
    });
  });

  test("getContactDisplayName falls back cleanly", () => {
    expect(getContactDisplayName({ first_name: "Jane", last_name: "Fletcher" })).toBe("Jane Fletcher");
    expect(getContactDisplayName({ email: "casey@example.test" })).toBe("casey@example.test");
  });
});
