import {
  createAttachmentVersionRecord,
  createEntityRecord,
  deleteEntityRecord,
  EntityConflictError,
  getEntityRecord,
  initializeDatabase,
  listAttachmentVersions,
  listAuditLogRecords,
  updateEntityRecord,
} from "./db";
import { LOCAL_USER } from "./systemUser";

async function main() {
  await initializeDatabase();

  const uniqueSuffix = Date.now().toString();
  const contact = createEntityRecord("Contact", {
    first_name: "Smoke",
    last_name: `Test${uniqueSuffix}`,
    email: `smoke-${uniqueSuffix}@example.test`,
  }, {
    actor: LOCAL_USER,
    request_source: "smoke-test",
  });

  const updated = updateEntityRecord("Contact", contact.id, {
    phone: "021 000 0000",
    row_version: contact.row_version,
  }, {
    actor: LOCAL_USER,
    request_source: "smoke-test",
    expected_row_version: contact.row_version,
  });

  if (!updated || updated.row_version !== contact.row_version + 1) {
    throw new Error("Row version did not increment correctly.");
  }

  let conflictDetected = false;
  try {
    updateEntityRecord("Contact", contact.id, {
      phone: "021 999 9999",
      row_version: contact.row_version,
    }, {
      actor: LOCAL_USER,
      request_source: "smoke-test",
      expected_row_version: contact.row_version,
    });
  } catch (error) {
    if (error instanceof EntityConflictError) {
      conflictDetected = true;
    } else {
      throw error;
    }
  }

  if (!conflictDetected) {
    throw new Error("Expected a row-version conflict but none occurred.");
  }

  const attachment = createEntityRecord("Attachment", {
    related_id: contact.id,
    related_type: "job",
    name: "smoke.txt",
    stored_name: "smoke.txt",
    mime_type: "text/plain",
    size: 12,
    relative_path: "jobs/SMOKE/smoke.txt",
    url: "http://127.0.0.1:4000/filesystem/jobs/SMOKE/smoke.txt",
    checksum: "abc123",
    current_version: 1,
    version_count: 1,
    source: "smoke-test",
  }, {
    actor: LOCAL_USER,
    request_source: "smoke-test",
  });

  createAttachmentVersionRecord({
    attachment_id: attachment.id,
    version_number: 1,
    related_id: contact.id,
    related_type: "job",
    name: "smoke.txt",
    stored_name: "smoke.txt",
    mime_type: "text/plain",
    size: 12,
    relative_path: "jobs/SMOKE/smoke.txt",
    url: "http://127.0.0.1:4000/filesystem/jobs/SMOKE/smoke.txt",
    checksum: "abc123",
    source: "smoke-test",
    actor_id: LOCAL_USER.id,
    actor_email: LOCAL_USER.email,
    actor_name: LOCAL_USER.full_name,
    created_date: attachment.created_date,
  });

  const versions = listAttachmentVersions(attachment.id);
  if (versions.length !== 1 || versions[0].version_number !== 1) {
    throw new Error("Attachment version history did not persist correctly.");
  }

  const auditRecords = listAuditLogRecords({ entity: "Contact", record_id: contact.id });
  if (auditRecords.length < 2) {
    throw new Error("Expected create/update audit records for the smoke contact.");
  }

  deleteEntityRecord("Attachment", attachment.id, {
    actor: LOCAL_USER,
    request_source: "smoke-test",
  });
  deleteEntityRecord("Contact", contact.id, {
    actor: LOCAL_USER,
    request_source: "smoke-test",
  });

  const deletedContact = getEntityRecord("Contact", contact.id);
  if (deletedContact) {
    throw new Error("Smoke contact was not cleaned up.");
  }

  console.log("Smoke test passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
