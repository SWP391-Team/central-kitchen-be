import pool from '../config/database';
import { QualityInspection, QualityInspectionCreateDto, QualityInspectionFinishDto, QualityInspectionWithDetails } from '../models/QualityInspection';

interface GetQualityInspectionsParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: 'created_at' | 'quality_inspection_code' | 'inspected_at';
  sortOrder?: 'asc' | 'desc';
}

export class QualityInspectionRepository {
  async getNextQualityInspectionCode(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const query = `
      SELECT quality_inspection_code 
      FROM quality_inspection 
      WHERE quality_inspection_code LIKE $1 
      ORDER BY quality_inspection_code DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(query, [`QI-${dateStr}-%`]);
    
    if (result.rows.length === 0) {
      return `QI-${dateStr}-001`;
    }
    
    const lastCode = result.rows[0].quality_inspection_code;
    const lastNumber = parseInt(lastCode.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
    
    return `QI-${dateStr}-${nextNumber}`;
  }

  async getMaxInspectionNo(batchId: number): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(inspection_no), 0) as max_no
      FROM quality_inspection
      WHERE batch_id = $1
    `;
    
    const result = await pool.query(query, [batchId]);
    return parseInt(result.rows[0].max_no);
  }

  async hasActiveInspection(batchId: number): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM quality_inspection
      WHERE batch_id = $1 AND status = 'Inspecting'
    `;
    
    const result = await pool.query(query, [batchId]);
    return parseInt(result.rows[0].count) > 0;
  }

  async startInspection(data: QualityInspectionCreateDto): Promise<QualityInspection> {
    const qiCode = await this.getNextQualityInspectionCode();
    const inspectionNo = await this.getMaxInspectionNo(data.batch_id) + 1;
    
    const query = `
      INSERT INTO quality_inspection (
        batch_id, quality_inspection_code, inspection_no,
        status, created_by, created_at
      )
      VALUES ($1, $2, $3, 'Inspecting', $4, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const values = [data.batch_id, qiCode, inspectionNo, data.created_by];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async finishInspection(
    inspectionId: number,
    data: QualityInspectionFinishDto,
    inspectedBy: number,
    batchStatusAtInspection: string
  ): Promise<QualityInspection | null> {
    const status = data.inspection_result === 'Pass' ? 'Passed' : 'Failed';
    
    const query = `
      UPDATE quality_inspection
      SET 
        inspection_mode = $1,
        inspected_qty = $2,
        passed_qty = $3,
        failed_qty = $4,
        note = $5,
        status = $6,
        inspected_by = $7,
        inspected_at = CURRENT_TIMESTAMP,
        batch_status_at_inspection = $8
      WHERE quality_inspection_id = $9
      RETURNING *
    `;
    
    const values = [
      data.inspection_mode,
      data.inspected_qty,
      data.passed_qty,
      data.failed_qty,
      data.note || null,
      status,
      inspectedBy,
      batchStatusAtInspection,
      inspectionId
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async findById(inspectionId: number): Promise<QualityInspectionWithDetails | null> {
    const query = `
      SELECT 
        qi.*,
        pb.batch_code,
        pb.produced_qty,
        pb.status as batch_status,
        p.product_name,
        p.product_code,
        u1.username as inspected_by_username,
        u2.username as created_by_username,
        (
          SELECT MAX(inspection_no)
          FROM quality_inspection
          WHERE batch_id = qi.batch_id
        ) as max_inspection_no
      FROM quality_inspection qi
      LEFT JOIN production_batch pb ON qi.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN "user" u1 ON qi.inspected_by::TEXT = u1.user_id::TEXT
      LEFT JOIN "user" u2 ON qi.created_by::TEXT = u2.user_id::TEXT
      WHERE qi.quality_inspection_id = $1
    `;
    
    const result = await pool.query(query, [inspectionId]);
    return result.rows[0] || null;
  }

  async findByBatchId(batchId: number): Promise<QualityInspectionWithDetails[]> {
    const query = `
      SELECT 
        qi.*,
        pb.batch_code,
        pb.produced_qty,
        pb.status as batch_status,
        p.product_name,
        p.product_code,
        u1.username as inspected_by_username,
        u2.username as created_by_username,
        (
          SELECT MAX(inspection_no)
          FROM quality_inspection
          WHERE batch_id = qi.batch_id
        ) as max_inspection_no
      FROM quality_inspection qi
      LEFT JOIN production_batch pb ON qi.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN "user" u1 ON qi.inspected_by::TEXT = u1.user_id::TEXT
      LEFT JOIN "user" u2 ON qi.created_by::TEXT = u2.user_id::TEXT
      WHERE qi.batch_id = $1
      ORDER BY qi.inspection_no DESC
    `;
    
    const result = await pool.query(query, [batchId]);
    return result.rows;
  }

  async getAll(params: GetQualityInspectionsParams): Promise<{
    data: QualityInspectionWithDetails[];
    total: number;
  }> {
    const {
      search = '',
      status,
      page = 1,
      limit = 10,
      sortBy = 'created_at',
      sortOrder = 'desc'
    } = params;

    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    if (search) {
      whereConditions.push(`(
        qi.quality_inspection_code ILIKE $${paramIndex} OR
        pb.batch_code ILIKE $${paramIndex} OR
        p.product_name ILIKE $${paramIndex} OR
        p.product_code ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      whereConditions.push(`qi.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 
      ? `WHERE ${whereConditions.join(' AND ')}`
      : '';

    const countQuery = `
      SELECT COUNT(*) as total
      FROM quality_inspection qi
      LEFT JOIN production_batch pb ON qi.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      ${whereClause}
    `;
    
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].total);

    const offset = (page - 1) * limit;
    
    const dataQuery = `
      SELECT 
        qi.*,
        pb.batch_code,
        pb.produced_qty,
        pb.status as batch_status,
        p.product_name,
        p.product_code,
        u1.username as inspected_by_username,
        u2.username as created_by_username,
        (
          SELECT MAX(inspection_no)
          FROM quality_inspection
          WHERE batch_id = qi.batch_id
        ) as max_inspection_no
      FROM quality_inspection qi
      LEFT JOIN production_batch pb ON qi.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN "user" u1 ON qi.inspected_by::TEXT = u1.user_id::TEXT
      LEFT JOIN "user" u2 ON qi.created_by::TEXT = u2.user_id::TEXT
      ${whereClause}
      ORDER BY qi.${sortBy} ${sortOrder.toUpperCase()}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    queryParams.push(limit, offset);
    const dataResult = await pool.query(dataQuery, queryParams);

    return {
      data: dataResult.rows,
      total
    };
  }

  async isMaxInspectionNo(batchId: number, inspectionNo: number): Promise<boolean> {
    const maxNo = await this.getMaxInspectionNo(batchId);
    return inspectionNo === maxNo;
  }

  async markAsIncorrectData(inspectionId: number): Promise<void> {
    const query = `
      UPDATE quality_inspection
      SET status = 'Incorrect Data'
      WHERE quality_inspection_id = $1
    `;
    
    await pool.query(query, [inspectionId]);
  }

  async createInspectionFromOld(
    oldInspection: QualityInspection,
    createdBy: number
  ): Promise<QualityInspection> {
    const qiCode = await this.getNextQualityInspectionCode();
    const inspectionNo = oldInspection.inspection_no + 1;
    
    const query = `
      INSERT INTO quality_inspection (
        batch_id, quality_inspection_code, inspection_no,
        status, created_by, created_at
      )
      VALUES ($1, $2, $3, 'Inspecting', $4, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const values = [oldInspection.batch_id, qiCode, inspectionNo, createdBy];
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

export default new QualityInspectionRepository();
