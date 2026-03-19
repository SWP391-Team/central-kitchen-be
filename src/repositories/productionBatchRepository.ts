import pool from '../config/database';
import { PoolClient } from 'pg';
import {
  BatchStatusHistory,
  ProductionBatch,
  ProductionBatchCreateDto,
  ProductionBatchFinishDto,
  ProductionBatchWithDetails,
} from '../models/ProductionBatch';

export class ProductionBatchRepository {
  private getTransitionNote(oldStatus: string | null, newStatus: string): string {
    const transition = `${oldStatus ?? 'null'}->${newStatus}`;
    const transitionNotes: Record<string, string> = {
      'null->producing': 'Batch created',
      'producing->produced': 'Production finished',
      'producing->cancelled': 'Batch cancelled',
      'produced->cancelled': 'Batch cancelled',
      'produced->waiting_qc': 'Sent to QC',
      'waiting_qc->produced': 'Undo send to QC',
      'waiting_qc->under_qc': 'Inspection started',
      'under_qc->rework_required': 'Rework requested',
      'qc_failed->under_qc': 'Reinspection started',
      'qc_passed->under_qc': 'Inspection undone',
      'rework_required->under_qc': 'Inspection undone',
      'rework_failed->under_qc': 'Inspection undone',
      'under_qc->qc_passed': 'Inspection passed',
      'under_qc->qc_failed': 'Inspection failed',
      'qc_failed->rework_required': 'Rework requested',
      'rework_required->reworking': 'Rework started',
      'reworking->reworked': 'Rework completed',
      'reworking->rework_failed': 'Rework failed',
      'reworked->waiting_qc': 'Sent to QC after rework',
      'waiting_qc->reworked': 'Undo rework from QC',
      'reworked->reworking': 'Undo rework completion',
      'rework_failed->reworking': 'Undo rework completion',
      'produced->delivering': 'Delivery started',
      'delivering->delivered': 'Delivery completed',
      'delivering->received': 'All transfers received',
      'delivered->received': 'All transfers received',
      'qc_failed->rejected': 'Batch rejected',
    };

    return transitionNotes[transition] || `Status changed: ${oldStatus ?? '-'} -> ${newStatus}`;
  }

  private async appendStatusHistory(
    queryable: { query: (text: string, params?: any[]) => Promise<any> },
    batchId: number,
    oldStatus: string | null,
    newStatus: string,
    changedBy?: number | null,
    note?: string | null
  ): Promise<void> {
    await queryable.query(
      `INSERT INTO batch_status_history (
         batch_id,
         old_status,
         new_status,
         changed_by,
         changed_at,
         note
       )
       VALUES ($1, $2, $3, $4, NOW(), $5)`,
      [batchId, oldStatus, newStatus, changedBy ?? null, note ?? null]
    );
  }

  async updateStatusWithHistory(
    batchId: number,
    newStatus: string,
    options?: {
      changed_by?: number | null;
      note?: string | null;
      client?: PoolClient;
    }
  ): Promise<ProductionBatch | null> {
    const queryable = options?.client || pool;

    const currentResult = await queryable.query(
      `SELECT status
       FROM production_batch
       WHERE batch_id = $1
       FOR UPDATE`,
      [batchId]
    );

    if (currentResult.rows.length === 0) {
      return null;
    }

    const oldStatus: string | null = currentResult.rows[0].status;
    if (oldStatus === newStatus) {
      const sameResult = await queryable.query(
        `SELECT * FROM production_batch WHERE batch_id = $1`,
        [batchId]
      );
      return sameResult.rows[0] || null;
    }

    const updatedResult = await queryable.query(
      `UPDATE production_batch
       SET status = $1
       WHERE batch_id = $2
       RETURNING *`,
      [newStatus, batchId]
    );

    if (updatedResult.rows.length === 0) {
      return null;
    }

    const explicitNote =
      typeof options?.note === 'string' && options.note.trim()
        ? options.note.trim()
        : null;
    const historyNote = explicitNote ?? this.getTransitionNote(oldStatus, newStatus);

    await this.appendStatusHistory(
      queryable,
      batchId,
      oldStatus,
      newStatus,
      options?.changed_by,
      historyNote
    );

    return updatedResult.rows[0];
  }

  async getNextBatchCode(): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;
    
    const query = `
      SELECT batch_code 
      FROM production_batch 
      WHERE batch_code LIKE $1 
      ORDER BY batch_code DESC 
      LIMIT 1
    `;
    
    const result = await pool.query(query, [`BATCH-${dateStr}-%`]);
    
    if (result.rows.length === 0) {
      return `BATCH-${dateStr}-001`;
    }
    
    const lastCode = result.rows[0].batch_code;
    const lastNumber = parseInt(lastCode.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(3, '0');
    
    return `BATCH-${dateStr}-${nextNumber}`;
  }

