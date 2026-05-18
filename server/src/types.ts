export type EntityData = Record<string, unknown>;

export interface EntityRecord extends EntityData {
  id: string;
  created_date: string;
  updated_date: string;
  row_version: number;
}

export interface ListEntityOptions {
  filters?: Record<string, unknown>;
  sort?: string;
  limit?: number;
}

export interface LocalUser {
  id: string;
  full_name: string;
  role: string;
  email: string;
  avatar_url?: string;
}

export interface MutationActor {
  id: string;
  full_name: string;
  role: string;
  email?: string;
}

export interface MutationContext {
  actor?: MutationActor | null;
  request_source?: string;
  skip_audit?: boolean;
  expected_row_version?: number | null;
}

export interface AuditLogRecord {
  id: string;
  entity: string;
  record_id: string;
  action: string;
  actor_id: string;
  actor_email: string;
  actor_name: string;
  actor_role: string;
  request_source: string;
  summary: Record<string, unknown>;
  previous_data: EntityData | null;
  next_data: EntityData | null;
  created_date: string;
}

export interface AttachmentVersionRecord extends EntityData {
  id: string;
  attachment_id: string;
  version_number: number;
  related_id: string;
  related_type: string;
  name: string;
  stored_name: string;
  mime_type: string;
  size: number;
  relative_path: string;
  url: string;
  checksum: string;
  source: string;
  actor_id?: string;
  actor_email?: string;
  actor_name?: string;
  created_date: string;
}
