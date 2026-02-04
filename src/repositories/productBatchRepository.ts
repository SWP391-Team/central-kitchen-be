import pool from '../config/database';
import { ProductBatch, ProductBatchCreateDto, ProductBatchUpdateDto } from '../models/ProductBatch';

export class ProductBatchRepository {
  async findById(batchId: number): Promise<ProductBatch | null> {
    const query = 'SELECT * FROM product_batch WHERE batch_id = $1';
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  async findByBatchCode(batchCode: string): Promise<ProductBatch | null> {
    const query = 'SELECT * FROM product_batch WHERE batch_code = $1';
    const result = await pool.query(query, [batchCode]);
    return result.rows[0] || null;
  }

  async create(batchData: ProductBatchCreateDto): Promise<ProductBatch> {
    const query = `
      INSERT INTO product_batch (batch_code, product_id, production_date, expired_date)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      batchData.batch_code,
      batchData.product_id,
      batchData.production_date,
      batchData.expired_date
    ]);
    
    return result.rows[0];
  }

  async delete(batchId: number): Promise<boolean> {
    const query = 'DELETE FROM product_batch WHERE batch_id = $1';
    const result = await pool.query(query, [batchId]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export default new ProductBatchRepository();
