import pool from '../config/database';
import { Unit, UnitCreateDto, UnitUpdateDto } from '../models/Unit';

const UNIT_WITH_USERS_SELECT = `
  SELECT
    u.*,
    cb.username AS created_by_username,
    ub.username AS updated_by_username
  FROM unit u
  LEFT JOIN "user" cb ON u.created_by = cb.user_id
  LEFT JOIN "user" ub ON u.updated_by = ub.user_id
`;

export class UnitRepository {
  private normalizeText(text: string): string {
    return text.trim().toUpperCase();
  }

  async getDeactivationBlockers(unitId: number): Promise<string[]> {
    const query = `
      matched_products AS (
        SELECT p.product_id
        FROM product p
        WHERE p.unit_id = $1
      )
      SELECT
        (
          SELECT COALESCE(SUM(bi.qty_on_hand), 0)::int
          FROM batch_inventory bi
          INNER JOIN matched_products mp ON mp.product_id = bi.product_id
          WHERE bi.qty_on_hand > 0
        ) AS inventory_qty,
        (
          SELECT COUNT(*)::int
          FROM supply_order_item soi
          INNER JOIN supply_order so ON so.supply_order_id = soi.supply_order_id
          INNER JOIN matched_products mp ON mp.product_id = soi.product_id
          WHERE so.status IN ('Pending', 'Approved', 'Partly Delivered')
        ) AS pending_supply_orders,
        (
          SELECT COUNT(*)::int
          FROM batch_transfer bt
          INNER JOIN matched_products mp ON mp.product_id = bt.product_id
          WHERE bt.status = 'Delivering'
        ) AS delivering_transfers,
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT bt.batch_transfer_id
            FROM batch_transfer bt
            INNER JOIN matched_products mp ON mp.product_id = bt.product_id
            LEFT JOIN warehouse_receive wr ON wr.batch_transfer_id = bt.batch_transfer_id
            GROUP BY bt.batch_transfer_id, bt.transfer_qty
            HAVING COALESCE(SUM(wr.received_qty), 0) < bt.transfer_qty
          ) pending_receive
        ) AS unreceived_transfers,
        (
          SELECT COUNT(*)::int
          FROM production_plan pp
          INNER JOIN matched_products mp ON mp.product_id = pp.product_id
          WHERE pp.status IN ('draft', 'planned', 'in_production')
        ) AS open_production_plans,
        (
          SELECT COUNT(*)::int
          FROM production_batch pb
          INNER JOIN matched_products mp ON mp.product_id = pb.product_id
          WHERE pb.status IN (
            'producing',
            'produced',
            'waiting_qc',
            'under_qc',
            'qc_passed',
            'rework_required',
            'reworking',
            'reworked',
            'delivering'
          )
        ) AS open_production_batches
    `;

    const result = await pool.query(query, [unitId]);
    const row = result.rows[0];

    if (!row) {
      return [];
    }

    const blockers: string[] = [];

    if (row.inventory_qty > 0) {
      blockers.push('inventory is still on hand for products using this unit');
    }

    if (row.pending_supply_orders > 0) {
      blockers.push('there are related supply orders in Pending/Approved/Partly Delivered status');
    }

    if (row.delivering_transfers > 0) {
      blockers.push('there are related batch transfers in Delivering status');
    }

    if (row.unreceived_transfers > 0 && row.delivering_transfers === 0) {
      blockers.push('there are transfers not fully received yet (warehouse receive pending)');
    }

    if (row.open_production_plans > 0) {
      blockers.push('there are related production plans still in draft/planned/in_production');
    }

    if (row.open_production_batches > 0) {
      blockers.push('there are related production batches still in progress');
    }

    return blockers;
  }

  async findAll(params?: { isActive?: boolean; search?: string }): Promise<Unit[]> {
    const values: any[] = [];
    const where: string[] = [];

    if (params?.isActive !== undefined) {
      values.push(params.isActive);
      where.push(`u.is_active = $${values.length}`);
    }

    if (params?.search && params.search.trim()) {
      values.push(`%${this.normalizeText(params.search)}%`);
      where.push(`(UPPER(u.unit_name) LIKE $${values.length} OR UPPER(u.unit_code) LIKE $${values.length})`);
    }

    const whereSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
    const query = `${UNIT_WITH_USERS_SELECT}${whereSql} ORDER BY u.created_at DESC`;
    const result = await pool.query(query, values);
    return result.rows;
  }

  async findAllActive(): Promise<Unit[]> {
    const query = `${UNIT_WITH_USERS_SELECT} WHERE u.is_active = true ORDER BY u.unit_name ASC`;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(unitId: number): Promise<Unit | null> {
    const query = `${UNIT_WITH_USERS_SELECT} WHERE u.unit_id = $1`;
    const result = await pool.query(query, [unitId]);
    return result.rows[0] || null;
  }

  async existsByName(unitName: string, excludeId?: number): Promise<boolean> {
    const normalizedName = this.normalizeText(unitName);

    let query = 'SELECT COUNT(*) FROM unit WHERE UPPER(TRIM(unit_name)) = $1';
    const params: any[] = [normalizedName];

    if (excludeId) {
      query += ' AND unit_id != $2';
      params.push(excludeId);
    }

    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count, 10) > 0;
  }

  async getNextUnitCodeNumber(): Promise<number> {
    const query = `
      SELECT COALESCE(MAX((REGEXP_MATCH(unit_code, '^UNT-(\\d+)$'))[1]::bigint), 0) AS max_code
      FROM unit
      WHERE unit_code ~ '^UNT-(\\d+)$'
    `;
    const result = await pool.query(query);
    return Number(result.rows[0].max_code) + 1;
  }

  async create(unitData: UnitCreateDto & { created_by: number }): Promise<Unit> {
    const normalizedName = this.normalizeText(unitData.unit_name);
    const nextNumber = await this.getNextUnitCodeNumber();
    const unitCode = `UNT-${nextNumber.toString().padStart(4, '0')}`;

    const query = `
      INSERT INTO unit (unit_code, unit_name, created_by)
      VALUES ($1, $2, $3)
      RETURNING unit_id
    `;

    const result = await pool.query(query, [unitCode, normalizedName, unitData.created_by]);
    return (await this.findById(result.rows[0].unit_id)) as Unit;
  }

  async update(unitId: number, unitData: UnitUpdateDto, updatedBy: number): Promise<Unit | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (unitData.unit_name !== undefined) {
      updates.push(`unit_name = $${paramCount}`);
      values.push(this.normalizeText(unitData.unit_name));
      paramCount++;
    }

    if (updates.length === 0) {
      return this.findById(unitId);
    }

    updates.push(`updated_by = $${paramCount}`);
    values.push(updatedBy);
    paramCount++;

    updates.push('updated_at = CURRENT_TIMESTAMP');

    values.push(unitId);

    const query = `
      UPDATE unit
      SET ${updates.join(', ')}
      WHERE unit_id = $${paramCount}
      RETURNING unit_id
    `;

    const result = await pool.query(query, values);
    if (!result.rows[0]) {
      return null;
    }

    return this.findById(result.rows[0].unit_id);
  }

  async toggleActive(unitId: number, updatedBy: number): Promise<Unit | null> {
    const query = `
      UPDATE unit
      SET is_active = NOT is_active,
          updated_by = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE unit_id = $1
      RETURNING unit_id
    `;

    const result = await pool.query(query, [unitId, updatedBy]);
    if (!result.rows[0]) {
      return null;
    }

    return this.findById(result.rows[0].unit_id);
  }
}

export default new UnitRepository();
