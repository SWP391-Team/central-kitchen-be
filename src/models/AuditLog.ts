export type AuditAction =
  | 'LOGIN'
  | 'LOGOUT'
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'CLOSE'
  | 'CANCEL'
  | 'SEND_TO_QC'
  | 'UNDO_SEND_TO_QC'
  | 'START_INSPECTION'
  | 'FINISH_INSPECTION'
  | 'REINSPECTION'
  | 'REQUEST_REWORK'
  | 'START_REWORK'
  | 'FINISH_REWORK'
  | 'SEND_TO_WAREHOUSE'
  | 'RECEIVE'
  | 'OTHER';

export interface AuditLog {
  audit_log_id: number;
  user_id: number | null;
  username: string | null;
  role_id: number | null;
  action: AuditAction;
  entity_type: string;
  entity_id: string | null;
  description: string | null;
  old_values: any | null;
  new_values: any | null;
  metadata: any | null;
  ip_address: string | null;
  user_agent: string | null;
  request_method: string;
  request_path: string;
  status_code: number;
  created_at: Date;
}

export interface AuditLogListParams {
  search?: string;
  action?: AuditAction | 'all';
  userId?: number;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogStats {
  total: number;
  today: number;
  this_week: number;
  critical: number;
}

export interface AuditLogCreateDto {
  user_id?: number | null;
  username?: string | null;
  role_id?: number | null;
  action: AuditAction;
  entity_type: string;
  entity_id?: string | null;
  description?: string | null;
  old_values?: any | null;
  new_values?: any | null;
  metadata?: any | null;
  ip_address?: string | null;
  user_agent?: string | null;
  request_method: string;
  request_path: string;
  status_code: number;
}

export interface AuditLogListResult {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