  async createEmptyBatch(batchData: ProductionBatchCreateDto): Promise<ProductionBatch> {
    const batchCode = await this.getNextBatchCode();
    
    const query = `
      INSERT INTO production_batch (
        plan_id, batch_code, product_id, 
        produced_by, produced_qty, production_date, expired_date, 
        status, created_by
      )
      VALUES ($1, $2, $3, $4, NULL, NULL, NULL, 'producing', $5)
      RETURNING *
    `;
    
    const values = [
      batchData.plan_id,
      batchCode,
      batchData.product_id,
      batchData.produced_by,
      batchData.created_by
    ];
    
    const result = await pool.query(query, values);
    const created = result.rows[0];

    await this.appendStatusHistory(
      pool,
      created.batch_id,
      null,
      'producing',
      batchData.created_by,
      'Batch created from production plan'
    );

    return created;
  }

  async finishProduction(batchId: number, finishData: ProductionBatchFinishDto): Promise<ProductionBatch | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE production_batch
         SET
           produced_qty = $1,
           production_date = $2,
           expired_date = $3
         WHERE batch_id = $4`,
        [
          finishData.produced_qty,
          finishData.production_date,
          finishData.expired_date,
          batchId,
        ]
      );

      const updated = await this.updateStatusWithHistory(batchId, 'produced', {
        client,
        changed_by: finishData.changed_by ?? null,
        note: 'Finish production',
      });

      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async create(batchData: ProductionBatchCreateDto): Promise<ProductionBatch> {
    return this.createEmptyBatch(batchData);
  }

  async findByPlanId(planId: number): Promise<ProductionBatchWithDetails[]> {
    const query = `
      SELECT 
        pb.*,
        pp.plan_code,
        p.product_name,
        p.product_code,
        un.unit_name,
        u.username as created_by_username,
        pu.username as produced_by_username
      FROM production_batch pb
      LEFT JOIN production_plan pp ON pb.plan_id = pp.plan_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u ON pb.created_by = u.user_id
      LEFT JOIN "user" pu ON pb.produced_by = pu.user_id
      WHERE pb.plan_id = $1
      ORDER BY pb.created_at DESC
    `;
    
    const result = await pool.query(query, [planId]);
    return result.rows;
  }

  async findById(batchId: number): Promise<ProductionBatchWithDetails | null> {
    const query = `
      SELECT 
        pb.*,
        pp.plan_code,
        p.product_name,
        p.product_code,
        un.unit_name,
        u.username as created_by_username,
        pu.username as produced_by_username
      FROM production_batch pb
      LEFT JOIN production_plan pp ON pb.plan_id = pp.plan_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u ON pb.created_by = u.user_id
      LEFT JOIN "user" pu ON pb.produced_by = pu.user_id
      WHERE pb.batch_id = $1
    `;
    
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  async getTotalProducedQty(planId: number): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(produced_qty), 0) as total
      FROM production_batch
      WHERE plan_id = $1 AND status != 'cancelled' AND produced_qty IS NOT NULL
    `;
    
    const result = await pool.query(query, [planId]);
    return parseInt(result.rows[0].total);
  }

  async cancelBatch(batchId: number): Promise<ProductionBatch | null> {
    return this.updateStatusWithHistory(batchId, 'cancelled', {
      note: 'Batch cancelled',
    });
  }

  async updateStatus(batchId: number, status: string): Promise<ProductionBatch | null> {
    return this.updateStatusWithHistory(batchId, status);
  }

  async getAllBatches(): Promise<ProductionBatchWithDetails[]> {
    const query = `
      SELECT 
        pb.*,
        pp.plan_code,
        p.product_name,
        p.product_code,
        un.unit_name,
        u.username as created_by_username,
        pu.username as produced_by_username
      FROM production_batch pb
      LEFT JOIN production_plan pp ON pb.plan_id = pp.plan_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN unit un ON p.unit_id = un.unit_id
      LEFT JOIN "user" u ON pb.created_by = u.user_id
      LEFT JOIN "user" pu ON pb.produced_by = pu.user_id
      ORDER BY pb.created_at DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  async getStatusHistoryByBatchId(batchId: number): Promise<BatchStatusHistory[]> {
    const query = `
      SELECT
        bsh.*,
        u.username AS changed_by_username
      FROM batch_status_history bsh
      LEFT JOIN "user" u ON bsh.changed_by = u.user_id
      WHERE bsh.batch_id = $1
      ORDER BY bsh.changed_at ASC, bsh.batch_status_history_id ASC
    `;

    const result = await pool.query(query, [batchId]);
    return result.rows.map((row) => ({
      ...row,
      note: (row.note && String(row.note).trim())
        ? row.note
        : this.getTransitionNote(row.old_status ?? null, row.new_status),
    }));
  }
}

export default new ProductionBatchRepository();
