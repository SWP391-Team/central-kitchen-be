import pool from '../config/database';
import { Store, StoreCreateDto, StoreUpdateDto } from '../models/Store';

export class StoreRepository {
  async findAll(params?: { search?: string; is_active?: boolean }): Promise<Store[]> {
    let query = 'SELECT * FROM store WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;

    if (params?.search) {
      query += ` AND (LOWER(store_code) LIKE $${paramCount} OR LOWER(store_name) LIKE $${paramCount} OR LOWER(store_address) LIKE $${paramCount})`;
      values.push(`%${params.search.toLowerCase()}%`);
      paramCount++;
    }

    if (params?.is_active !== undefined) {
      query += ` AND is_active = $${paramCount}`;
      values.push(params.is_active);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, values);
    return result.rows;
  }

  async findById(storeId: number): Promise<Store | null> {
    const result = await pool.query(
      'SELECT * FROM store WHERE store_id = $1',
      [storeId]
    );
    return result.rows[0] || null;
  }

  async findByName(storeName: string): Promise<Store | null> {
    const result = await pool.query(
      'SELECT * FROM store WHERE store_name = $1',
      [storeName]
    );
    return result.rows[0] || null;
  }

  async findByStoreCode(storeCode: string): Promise<Store | null> {
    const result = await pool.query(
      'SELECT * FROM store WHERE store_code = $1',
      [storeCode]
    );
    return result.rows[0] || null;
  }

  async create(storeData: StoreCreateDto): Promise<Store> {
    const { store_code, store_name, store_address, is_active = true } = storeData;
    const result = await pool.query(
      `INSERT INTO store (store_code, store_name, store_address, is_active) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [store_code, store_name, store_address, is_active]
    );
    return result.rows[0];
  }

  async update(storeId: number, storeData: StoreUpdateDto): Promise<Store | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (storeData.store_name !== undefined) {
      fields.push(`store_name = $${paramCount++}`);
      values.push(storeData.store_name);
    }
    if (storeData.store_address !== undefined) {
      fields.push(`store_address = $${paramCount++}`);
      values.push(storeData.store_address);
    }
    if (storeData.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(storeData.is_active);
    }

    if (fields.length === 0) {
      return this.findById(storeId);
    }

    values.push(storeId);
    const result = await pool.query(
      `UPDATE store SET ${fields.join(', ')} WHERE store_id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async updateStatus(storeId: number, is_active: boolean): Promise<Store | null> {
    const result = await pool.query(
      'UPDATE store SET is_active = $1 WHERE store_id = $2 RETURNING *',
      [is_active, storeId]
    );
    return result.rows[0] || null;
  }

  async delete(storeId: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM store WHERE store_id = $1',
      [storeId]
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async hasUsers(storeId: number): Promise<boolean> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM "user" WHERE store_id = $1',
      [storeId]
    );
    return parseInt(result.rows[0].count) > 0;
  }
}
