import pool from '../config/database';
import { Inventory, InventoryCreateDto, InventoryUpdateDto } from '../models/Inventory';

export class InventoryRepository {
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
      INSERT INTO inventory (store_id, batch_id, quantity)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      inventoryData.store_id,
      inventoryData.batch_id,
      inventoryData.quantity
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

  async delete(inventoryId: number): Promise<boolean> {
    const query = 'DELETE FROM inventory WHERE inventory_id = $1';
    const result = await pool.query(query, [inventoryId]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}

export default new InventoryRepository();
