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
      INSERT INTO product_batch (batch_code, product_id, planned_quantity, status)
      VALUES ($1, $2, $3, 'PLANNED')
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      batchData.batch_code,
      batchData.product_id,
      batchData.planned_quantity
    ]);
    
    return result.rows[0];
  }

  async update(batchId: number, updateData: ProductBatchUpdateDto): Promise<ProductBatch | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updateData.production_date !== undefined) {
      fields.push(`production_date = $${paramIndex++}`);
      values.push(updateData.production_date);
    }
    if (updateData.expired_date !== undefined) {
      fields.push(`expired_date = $${paramIndex++}`);
      values.push(updateData.expired_date);
    }
    if (updateData.status !== undefined) {
      fields.push(`status = $${paramIndex++}`);
      values.push(updateData.status);
    }
    if (updateData.produced_quantity !== undefined) {
      fields.push(`produced_quantity = $${paramIndex++}`);
      values.push(updateData.produced_quantity);
    }

    if (fields.length === 0) {
      return this.findById(batchId);
    }

    values.push(batchId);
    const query = `
      UPDATE product_batch
      SET ${fields.join(', ')}
      WHERE batch_id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async delete(batchId: number): Promise<boolean> {
    const query = 'DELETE FROM product_batch WHERE batch_id = $1';
    const result = await pool.query(query, [batchId]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export default new ProductBatchRepository();
