import pool from '../config/database';
import { ReworkRecord, ReworkRecordCreateDto, ReworkRecordFinishDto, ReworkRecordWithDetails } from '../models/ReworkRecord';

export class ReworkRecordRepository {
  async getNextReworkCode(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const query = `
      SELECT rework_code 
      FROM rework_record 
      WHERE rework_code LIKE $1 
      ORDER BY rework_code DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(query, [`RW-${dateStr}-%`]);
    
    if (result.rows.length === 0) {
      return `RW-${dateStr}-001`;
    }
    
    const lastCode = result.rows[0].rework_code;
    const lastNumber = parseInt(lastCode.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
    
    return `RW-${dateStr}-${nextNumber}`;
  }

  async getMaxReworkNo(batchId: number): Promise<number> {
    const query = `
      SELECT COALESCE(MAX(rework_no), 0) as max_no
      FROM rework_record
      WHERE batch_id = $1
    `;
    
    const result = await pool.query(query, [batchId]);
    return parseInt(result.rows[0].max_no);
  }

  async hasActiveRework(batchId: number): Promise<boolean> {
    const query = `
      SELECT COUNT(*) as count
      FROM rework_record
      WHERE batch_id = $1 AND status = 'Reworking'
    `;
    
    const result = await pool.query(query, [batchId]);
    return parseInt(result.rows[0].count) > 0;
  }

  async startRework(data: ReworkRecordCreateDto, reworkQty: number): Promise<ReworkRecord> {
    const reworkCode = await this.getNextReworkCode();
    const reworkNo = await this.getMaxReworkNo(data.batch_id) + 1;
    
    const query = `
      INSERT INTO rework_record (
        rework_code, rework_no, batch_id, quality_inspection_id,
        rework_qty, status, rework_by, created_by, created_at
      )
      VALUES ($1, $2, $3, $4, $5, 'Reworking', $6, $7, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const values = [
      reworkCode,
      reworkNo,
      data.batch_id,
      data.quality_inspection_id,
      reworkQty,
      data.rework_by || null,
      data.created_by
    ];
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async finishRework(
    reworkId: number,
    data: ReworkRecordFinishDto,
    reworkBy: number,
    batchStatusAfterRework: string,
    reworkStatus: 'Reworked' | 'Rework Failed'
  ): Promise<ReworkRecord | null> {
    const query = `
      UPDATE rework_record
      SET 
        reworkable_qty = $1,
        non_reworkable_qty = $2,
        note = $3,
        status = $4,
        rework_by = $5,
        rework_date = CURRENT_TIMESTAMP,
        batch_status_after_rework = $7
      WHERE rework_id = $6
      RETURNING *
    `;
    
    const values = [
      data.reworkable_qty,
      data.non_reworkable_qty,
      data.note || null,
      reworkStatus,
      reworkBy,
      reworkId,
      batchStatusAfterRework
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async findById(reworkId: number): Promise<ReworkRecordWithDetails | null> {
    const query = `
      SELECT 
        rr.*,
        pb.batch_code,
        p.product_name,
        p.product_code,
        un.unit_name,
        u1.username as rework_by_username,
        u2.username as created_by_username
      FROM rework_record rr
      LEFT JOIN production_batch pb ON rr.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u1 ON rr.rework_by = u1.user_id
      LEFT JOIN "user" u2 ON rr.created_by = u2.user_id
      WHERE rr.rework_id = $1
    `;
    
    const result = await pool.query(query, [reworkId]);
    return result.rows[0] || null;
  }

  async findByBatchId(batchId: number): Promise<ReworkRecordWithDetails[]> {
    const query = `
      SELECT 
        rr.*,
        pb.batch_code,
        p.product_name,
        p.product_code,
        un.unit_name,
        u1.username as rework_by_username,
        u2.username as created_by_username
      FROM rework_record rr
      LEFT JOIN production_batch pb ON rr.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u1 ON rr.rework_by = u1.user_id
      LEFT JOIN "user" u2 ON rr.created_by = u2.user_id
      WHERE rr.batch_id = $1
      ORDER BY rr.rework_no DESC
    `;
    
    const result = await pool.query(query, [batchId]);
    return result.rows;
  }

  async findByBatchIds(batchIds: number[]): Promise<ReworkRecordWithDetails[]> {
    if (batchIds.length === 0) {
      return [];
    }

    const query = `
      SELECT
        rr.*,
        pb.batch_code,
        pb.status as batch_status,
        p.product_name,
        p.product_code,
        un.unit_name,
        u1.username as rework_by_username,
        u2.username as created_by_username,
        (
          SELECT MAX(rework_no)
          FROM rework_record
          WHERE batch_id = rr.batch_id
        ) as max_rework_no
      FROM rework_record rr
      LEFT JOIN production_batch pb ON rr.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u1 ON rr.rework_by = u1.user_id
      LEFT JOIN "user" u2 ON rr.created_by = u2.user_id
      WHERE rr.batch_id = ANY($1::int[])
      ORDER BY rr.batch_id ASC, rr.rework_no DESC
    `;

    const result = await pool.query(query, [batchIds]);
    return result.rows;
  }

  async getAll(): Promise<ReworkRecordWithDetails[]> {
    const query = `
      SELECT 
        rr.*,
        pb.batch_code,
        pb.status as batch_status,
        p.product_name,
        p.product_code,
        un.unit_name,
        u1.username as rework_by_username,
        u2.username as created_by_username,
        (
          SELECT MAX(rework_no)
          FROM rework_record
          WHERE batch_id = rr.batch_id
        ) as max_rework_no
      FROM rework_record rr
      LEFT JOIN production_batch pb ON rr.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u1 ON rr.rework_by = u1.user_id
      LEFT JOIN "user" u2 ON rr.created_by = u2.user_id
      ORDER BY rr.created_at DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  async isMaxReworkNo(batchId: number, reworkNo: number): Promise<boolean> {
    const maxNo = await this.getMaxReworkNo(batchId);
    return reworkNo === maxNo;
  }

  async getLatestReworkByBatchId(batchId: number): Promise<ReworkRecordWithDetails | null> {
    const query = `
      SELECT 
        rr.*,
        pb.batch_code,
        p.product_name,
        p.product_code,
        un.unit_name,
        u1.username as rework_by_username,
        u2.username as created_by_username
      FROM rework_record rr
      LEFT JOIN production_batch pb ON rr.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u1 ON rr.rework_by = u1.user_id
      LEFT JOIN "user" u2 ON rr.created_by = u2.user_id
      WHERE rr.batch_id = $1
      ORDER BY rr.rework_no DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  async getCompletedReworksBeforeDate(batchId: number, beforeDate: Date): Promise<ReworkRecordWithDetails[]> {
    const query = `
      SELECT 
        rr.*,
        pb.batch_code,
        p.product_name,
        p.product_code,
        un.unit_name,
        u1.username as rework_by_username,
        u2.username as created_by_username
      FROM rework_record rr
      LEFT JOIN production_batch pb ON rr.batch_id = pb.batch_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u1 ON rr.rework_by::TEXT = u1.user_id::TEXT
      LEFT JOIN "user" u2 ON rr.created_by::TEXT = u2.user_id::TEXT
      WHERE rr.batch_id = $1 
        AND rr.status = 'Reworked'
        AND rr.rework_date IS NOT NULL
        AND rr.rework_date < $2
      ORDER BY rr.rework_no ASC
    `;
    
    const result = await pool.query(query, [batchId, beforeDate]);
    return result.rows;
  }

  async hasAnyRework(batchId: number): Promise<boolean> {
    const query = `
        SELECT COUNT(*) as count
      FROM rework_record
      WHERE batch_id = $1
    `;
    
    const result = await pool.query(query, [batchId]);
    return parseInt(result.rows[0].count) > 0;
  }

  async markAsIncorrectData(reworkId: number): Promise<void> {
    const query = `
      UPDATE rework_record
      SET status = 'Incorrect Data'
      WHERE rework_id = $1
    `;
    
    await pool.query(query, [reworkId]);
  }

  async createReworkFromOld(
    oldRework: ReworkRecordWithDetails,
    createdBy: number
  ): Promise<ReworkRecord> {
    const reworkCode = await this.getNextReworkCode();
    const reworkNo = oldRework.rework_no + 1;
    
    const query = `
      INSERT INTO rework_record (
        rework_code, rework_no, batch_id, quality_inspection_id,
        rework_qty, status, created_by, created_at
      )
      VALUES ($1, $2, $3, $4, $5, 'Reworking', $6, CURRENT_TIMESTAMP)
      RETURNING *
    `;
    
    const values = [
      reworkCode,
      reworkNo,
      oldRework.batch_id,
      oldRework.quality_inspection_id,
      oldRework.rework_qty,
      createdBy
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

export default new ReworkRecordRepository();
