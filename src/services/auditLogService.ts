import auditLogRepository from '../repositories/auditLogRepository';
import {
  AuditAction,
  AuditLogCreateDto,
  AuditLogListParams,
  AuditLogListResult,
  AuditLogStats,
} from '../models/AuditLog';

const PATH_ACTION_MAP: Array<{ pattern: RegExp; action: AuditAction }> = [
  { pattern: /\/auth\/login$/i, action: 'LOGIN' },
  { pattern: /\/send-to-qc$/i, action: 'SEND_TO_QC' },
  { pattern: /\/undo-send-to-qc$/i, action: 'UNDO_SEND_TO_QC' },
  { pattern: /\/reinspection$/i, action: 'REINSPECTION' },
  { pattern: /\/send-rework$/i, action: 'REQUEST_REWORK' },
  { pattern: /\/start$/i, action: 'START_INSPECTION' },
  { pattern: /\/finish$/i, action: 'FINISH_INSPECTION' },
  { pattern: /\/start-rework$/i, action: 'START_REWORK' },
  { pattern: /\/finish-rework$/i, action: 'FINISH_REWORK' },
  { pattern: /\/send-to-warehouse$/i, action: 'SEND_TO_WAREHOUSE' },
  { pattern: /\/receive$/i, action: 'RECEIVE' },
  { pattern: /\/reject$/i, action: 'REJECT' },
  { pattern: /\/close$/i, action: 'CLOSE' },
  { pattern: /\/cancel$/i, action: 'CANCEL' },
  { pattern: /\/approve$/i, action: 'APPROVE' },
];

const METHOD_DEFAULT_ACTION: Record<string, AuditAction> = {
  POST: 'CREATE',
  PUT: 'UPDATE',
  PATCH: 'UPDATE',
  DELETE: 'DELETE',
};

export class AuditLogService {
  private sanitizeValue(value: any): any {
    if (value === null || value === undefined) {
      return value;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeValue(item));
    }

    if (typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, val] of Object.entries(value)) {
        const lowered = key.toLowerCase();
        if (
          lowered.includes('password') ||
          lowered.includes('token') ||
          lowered.includes('secret')
        ) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = this.sanitizeValue(val);
        }
      }
      return result;
    }

    return value;
  }

  detectAction(method: string, path: string): AuditAction {
    const normalizedMethod = (method || '').toUpperCase();
    const normalizedPath = (path || '').toLowerCase();

    const mapped = PATH_ACTION_MAP.find((item) => item.pattern.test(normalizedPath));
    if (mapped) {
      return mapped.action;
    }

    return METHOD_DEFAULT_ACTION[normalizedMethod] || 'OTHER';
  }

  detectEntity(path: string): { entityType: string; entityId: string | null } {
    const segments = path.split('/').filter(Boolean);

    const apiIdx = segments.findIndex((s) => s === 'api');
    const rawEntity = apiIdx >= 0 ? segments[apiIdx + 1] : segments[0];
    const entityType = rawEntity ? rawEntity.replace(/-/g, '_') : 'system';

    const entityIdSegment = segments.find((s) => /^\d+$/.test(s));

    return {
      entityType,
      entityId: entityIdSegment ?? null,
    };
  }

  async log(data: AuditLogCreateDto): Promise<void> {
    try {
      await auditLogRepository.create({
        ...data,
        old_values: this.sanitizeValue(data.old_values ?? null),
        new_values: this.sanitizeValue(data.new_values ?? null),
        metadata: this.sanitizeValue(data.metadata ?? null),
      });
    } catch (error) {
      console.error('Audit log create failed:', error);
    }
  }

  async getAll(params: AuditLogListParams): Promise<AuditLogListResult> {
    return auditLogRepository.getAll(params);
  }

  async getStats(): Promise<AuditLogStats> {
    return auditLogRepository.getStats();
  }
}

export default new AuditLogService();
