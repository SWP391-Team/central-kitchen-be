import pool from '../config/database';
import { User, UserCreateDto, UserUpdateDto } from '../models/User';

export class UserRepository {
  async findAll(): Promise<User[]> {
    const result = await pool.query(
      'SELECT * FROM "user" ORDER BY created_at DESC'
    );
    return result.rows;
  }

  async findById(userId: number): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM "user" WHERE user_id = $1',
      [userId]
    );
    return result.rows[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM "user" WHERE username = $1',
      [username]
    );
    return result.rows[0] || null;
  }

  async findByUserCode(userCode: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM "user" WHERE user_code = $1',
      [userCode]
    );
    return result.rows[0] || null;
  }

  async create(userData: UserCreateDto): Promise<User> {
    const { user_code, username, password, role_id, store_id, is_active = true } = userData;
    const result = await pool.query(
      `INSERT INTO "user" (user_code, username, password, role_id, store_id, is_active) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [user_code, username, password, role_id, store_id, is_active]
    );
    return result.rows[0];
  }

  async update(userId: number, userData: UserUpdateDto): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (userData.username !== undefined) {
      fields.push(`username = $${paramCount++}`);
      values.push(userData.username);
    }
    if (userData.password !== undefined) {
      fields.push(`password = $${paramCount++}`);
      values.push(userData.password);
    }
    if (userData.role_id !== undefined) {
      fields.push(`role_id = $${paramCount++}`);
      values.push(userData.role_id);
    }
    if (userData.store_id !== undefined) {
      fields.push(`store_id = $${paramCount++}`);
      values.push(userData.store_id);
    }
    if (userData.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(userData.is_active);
    }

    if (fields.length === 0) {
      return this.findById(userId);
    }

    values.push(userId);
    const result = await pool.query(
      `UPDATE "user" SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async delete(userId: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM "user" WHERE user_id = $1',
      [userId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}
