import pool from '../config/database';
import {
  AuditLog,
  AuditLogCreateDto,
  AuditLogListParams,
  AuditLogListResult,
  AuditLogStats,
} from '../models/AuditLog';

export class AuditLogRepository {
  async create(data: AuditLogCreateDto): Promise<AuditLog> {
    const query = `
      INSERT INTO audit_log (
        user_id,
        username,
        role_id,
        action,
        entity_type,
        entity_id,
        description,
        old_values,
        new_values,
        metadata,
        ip_address,
        user_agent,
        request_method,
        request_path,
        status_code
      )
      VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15
      )
      RETURNING *
    `;

    const values = [
      data.user_id ?? null,
      data.username ?? null,
      data.role_id ?? null,
      data.action,
      data.entity_type,
      data.entity_id ?? null,
      data.description ?? null,
      data.old_values ?? null,
      data.new_values ?? null,
      data.metadata ?? null,
      data.ip_address ?? null,
      data.user_agent ?? null,
      data.request_method,
      data.request_path,
      data.status_code,
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async getAll(params: AuditLogListParams): Promise<AuditLogListResult> {
    const page = params.page && params.page > 0 ? params.page : 1;
    const limit = params.limit && params.limit > 0 ? Math.min(params.limit, 200) : 20;
    const offset = (page - 1) * limit;

    const whereClauses: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (params.search) {
      whereClauses.push(`(
        al.username ILIKE $${idx}
        OR al.description ILIKE $${idx}
        OR al.entity_type ILIKE $${idx}
        OR al.request_path ILIKE $${idx}
      )`);
      values.push(`%${params.search}%`);
      idx += 1;
    }

    if (params.action && params.action !== 'all') {
      whereClauses.push(`al.action = $${idx}`);
      values.push(params.action);
      idx += 1;
    }

    if (params.userId) {
      whereClauses.push(`al.user_id = $${idx}`);
      values.push(params.userId);
      idx += 1;
    }

    if (params.fromDate) {
      whereClauses.push(`al.created_at >= $${idx}::timestamp`);
      values.push(params.fromDate);
      idx += 1;
    }

    if (params.toDate) {
      whereClauses.push(`al.created_at < ($${idx}::date + INTERVAL '1 day')`);
      values.push(params.toDate);
      idx += 1;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const dataQuery = `
      SELECT
        al.*,
        COALESCE(u.username, al.username) AS username
      FROM audit_log al
      LEFT JOIN "user" u ON u.user_id = al.user_id
      ${whereSql}
      ORDER BY al.created_at DESC, al.audit_log_id DESC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const countQuery = `
      SELECT COUNT(*)::int AS total
      FROM audit_log al
      ${whereSql}
    `;

    const dataValues = [...values, limit, offset];

    const [dataResult, countResult] = await Promise.all([
      pool.query(dataQuery, dataValues),
      pool.query(countQuery, values),
    ]);

    const total = countResult.rows[0]?.total ?? 0;

    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getStats(): Promise<AuditLogStats> {
    const query = `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (
          WHERE created_at >= date_trunc('day', NOW())
        )::int AS today,
        COUNT(*) FILTER (
          WHERE created_at >= date_trunc('week', NOW())
        )::int AS this_week,
        COUNT(*) FILTER (
          WHERE status_code >= 400
            OR action IN ('DELETE', 'CANCEL', 'REJECT', 'REQUEST_REWORK')
        )::int AS critical
      FROM audit_log
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }
}

export default new AuditLogRepository();
