import pool from '../config/database';
import { ProductionBatch, ProductionBatchCreateDto, ProductionBatchFinishDto, ProductionBatchWithDetails } from '../models/ProductionBatch';

export class ProductionBatchRepository {
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
        produced_qty, production_date, expired_date, 
        status, created_by
      )
      VALUES ($1, $2, $3, NULL, NULL, NULL, 'producing', $4)
      RETURNING *
    `;
    
    const values = [
      batchData.plan_id,
      batchCode,
      batchData.product_id,
      batchData.created_by
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0];
  }

  async finishProduction(batchId: number, finishData: ProductionBatchFinishDto): Promise<ProductionBatch | null> {
    const query = `
      UPDATE production_batch
      SET 
        produced_qty = $1,
        production_date = $2,
        expired_date = $3,
        status = 'produced'
      WHERE batch_id = $4
      RETURNING *
    `;
    
    const values = [
      finishData.produced_qty,
      finishData.production_date,
      finishData.expired_date,
      batchId
    ];
    
    const result = await pool.query(query, values);
    return result.rows[0] || null;
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
        u.username as created_by_username
      FROM production_batch pb
      LEFT JOIN production_plan pp ON pb.plan_id = pp.plan_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN "user" u ON pb.created_by = u.user_id
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
        u.username as created_by_username
      FROM production_batch pb
      LEFT JOIN production_plan pp ON pb.plan_id = pp.plan_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN "user" u ON pb.created_by = u.user_id
      WHERE pb.batch_id = $1
    `;
    
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  async getTotalProducedQty(planId: number): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(produced_qty), 0) as total
      FROM production_batch
      WHERE plan_id = $1 AND status = 'produced' AND produced_qty IS NOT NULL
    `;
    
    const result = await pool.query(query, [planId]);
    return parseInt(result.rows[0].total);
  }

  async cancelBatch(batchId: number): Promise<ProductionBatch | null> {
    const query = `
      UPDATE production_batch
      SET 
        status = 'cancelled'
      WHERE batch_id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  async updateStatus(batchId: number, status: string): Promise<ProductionBatch | null> {
    const query = `
      UPDATE production_batch
      SET status = $1
      WHERE batch_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [status, batchId]);
    return result.rows[0] || null;
  }

  async getAllBatches(): Promise<ProductionBatchWithDetails[]> {
    const query = `
      SELECT 
        pb.*,
        pp.plan_code,
        p.product_name,
        p.product_code,
        u.username as created_by_username
      FROM production_batch pb
      LEFT JOIN production_plan pp ON pb.plan_id = pp.plan_id
      LEFT JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN "user" u ON pb.created_by = u.user_id
      ORDER BY pb.created_at DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }
}

export default new ProductionBatchRepository();
