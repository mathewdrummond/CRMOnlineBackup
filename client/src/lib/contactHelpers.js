export const CONTACT_TYPE_OPTIONS = [
  { value: "client", label: "Client" },
  { value: "builder", label: "Builder" },
  { value: "designer", label: "Designer" },
  { value: "architect", label: "Architect" },
  { value: "supplier", label: "Supplier" },
  { value: "subcontractor", label: "Subcontractor" },
];

export const CONTACT_TYPE_COLORS = {
  client: "blue",
  builder: "amber",
  designer: "purple",
  architect: "cyan",
  supplier: "teal",
  subcontractor: "orange",
};

export const CONTACT_RELATIONSHIP_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "active", label: "Active" },
  { value: "customer", label: "Customer" },
  { value: "champion", label: "Champion" },
  { value: "inactive", label: "Inactive" },
];

export const CONTACT_RELATIONSHIP_COLORS = {
  new: "cyan",
  active: "blue",
  customer: "emerald",
  champion: "purple",
  inactive: "slate",
};

export const CONTACT_PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"];
export const CONTACT_PREFERRED_CHANNEL_OPTIONS = ["email", "phone", "mobile", "meeting", "text"];
export const CONTACT_TASK_TYPES = ["follow_up", "call", "email", "meeting", "proposal", "admin", "other"];
export const CONTACT_INTERACTION_TYPES = ["call", "email", "meeting", "site_visit", "message", "note"];

export const EMPTY_CONTACT_FORM = {
  type: "client",
  status: "active",
  relationship_status: "active",
  priority: "medium",
  honorific_prefix: "",
  first_name: "",
  middle_name: "",
  last_name: "",
  honorific_suffix: "",
  full_name: "",
  title: "",
  role: "",
  owner: "",
  preferred_channel: "email",
  company_id: "",
  company_name: "",
  is_primary: false,
  tags_text: "",
  myob_card_id: "",
  myob_record_id: "",
  email: "",
  extra_emails_text: "",
  phone: "",
  extra_phones_text: "",
  mobile: "",
  extra_mobiles_text: "",
  website: "",
  extra_websites_text: "",
  birthday: "",
  last_contacted_date: "",
  next_follow_up_date: "",
  address: "",
  city: "",
  state: "",
  postal_code: "",
  country: "",
  po_box: "",
  notes: "",
  source_format: "",
  vcard_raw: "",
  vcard_fields: null,
};

export const EMPTY_COMPANY_FORM = {
  name: "",
  type: "client",
  myob_card_id: "",
  myob_record_id: "",
  email: "",
  phone: "",
};

export function normalizeCompanyName(name) {
  return String(name || "").trim().toLowerCase();
}

export function dedupeList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [values])
      .flat()
      .map((value) => String(value || "").trim())
      .filter(Boolean)
  )];
}

export function parseListText(value) {
  return dedupeList(String(value || "").split(/\r?\n|,/));
}

export function formatListText(values, primaryValue = "") {
  const primary = String(primaryValue || "").trim();
  return dedupeList(Array.isArray(values) ? values : [])
    .filter((value) => value !== primary)
    .join("\n");
}

export function parseTags(value) {
  return dedupeList(
    Array.isArray(value)
      ? value
      : String(value || "").split(/\r?\n|,/)
  );
}

export function getContactDisplayName(contact) {
  return [contact?.first_name, contact?.middle_name, contact?.last_name].filter(Boolean).join(" ")
    || String(contact?.full_name || "").trim()
    || String(contact?.email || "").trim()
    || "Contact";
}

export function buildContactKey(contact) {
  const email = String(contact?.email || "").trim().toLowerCase();
  if (email) {
    return `email:${email}`;
  }

  return `name:${String(contact?.first_name || "").trim().toLowerCase()}|${String(contact?.last_name || "").trim().toLowerCase()}|${normalizeCompanyName(contact?.company_name)}`;
}

export function mapContactToForm(contact = {}) {
  return {
    ...EMPTY_CONTACT_FORM,
    ...contact,
    type: CONTACT_TYPE_OPTIONS.some((option) => option.value === String(contact.type || "").toLowerCase())
      ? String(contact.type).toLowerCase()
      : "client",
    relationship_status: String(contact.relationship_status || "active").toLowerCase(),
    priority: String(contact.priority || "medium").toLowerCase(),
    preferred_channel: String(contact.preferred_channel || "email").toLowerCase(),
    tags_text: (Array.isArray(contact.tags) ? contact.tags : []).join(", "),
    extra_emails_text: formatListText(contact.emails, contact.email),
    extra_phones_text: formatListText(contact.phones, contact.phone),
    extra_mobiles_text: formatListText(contact.mobiles, contact.mobile),
    extra_websites_text: formatListText(contact.websites, contact.website),
  };
}

