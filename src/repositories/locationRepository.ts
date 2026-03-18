import pool from '../config/database';
import { Location, LocationCreateDto, LocationUpdateDto } from '../models/Location';

export class LocationRepository {
  async findAll(params?: { search?: string; is_active?: boolean; location_type?: string }): Promise<Location[]> {
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

  async findById(locationId: number): Promise<Location | null> {
    const result = await pool.query(
      'SELECT * FROM location WHERE location_id = $1',
      [locationId]
    );
    return result.rows[0] || null;
  }

  async findByName(locationName: string): Promise<Location | null> {
    const result = await pool.query(
      'SELECT * FROM location WHERE location_name = $1',
      [locationName]
    );
    return result.rows[0] || null;
  }

  async findByCode(locationCode: string): Promise<Location | null> {
    const result = await pool.query(
      'SELECT * FROM location WHERE location_code = $1',
      [locationCode]
    );
    return result.rows[0] || null;
  }

  async create(locationData: LocationCreateDto): Promise<Location> {
    const { location_code, location_name, location_address, location_type, is_active = true } = locationData;
    const result = await pool.query(
      `INSERT INTO location (location_code, location_name, location_address, location_type, is_active) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [location_code, location_name, location_address, location_type, is_active]
    );
    return result.rows[0];
  }

  async update(locationId: number, locationData: LocationUpdateDto): Promise<Location | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (locationData.location_name !== undefined) {
      fields.push(`location_name = $${paramCount++}`);
      values.push(locationData.location_name);
    }
    if (locationData.location_address !== undefined) {
      fields.push(`location_address = $${paramCount++}`);
      values.push(locationData.location_address);
    }
    if (locationData.location_type !== undefined) {
      fields.push(`location_type = $${paramCount++}`);
      values.push(locationData.location_type);
    }
    if (locationData.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(locationData.is_active);
    }

    if (fields.length === 0) {
      return this.findById(locationId);
    }

    values.push(locationId);
    const result = await pool.query(
      `UPDATE location SET ${fields.join(', ')} WHERE location_id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async updateStatus(locationId: number, is_active: boolean): Promise<Location | null> {
    const result = await pool.query(
      'UPDATE location SET is_active = $1 WHERE location_id = $2 RETURNING *',
      [is_active, locationId]
    );
    return result.rows[0] || null;
  }

  async delete(locationId: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM location WHERE location_id = $1',
      [locationId]
    );
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async hasUsers(locationId: number): Promise<boolean> {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM user_location WHERE location_id = $1',
      [locationId]
    );
    return parseInt(result.rows[0].count) > 0;
  }
}
