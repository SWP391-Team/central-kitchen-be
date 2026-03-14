import pool from '../config/database';
import { Store, StoreCreateDto, StoreUpdateDto } from '../models/Store';

export class StoreRepository {
  async findAll(params?: { search?: string; is_active?: boolean; location_type?: string }): Promise<Store[]> {
    let query = 'SELECT * FROM location WHERE 1=1';
    const values: any[] = [];
    let paramCount = 1;

    if (params?.search) {
      query += ` AND (LOWER(location_code) LIKE $${paramCount} OR LOWER(location_name) LIKE $${paramCount} OR LOWER(location_address) LIKE $${paramCount})`;
      values.push(`%${params.search.toLowerCase()}%`);
      paramCount++;
    }

    if (params?.is_active !== undefined) {
      query += ` AND is_active = $${paramCount}`;
      values.push(params.is_active);
      paramCount++;
    }

    if (params?.location_type) {
      query += ` AND location_type = $${paramCount}`;
      values.push(params.location_type);
      paramCount++;
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, values);
    return result.rows;
  }

  async findById(storeId: number): Promise<Store | null> {
    const result = await pool.query(
      'SELECT * FROM location WHERE location_id = $1',
      [storeId]
    );
    return result.rows[0] || null;
  }

  async findByName(storeName: string): Promise<Store | null> {
    const result = await pool.query(
      'SELECT * FROM location WHERE location_name = $1',
      [storeName]
    );
    return result.rows[0] || null;
  }

  async findByStoreCode(storeCode: string): Promise<Store | null> {
    const result = await pool.query(
      'SELECT * FROM location WHERE location_code = $1',
      [storeCode]
    );
    return result.rows[0] || null;
  }

  async create(storeData: StoreCreateDto): Promise<Store> {
    const { location_code, location_name, location_address, location_type, is_active = true } = storeData;
    const result = await pool.query(
      `INSERT INTO location (location_code, location_name, location_address, location_type, is_active) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [location_code, location_name, location_address, location_type, is_active]
    );
    return result.rows[0];
  }

  async update(storeId: number, storeData: StoreUpdateDto): Promise<Store | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (storeData.location_name !== undefined) {
      fields.push(`location_name = $${paramCount++}`);
      values.push(storeData.location_name);
    }
    if (storeData.location_address !== undefined) {
      fields.push(`location_address = $${paramCount++}`);
      values.push(storeData.location_address);
    }
    if (storeData.location_type !== undefined) {
      fields.push(`location_type = $${paramCount++}`);
      values.push(storeData.location_type);
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
      `UPDATE location SET ${fields.join(', ')} WHERE location_id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async updateStatus(storeId: number, is_active: boolean): Promise<Store | null> {
    const result = await pool.query(
      'UPDATE location SET is_active = $1 WHERE location_id = $2 RETURNING *',
      [is_active, storeId]
    );
    return result.rows[0] || null;
  }

  async delete(storeId: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM location WHERE location_id = $1',
      [storeId]
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async hasUsers(storeId: number): Promise<boolean> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM user_location WHERE location_id = $1',
      [storeId]
    );
    return parseInt(result.rows[0].count) > 0;
  }
}
