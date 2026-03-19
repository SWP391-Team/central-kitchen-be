import pool from '../config/database';
import { Product, ProductCreateDto, ProductUpdateDto } from '../models/Product';

const PRODUCT_WITH_USERS_SELECT = `
  SELECT
    p.*,
    u.unit_name,
    cb.username AS created_by_username,
    ub.username AS updated_by_username
  FROM product p
  LEFT JOIN unit u ON p.unit_id = u.unit_id
  LEFT JOIN "user" cb ON p.created_by = cb.user_id
  LEFT JOIN "user" ub ON p.updated_by = ub.user_id
`;

export class ProductRepository {
  private normalizeText(text: string): string {
    return text.trim().toUpperCase();
  }

  async getDeactivationBlockers(productId: number): Promise<string[]> {
    const query = `
      SELECT
        (
          SELECT COALESCE(SUM(bi.qty_on_hand), 0)::int
          FROM batch_inventory bi
          WHERE bi.product_id = $1
            AND bi.qty_on_hand > 0
        ) AS inventory_qty,
        (
          SELECT COUNT(*)::int
          FROM supply_order_item soi
          INNER JOIN supply_order so ON so.supply_order_id = soi.supply_order_id
          WHERE soi.product_id = $1
            AND so.status IN ('Pending', 'Approved', 'Partly Delivered')
        ) AS pending_supply_orders,
        (
          SELECT COUNT(*)::int
          FROM batch_transfer bt
          WHERE bt.product_id = $1
            AND bt.status = 'Delivering'
        ) AS delivering_transfers,
        (
          SELECT COUNT(*)::int
          FROM (
            SELECT bt.batch_transfer_id
            FROM batch_transfer bt
            LEFT JOIN warehouse_receive wr ON wr.batch_transfer_id = bt.batch_transfer_id
            WHERE bt.product_id = $1
            GROUP BY bt.batch_transfer_id, bt.transfer_qty
            HAVING COALESCE(SUM(wr.received_qty), 0) < bt.transfer_qty
          ) pending_receive
        ) AS unreceived_transfers,
        (
          SELECT COUNT(*)::int
          FROM production_plan pp
          WHERE pp.product_id = $1
            AND pp.status IN ('draft', 'planned', 'in_production')
        ) AS open_production_plans,
        (
          SELECT COUNT(*)::int
          FROM production_batch pb
          WHERE pb.product_id = $1
            AND pb.status IN (
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

    const result = await pool.query(query, [productId]);
    const row = result.rows[0];

    if (!row) {
      return [];
    }

    const blockers: string[] = [];

    if (row.inventory_qty > 0) {
      blockers.push('inventory is still on hand');
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

  async findAll(isActive?: boolean): Promise<Product[]> {
    let query = PRODUCT_WITH_USERS_SELECT;
    const params: any[] = [];
    
    if (isActive !== undefined) {
      query += ' WHERE p.is_active = $1';
      params.push(isActive);
    }
    
    query += ' ORDER BY p.created_at DESC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  async findAllActive(): Promise<Product[]> {
    const query = `${PRODUCT_WITH_USERS_SELECT} WHERE p.is_active = true ORDER BY p.created_at DESC`;
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(productId: number): Promise<Product | null> {
    const query = `${PRODUCT_WITH_USERS_SELECT} WHERE p.product_id = $1`;
    const result = await pool.query(query, [productId]);
    return result.rows[0] || null;
  }

  async findByProductCode(productCode: string): Promise<Product | null> {
    const query = `${PRODUCT_WITH_USERS_SELECT} WHERE p.product_code = $1`;
    const result = await pool.query(query, [productCode]);
    return result.rows[0] || null;
  }

  async existsByNameAndUnitId(productName: string, unitId: number, excludeId?: number): Promise<boolean> {
    const normalizedName = this.normalizeText(productName);
    
    let query = 'SELECT COUNT(*) FROM product WHERE UPPER(TRIM(product_name)) = $1 AND unit_id = $2';
    const params: any[] = [normalizedName, unitId];
    
    if (excludeId) {
      query += ' AND product_id != $3';
      params.push(excludeId);
    }
    
    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count) > 0;
  }

  async getNextProductCodeNumber(): Promise<number> {
    const query = `
      SELECT COALESCE(MAX((REGEXP_MATCH(product_code, '^PRD-(\\d+)$'))[1]::bigint), 0) AS max_code
      FROM product
      WHERE product_code ~ '^PRD-(\\d+)$'
    `;
    const result = await pool.query(query);

    return Number(result.rows[0].max_code) + 1;
  }

  async create(productData: ProductCreateDto & { created_by: number }): Promise<Product> {
    const normalizedName = this.normalizeText(productData.product_name);

    const nextNumber = await this.getNextProductCodeNumber();
    const productCode = `PRD-${nextNumber.toString().padStart(4, '0')}`;

    const query = `
      INSERT INTO product (product_code, product_name, unit_id, shelf_life_days, created_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING product_id
    `;
    
    const result = await pool.query(query, [
      productCode,
      normalizedName,
      productData.unit_id,
      productData.shelf_life_days,
      productData.created_by,
    ]);

    return (await this.findById(result.rows[0].product_id)) as Product;
  }

  async update(productId: number, productData: ProductUpdateDto, updatedBy: number): Promise<Product | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (productData.product_name !== undefined) {
      updates.push(`product_name = $${paramCount}`);
      values.push(this.normalizeText(productData.product_name));
      paramCount++;
    }

    if (productData.unit_id !== undefined) {
      updates.push(`unit_id = $${paramCount}`);
      values.push(productData.unit_id);
      paramCount++;
    }

    if (productData.shelf_life_days !== undefined) {
      updates.push(`shelf_life_days = $${paramCount}`);
      values.push(productData.shelf_life_days);
      paramCount++;
    }

    if (updates.length === 0) {
      return this.findById(productId);
    }

    updates.push(`updated_by = $${paramCount}`);
    values.push(updatedBy);
    paramCount++;
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(productId);

    const query = `
      UPDATE product 
      SET ${updates.join(', ')}
      WHERE product_id = $${paramCount}
      RETURNING product_id
    `;

    const result = await pool.query(query, values);
    if (!result.rows[0]) {
      return null;
    }

    return this.findById(result.rows[0].product_id);
  }

  async toggleActive(productId: number, updatedBy: number): Promise<Product | null> {
    const query = `
      UPDATE product 
      SET is_active = NOT is_active,
          updated_by = $2,
          updated_at = CURRENT_TIMESTAMP
      WHERE product_id = $1
      RETURNING product_id
    `;
    const result = await pool.query(query, [productId, updatedBy]);
    if (!result.rows[0]) {
      return null;
    }

    return this.findById(result.rows[0].product_id);
  }

  async search(searchTerm: string): Promise<Product[]> {
    const normalizedSearch = `%${this.normalizeText(searchTerm)}%`;
    const query = `
      ${PRODUCT_WITH_USERS_SELECT}
      WHERE UPPER(p.product_name) LIKE $1 OR UPPER(COALESCE(u.unit_name, '')) LIKE $1
      ORDER BY p.created_at DESC
    `;
    const result = await pool.query(query, [normalizedSearch]);
    return result.rows;
  }
}

export default new ProductRepository();