export function buildContactPayload(form, linkedCompany) {
  const emails = dedupeList([form.email, ...parseListText(form.extra_emails_text)]);
  const phones = dedupeList([form.phone, ...parseListText(form.extra_phones_text)]);
  const mobiles = dedupeList([form.mobile, ...parseListText(form.extra_mobiles_text)]);
  const websites = dedupeList([form.website, ...parseListText(form.extra_websites_text)]);
  const fullName = String(form.full_name || "").trim() || [form.first_name, form.middle_name, form.last_name].filter(Boolean).join(" ");
  const addresses = [form.address || form.city || form.state || form.postal_code || form.country || form.po_box ? {
    address: form.address || "",
    city: form.city || "",
    state: form.state || "",
    postal_code: form.postal_code || "",
    country: form.country || "",
    po_box: form.po_box || "",
  } : null].filter(Boolean);

  return {
    type: CONTACT_TYPE_OPTIONS.some((option) => option.value === String(form.type || "").toLowerCase())
      ? String(form.type).toLowerCase()
      : "client",
    status: String(form.status || "active").trim().toLowerCase() || "active",
    relationship_status: String(form.relationship_status || "active").trim().toLowerCase() || "active",
    priority: String(form.priority || "medium").trim().toLowerCase() || "medium",
    honorific_prefix: form.honorific_prefix || "",
    first_name: form.first_name || "",
    middle_name: form.middle_name || "",
    last_name: form.last_name || "",
    honorific_suffix: form.honorific_suffix || "",
    full_name: fullName,
    title: form.title || "",
    role: form.role || "",
    owner: String(form.owner || "").trim(),
    preferred_channel: String(form.preferred_channel || "email").trim().toLowerCase() || "email",
    company_id: linkedCompany?.id || "",
    company_name: linkedCompany?.name || form.company_name || "",
    is_primary: form.is_primary === true,
    tags: parseTags(form.tags_text),
    myob_card_id: String(form.myob_card_id || "").trim(),
    myob_record_id: String(form.myob_record_id || "").trim(),
    email: emails[0] || "",
    emails,
    phone: form.phone || phones[0] || "",
    phones,
    mobile: form.mobile || mobiles[0] || "",
    mobiles,
    website: websites[0] || "",
    websites,
    birthday: form.birthday || "",
    last_contacted_date: String(form.last_contacted_date || "").trim(),
    next_follow_up_date: String(form.next_follow_up_date || "").trim(),
    address: form.address || "",
    city: form.city || "",
    state: form.state || "",
    postal_code: form.postal_code || "",
    country: form.country || "",
    po_box: form.po_box || "",
    addresses,
    notes: form.notes || "",
    source_format: form.source_format || undefined,
    vcard_raw: form.vcard_raw || undefined,
    vcard_fields: form.vcard_fields || undefined,
  };
}

function namesMatch(left, right) {
  return getContactDisplayName(left).trim().toLowerCase() === getContactDisplayName(right).trim().toLowerCase();
}

export function isLikelyDuplicateContact(left, right) {
  if (!left || !right || left.id === right.id) {
    return false;
  }

  const leftEmail = String(left.email || "").trim().toLowerCase();
  const rightEmail = String(right.email || "").trim().toLowerCase();
  if (leftEmail && rightEmail && leftEmail === rightEmail) {
    return true;
  }

  const sameName = namesMatch(left, right);
  const leftCompany = normalizeCompanyName(left.company_name);
  const rightCompany = normalizeCompanyName(right.company_name);
  return sameName && leftCompany && rightCompany && leftCompany === rightCompany;
}

export function getDuplicateCandidates(contact, contacts) {
  return (contacts || []).filter((candidate) => isLikelyDuplicateContact(contact, candidate));
}

export function getContactDuplicateMap(contacts) {
  const result = new Map();

  (contacts || []).forEach((contact) => {
    result.set(contact.id, []);
  });

  for (let index = 0; index < (contacts || []).length; index += 1) {
    for (let nestedIndex = index + 1; nestedIndex < (contacts || []).length; nestedIndex += 1) {
      const left = contacts[index];
      const right = contacts[nestedIndex];
      if (!isLikelyDuplicateContact(left, right)) {
        continue;
      }

      result.set(left.id, [...(result.get(left.id) || []), right]);
      result.set(right.id, [...(result.get(right.id) || []), left]);
    }
  }

  return result;
}

