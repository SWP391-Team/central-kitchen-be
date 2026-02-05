import pool from '../config/database';
import { Inventory, InventoryCreateDto, InventoryUpdateDto } from '../models/Inventory';
import { ProductBatchWithDetails } from '../models/ProductBatch';

export class InventoryRepository {
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

  async findAll(): Promise<Inventory[]> {
    const query = 'SELECT * FROM inventory ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(inventoryId: number): Promise<Inventory | null> {
    const query = 'SELECT * FROM inventory WHERE inventory_id = $1';
    const result = await pool.query(query, [inventoryId]);
    return result.rows[0] || null;
  }

  async findByStoreAndBatch(storeId: number, batchId: number): Promise<Inventory | null> {
    const query = 'SELECT * FROM inventory WHERE store_id = $1 AND batch_id = $2';
    const result = await pool.query(query, [storeId, batchId]);
    return result.rows[0] || null;
  }

  async create(inventoryData: InventoryCreateDto): Promise<Inventory> {
    const query = `
      INSERT INTO inventory (store_id, batch_id, quantity, status)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      inventoryData.store_id,
      inventoryData.batch_id,
      inventoryData.quantity,
      'ACTIVE' 
    ]);
    
    return result.rows[0];
  }

  async update(inventoryId: number, inventoryData: InventoryUpdateDto): Promise<Inventory | null> {
    const query = `
      UPDATE inventory 
      SET quantity = $1
      WHERE inventory_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [inventoryData.quantity, inventoryId]);
    return result.rows[0] || null;
  }
  async getAvailableQuantityByProduct(productId: number): Promise<number> {
    const query = `
      SELECT COALESCE(SUM(i.quantity), 0) as total_quantity
      FROM inventory i
      INNER JOIN product_batch pb ON i.batch_id = pb.batch_id
      INNER JOIN store s ON i.store_id = s.store_id
      WHERE pb.product_id = $1 
        AND s.store_name = 'Central Kitchen'
    `;
    const result = await pool.query(query, [productId]);
    return parseInt(result.rows[0].total_quantity) || 0;
  }
  async delete(inventoryId: number): Promise<boolean> {
    const query = 'DELETE FROM inventory WHERE inventory_id = $1';
    const result = await pool.query(query, [inventoryId]);
    return result.rowCount !== null && result.rowCount > 0;
  }

  async findAllWithDetails(storeId: number): Promise<ProductBatchWithDetails[]> {
    const query = `
      SELECT 
        pb.batch_id,
        pb.batch_code,
        pb.product_id,
        p.product_name,
        p.product_code,
        p.unit,
        pb.production_date,
        pb.expired_date,
        pb.created_at,
        i.inventory_id,
        i.quantity as inventory_quantity,
        i.status as inventory_status,
        i.disposed_reason as inventory_disposed_reason,
        i.disposed_at
      FROM inventory i
      INNER JOIN product_batch pb ON i.batch_id = pb.batch_id
      INNER JOIN product p ON pb.product_id = p.product_id
      WHERE i.store_id = $1
      ORDER BY pb.created_at DESC
    `;
    
    const result = await pool.query(query, [storeId]);
    return result.rows;
  }

  async updateStatus(inventoryId: number, status: string, disposedReason?: string): Promise<Inventory | null> {
    let query: string;
    let params: any[];
    
    if (status === 'DISPOSED' && disposedReason) {
      query = `
        UPDATE inventory 
        SET status = $1, disposed_reason = $2, disposed_at = CURRENT_TIMESTAMP
        WHERE inventory_id = $3
        RETURNING *
      `;
      params = [status, disposedReason, inventoryId];
    } else {
      query = `
        UPDATE inventory 
        SET status = $1
        WHERE inventory_id = $2
        RETURNING *
      `;
      params = [status, inventoryId];
    }
    
    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  async updateExpiredStatuses(): Promise<void> {
    await pool.query(`
      UPDATE inventory i
      SET status = 'EXPIRED'
      FROM product_batch pb
      WHERE i.batch_id = pb.batch_id
        AND i.status NOT IN ('DISPOSED') 
        AND pb.expired_date < CURRENT_DATE
    `);

    await pool.query(`
      UPDATE inventory i
      SET status = 'NEAR_EXPIRY'
      FROM product_batch pb
      WHERE i.batch_id = pb.batch_id
        AND i.status NOT IN ('DISPOSED', 'EXPIRED')
        AND pb.expired_date <= CURRENT_DATE + INTERVAL '3 days'
        AND pb.expired_date >= CURRENT_DATE
    `);
    
    await pool.query(`
      UPDATE inventory i
      SET status = 'ACTIVE'
      FROM product_batch pb
      WHERE i.batch_id = pb.batch_id
        AND i.status NOT IN ('DISPOSED', 'EXPIRED', 'NEAR_EXPIRY')
        AND pb.expired_date > CURRENT_DATE + INTERVAL '3 days'
    `);
  }
}

export default new InventoryRepository();
