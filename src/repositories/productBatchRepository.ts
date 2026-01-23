import pool from '../config/database';
import { ProductBatch, ProductBatchCreateDto, ProductBatchUpdateDto, ProductBatchWithDetails } from '../models/ProductBatch';

export class ProductBatchRepository {
  calculateStatus(expiredDate: Date): 'ACTIVE' | 'NEAR_EXPIRY' | 'EXPIRED' {
    const now = new Date();
    const expired = new Date(expiredDate);
    
    now.setHours(0, 0, 0, 0);
    expired.setHours(0, 0, 0, 0);
    
    const diffTime = expired.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays < 0) {
      return 'EXPIRED';
    } else if (diffDays <= 3) {
      return 'NEAR_EXPIRY';
    } else {
      return 'ACTIVE';
    }
  }

  async findAllWithDetails(): Promise<ProductBatchWithDetails[]> {
    const query = `
      SELECT 
        pb.batch_id,
        pb.product_id,
        p.product_name,
        p.unit,
        pb.production_date,
        pb.expired_date,
        pb.status,
        pb.disposed_reason,
        pb.disposed_at,
        pb.created_at,
        COALESCE(i.quantity, 0) as quantity
      FROM product_batch pb
      INNER JOIN product p ON pb.product_id = p.product_id
      LEFT JOIN inventory i ON pb.batch_id = i.batch_id AND i.store_id = 1
      ORDER BY pb.created_at DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(batchId: number): Promise<ProductBatch | null> {
    const query = 'SELECT * FROM product_batch WHERE batch_id = $1';
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  async create(batchData: ProductBatchCreateDto): Promise<ProductBatch> {
    const status = this.calculateStatus(batchData.expired_date);
    
    const query = `
      INSERT INTO product_batch (product_id, production_date, expired_date, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      batchData.product_id,
      batchData.production_date,
      batchData.expired_date,
      status
    ]);
    
    return result.rows[0];
  }

  async updateStatus(batchId: number, status: string, disposedReason?: string): Promise<ProductBatch | null> {
    let query: string;
    let params: any[];
    
    if (status === 'DISPOSED' && disposedReason) {
      query = `
        UPDATE product_batch 
        SET status = $1, disposed_reason = $2, disposed_at = CURRENT_TIMESTAMP
        WHERE batch_id = $3
        RETURNING *
      `;
      params = [status, disposedReason, batchId];
    } else {
      query = `
        UPDATE product_batch 
        SET status = $1
        WHERE batch_id = $2
        RETURNING *
      `;
      params = [status, batchId];
    }
    
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  async updateExpiredStatuses(): Promise<void> {
    await pool.query(`
      UPDATE product_batch 
      SET status = 'EXPIRED'
      WHERE status NOT IN ('DISPOSED') 
      AND expired_date < CURRENT_DATE
    `);
    
    await pool.query(`
      UPDATE product_batch 
      SET status = 'NEAR_EXPIRY'
      WHERE status NOT IN ('DISPOSED', 'EXPIRED')
      AND expired_date <= CURRENT_DATE + INTERVAL '3 days'
      AND expired_date >= CURRENT_DATE
    `);
    
    await pool.query(`
      UPDATE product_batch 
      SET status = 'ACTIVE'
      WHERE status NOT IN ('DISPOSED', 'EXPIRED', 'NEAR_EXPIRY')
      AND expired_date > CURRENT_DATE + INTERVAL '3 days'
    `);
  }

  async delete(batchId: number): Promise<boolean> {
    const query = 'DELETE FROM product_batch WHERE batch_id = $1';
    const result = await pool.query(query, [batchId]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export default new ProductBatchRepository();