function pickPrimaryValue(primary, secondary) {
  return String(primary || "").trim() || String(secondary || "").trim();
}

function pickMostRecentDate(left, right) {
  const leftTime = Date.parse(String(left || ""));
  const rightTime = Date.parse(String(right || ""));
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return "";
  }
  if (Number.isNaN(leftTime)) {
    return String(right || "");
  }
  if (Number.isNaN(rightTime)) {
    return String(left || "");
  }
  return leftTime >= rightTime ? String(left || "") : String(right || "");
}

function pickSoonestDate(left, right) {
  const leftTime = Date.parse(String(left || ""));
  const rightTime = Date.parse(String(right || ""));
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) {
    return "";
  }
  if (Number.isNaN(leftTime)) {
    return String(right || "");
  }
  if (Number.isNaN(rightTime)) {
    return String(left || "");
  }
  return leftTime <= rightTime ? String(left || "") : String(right || "");
}

export function buildMergedContactPayload(primary, secondary) {
  const merged = {
    ...secondary,
    ...primary,
    first_name: pickPrimaryValue(primary.first_name, secondary.first_name),
    middle_name: pickPrimaryValue(primary.middle_name, secondary.middle_name),
    last_name: pickPrimaryValue(primary.last_name, secondary.last_name),
    full_name: pickPrimaryValue(primary.full_name, secondary.full_name) || [primary.first_name || secondary.first_name, primary.middle_name || secondary.middle_name, primary.last_name || secondary.last_name].filter(Boolean).join(" "),
    title: pickPrimaryValue(primary.title, secondary.title),
    role: pickPrimaryValue(primary.role, secondary.role),
    owner: pickPrimaryValue(primary.owner, secondary.owner),
    preferred_channel: pickPrimaryValue(primary.preferred_channel, secondary.preferred_channel) || "email",
    company_id: pickPrimaryValue(primary.company_id, secondary.company_id),
    company_name: pickPrimaryValue(primary.company_name, secondary.company_name),
    is_primary: primary.is_primary === true || secondary.is_primary === true,
    email: pickPrimaryValue(primary.email, secondary.email),
    phone: pickPrimaryValue(primary.phone, secondary.phone),
    mobile: pickPrimaryValue(primary.mobile, secondary.mobile),
    website: pickPrimaryValue(primary.website, secondary.website),
    address: pickPrimaryValue(primary.address, secondary.address),
    city: pickPrimaryValue(primary.city, secondary.city),
    state: pickPrimaryValue(primary.state, secondary.state),
    postal_code: pickPrimaryValue(primary.postal_code, secondary.postal_code),
    country: pickPrimaryValue(primary.country, secondary.country),
    po_box: pickPrimaryValue(primary.po_box, secondary.po_box),
    notes: [String(primary.notes || "").trim(), String(secondary.notes || "").trim()].filter(Boolean).join("\n\n"),
    relationship_status: pickPrimaryValue(primary.relationship_status, secondary.relationship_status) || "active",
    priority: pickPrimaryValue(primary.priority, secondary.priority) || "medium",
    status: String(primary.status || "").trim().toLowerCase() === "archived"
      && String(secondary.status || "").trim().toLowerCase() !== "archived"
      ? String(secondary.status || "active").trim().toLowerCase()
      : pickPrimaryValue(primary.status, secondary.status) || "active",
    last_contacted_date: pickMostRecentDate(primary.last_contacted_date, secondary.last_contacted_date),
    next_follow_up_date: pickSoonestDate(primary.next_follow_up_date, secondary.next_follow_up_date),
    emails: dedupeList([...(primary.emails || []), primary.email, ...(secondary.emails || []), secondary.email]),
    phones: dedupeList([...(primary.phones || []), primary.phone, ...(secondary.phones || []), secondary.phone]),
    mobiles: dedupeList([...(primary.mobiles || []), primary.mobile, ...(secondary.mobiles || []), secondary.mobile]),
    websites: dedupeList([...(primary.websites || []), primary.website, ...(secondary.websites || []), secondary.website]),
    tags: dedupeList([...(primary.tags || []), ...(secondary.tags || [])]),
  };

  merged.email = merged.emails[0] || "";
  merged.phone = merged.phones[0] || "";
  merged.mobile = merged.mobiles[0] || "";
  merged.website = merged.websites[0] || "";

  return merged;
}

