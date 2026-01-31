import pool from '../config/database';
import { ProductBatch, ProductBatchCreateDto, ProductBatchUpdateDto } from '../models/ProductBatch';

export class ProductBatchRepository {
  async findById(batchId: number): Promise<ProductBatch | null> {
    const query = 'SELECT * FROM product_batch WHERE batch_id = $1';
    const result = await pool.query(query, [batchId]);
    return result.rows[0] || null;
  }

  async create(batchData: ProductBatchCreateDto): Promise<ProductBatch> {
    const query = `
      INSERT INTO product_batch (product_id, production_date, expired_date)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
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
