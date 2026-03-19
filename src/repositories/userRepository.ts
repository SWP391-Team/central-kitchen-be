import pool from '../config/database';
import { User, UserCreateDto, UserUpdateDto } from '../models/User';

export class UserRepository {
  private readonly DEACTIVATION_BLOCKING_BATCH_STATUSES = [
    'producing',
    'produced',
    'waiting_qc',
    'under_qc',
    'qc_passed',
    'qc_failed',
    'rework_required',
    'reworking',
    'reworked',
    'rework_failed',
    'delivering',
  ];

  private normalizeLocationIds(locationIds?: number[] | null): number[] {
    if (!locationIds || locationIds.length === 0) {
      return [];
    }

    const uniqueLocationIds = Array.from(new Set(locationIds));
    return uniqueLocationIds.filter((id) => Number.isInteger(id) && id > 0);
  }

  private async getLocationIdsByUserIds(userIds: number[]): Promise<Map<number, number[]>> {
    if (userIds.length === 0) {
      return new Map();
    }

    const result = await pool.query(
      `SELECT user_id, ARRAY_AGG(location_id ORDER BY location_id) AS location_ids
       FROM user_location
       WHERE user_id = ANY($1::int[])
       GROUP BY user_id`,
      [userIds]
    );

    const locationMap = new Map<number, number[]>();
    for (const row of result.rows) {
      locationMap.set(row.user_id, row.location_ids || []);
    }

    return locationMap;
  }

  private async withLocations(users: any[]): Promise<User[]> {
    const locationMap = await this.getLocationIdsByUserIds(users.map((user) => user.user_id));

    return users.map((user) => {
      const locationIds = locationMap.get(user.user_id) || [];

      return {
        ...user,
        location_ids: locationIds,
        location_id: locationIds[0] ?? user.location_id ?? null,
      } as User;
    });
  }

  private async syncUserLocations(
    client: any,
    userId: number,
    locationIds: number[]
  ): Promise<void> {
    await client.query('DELETE FROM user_location WHERE user_id = $1', [userId]);

    if (locationIds.length === 0) {
      return;
    }

    await client.query(
      `INSERT INTO user_location (user_id, location_id)
       SELECT $1, UNNEST($2::int[])`,
      [userId, locationIds]
    );
  }

  async findAll(): Promise<User[]> {
    const result = await pool.query(
      'SELECT * FROM "user" ORDER BY created_at DESC'
    );
    return this.withLocations(result.rows);
  }

  async findById(userId: number): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM "user" WHERE user_id = $1',
      [userId]
    );

    if (!result.rows[0]) {
      return null;
    }

    const users = await this.withLocations([result.rows[0]]);
    return users[0] || null;
  }

  async findByUsername(username: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM "user" WHERE username = $1',
      [username]
    );

    if (!result.rows[0]) {
      return null;
    }

    const users = await this.withLocations([result.rows[0]]);
    return users[0] || null;
  }

  async findByUserCode(userCode: string): Promise<User | null> {
    const result = await pool.query(
      'SELECT * FROM "user" WHERE user_code = $1',
      [userCode]
    );

    if (!result.rows[0]) {
      return null;
    }

    const users = await this.withLocations([result.rows[0]]);
    return users[0] || null;
  }

  async getDeactivationBlockingAssignments(userId: number): Promise<{
    productionBatchCodes: string[];
    qualityInspectionCodes: string[];
    reworkCodes: string[];
  }> {
    const [productionResult, inspectionResult, reworkResult] = await Promise.all([
      pool.query(
        `SELECT batch_code
         FROM production_batch
         WHERE produced_by = $1
           AND status = ANY($2::text[])
         ORDER BY created_at DESC`,
        [userId, this.DEACTIVATION_BLOCKING_BATCH_STATUSES]
      ),
      pool.query(
        `SELECT quality_inspection_code
         FROM quality_inspection
         WHERE inspected_by = $1
           AND status = 'Inspecting'
         ORDER BY created_at DESC`,
        [userId]
      ),
      pool.query(
        `SELECT rework_code
         FROM rework_record
         WHERE rework_by = $1
           AND status = 'Reworking'
         ORDER BY created_at DESC`,
        [userId]
      ),
    ]);

    return {
      productionBatchCodes: productionResult.rows.map((row) => row.batch_code),
      qualityInspectionCodes: inspectionResult.rows.map((row) => row.quality_inspection_code),
      reworkCodes: reworkResult.rows.map((row) => row.rework_code),
    };
  }

  async generateNextUserCode(): Promise<string> {
    const result = await pool.query(
      `SELECT COALESCE(MAX((SUBSTRING(user_code FROM '^USR-(\\d+)$'))::bigint), 0) AS max_code_number
       FROM "user"
       WHERE user_code ~ '^USR-\\d+$'`
    );

    const maxCodeRaw = result.rows[0]?.max_code_number;
    const maxCodeNumber = maxCodeRaw !== undefined && maxCodeRaw !== null ? BigInt(maxCodeRaw) : 0n;
    const nextCodeNumber = (maxCodeNumber + 1n).toString();
    const paddedCodeNumber = nextCodeNumber.length < 4 ? nextCodeNumber.padStart(4, '0') : nextCodeNumber;

    return `USR-${paddedCodeNumber}`;
  }

  async create(userData: UserCreateDto): Promise<User> {
    const { user_code, username, password, role_id, is_active = true, created_by } = userData;
    const locationIds = this.normalizeLocationIds(
      userData.location_ids ?? (userData.location_id !== undefined && userData.location_id !== null ? [userData.location_id] : [])
    );
    const primaryLocationId = locationIds[0] ?? null;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `INSERT INTO "user" (user_code, username, password, role_id, location_id, is_active, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [user_code, username, password, role_id, primaryLocationId, is_active, created_by]
      );

      const createdUser = result.rows[0];
      await this.syncUserLocations(client, createdUser.user_id, locationIds);

      await client.query('COMMIT');

      const user = await this.findById(createdUser.user_id);
      if (!user) {
        throw new Error('Failed to load created user');
      }

      return user;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async update(userId: number, userData: UserUpdateDto): Promise<User | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    const hasLocationIds = userData.location_ids !== undefined;
    const nextLocationIds = this.normalizeLocationIds(
      hasLocationIds
        ? userData.location_ids ?? []
        : userData.location_id !== undefined && userData.location_id !== null
          ? [userData.location_id]
          : []
    );

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
    if (userData.location_id !== undefined || hasLocationIds) {
      fields.push(`location_id = $${paramCount++}`);
      values.push(nextLocationIds[0] ?? null);
    }
    if (userData.is_active !== undefined) {
      fields.push(`is_active = $${paramCount++}`);
      values.push(userData.is_active);
    }

    if (fields.length === 0 && !hasLocationIds) {
      return this.findById(userId);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      let existingUser: User | null = null;
      if (fields.length > 0) {
        values.push(userId);
        const result = await client.query(
          `UPDATE "user" SET ${fields.join(', ')} WHERE user_id = $${paramCount} RETURNING *`,
          values
        );

        if (!result.rows[0]) {
          await client.query('ROLLBACK');
          return null;
        }
      } else {
        existingUser = await this.findById(userId);
        if (!existingUser) {
          await client.query('ROLLBACK');
          return null;
        }
      }

      if (hasLocationIds) {
        await this.syncUserLocations(client, userId, nextLocationIds);
      } else if (userData.location_id !== undefined) {
        await this.syncUserLocations(client, userId, nextLocationIds);
      }

      await client.query('COMMIT');
      return this.findById(userId);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async delete(userId: number): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM "user" WHERE user_id = $1',
      [userId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }
}