function pushTimelineEvent(events, event) {
  const timestamp = Date.parse(String(event.date || ""));
  events.push({
    ...event,
    sortTime: Number.isNaN(timestamp) ? 0 : timestamp,
  });
}

export function buildContactActivityTimeline({ interactions = [], notes = [], tasks = [], leads = [], quotes = [], jobs = [], attachments = [] }) {
  const events = [];

  interactions.forEach((interaction) => {
    pushTimelineEvent(events, {
      id: `interaction-${interaction.id}`,
      date: interaction.interaction_date || interaction.created_date,
      kind: "interaction",
      title: interaction.subject || interaction.type || "Interaction logged",
      description: interaction.summary || "",
      color: "blue",
    });
  });

  notes.forEach((note) => {
    pushTimelineEvent(events, {
      id: `note-${note.id}`,
      date: note.created_date,
      kind: "note",
      title: "Internal note",
      description: note.content || "",
      color: "slate",
    });
  });

  tasks.forEach((task) => {
    pushTimelineEvent(events, {
      id: `task-${task.id}`,
      date: task.due_date || task.updated_date || task.created_date,
      kind: "task",
      title: task.title || "Follow-up task",
      description: `${task.status === "completed" ? "Completed" : "Due"}${task.assigned_to ? ` · ${task.assigned_to}` : ""}`,
      color: task.status === "completed" ? "emerald" : "amber",
    });
  });

  leads.forEach((lead) => {
    pushTimelineEvent(events, {
      id: `lead-${lead.id}`,
      date: lead.updated_date || lead.created_date,
      kind: "lead",
      title: lead.title || "Lead linked",
      description: `Lead · ${lead.stage || "new_enquiry"}`,
      color: "purple",
      href: `/leads/${lead.id}`,
    });
  });

  quotes.forEach((quote) => {
    pushTimelineEvent(events, {
      id: `quote-${quote.id}`,
      date: quote.updated_date || quote.created_date,
      kind: "quote",
      title: quote.quote_number || quote.title || "Quote linked",
      description: `Quote · ${quote.status || "draft"}`,
      color: "teal",
      href: `/quotes/${quote.id}`,
    });
  });

  jobs.forEach((job) => {
    pushTimelineEvent(events, {
      id: `job-${job.id}`,
      date: job.updated_date || job.created_date,
      kind: "job",
      title: job.job_number || job.title || "Job linked",
      description: `Job · ${job.status || "planning"}`,
      color: "emerald",
      href: `/jobs/${job.id}`,
    });
  });

  attachments.forEach((attachment) => {
    pushTimelineEvent(events, {
      id: `attachment-${attachment.id}`,
      date: attachment.updated_date || attachment.created_date,
      kind: "file",
      title: attachment.name || "File uploaded",
      description: `File · ${attachment.mime_type || "document"}`,
      color: "orange",
      href: attachment.url || "",
    });
  });

  return events.sort((left, right) => right.sortTime - left.sortTime);
}

export function getContactHealth(contact, tasks = []) {
  const overdueTaskCount = (tasks || []).filter((task) => {
    if (String(task.status || "").toLowerCase() === "completed") {
      return false;
    }
    const dueTime = Date.parse(String(task.due_date || ""));
    return !Number.isNaN(dueTime) && dueTime < Date.now();
  }).length;

  const nextFollowUpTime = Date.parse(String(contact?.next_follow_up_date || ""));
  if (String(contact?.status || "").toLowerCase() === "archived") {
    return { label: "Archived", color: "slate" };
  }
  if (overdueTaskCount > 0 || (!Number.isNaN(nextFollowUpTime) && nextFollowUpTime < Date.now())) {
    return { label: "Needs attention", color: "red" };
  }

  const lastContactedTime = Date.parse(String(contact?.last_contacted_date || ""));
  if (!Number.isNaN(lastContactedTime)) {
    const daysAgo = Math.round((Date.now() - lastContactedTime) / (1000 * 60 * 60 * 24));
    if (daysAgo <= 7) {
      return { label: "Fresh", color: "emerald" };
    }
    if (daysAgo <= 30) {
      return { label: "Warm", color: "amber" };
    }
  }

  return { label: "Quiet", color: "slate" };
}
