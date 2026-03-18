import { PoolClient } from 'pg';
import pool from '../config/database';
import {
  CkInventoryRow,
  RequesterSuggestion,
  SupplyOrder,
  SupplyOrderItem,
  SupplyOrderItemWithDetails,
  SupplyOrderWithDetails,
} from '../models/SupplyOrder';

export class SupplyOrderRepository {
  async getNextSupplyOrderCode(client?: PoolClient): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const query = `
      SELECT supply_order_code
      FROM supply_order
      WHERE supply_order_code LIKE $1
      ORDER BY supply_order_code DESC
      LIMIT 1
    `;
    const values = [`SO-${dateStr}-%`];

    const result = client
      ? await client.query(query, values)
      : await pool.query(query, values);

    if (result.rows.length === 0) {
      return `SO-${dateStr}-001`;
    }

    const lastCode = result.rows[0].supply_order_code as string;
    const lastNumber = parseInt(lastCode.split('-')[2] || '0', 10);
    const nextNumber = String(lastNumber + 1).padStart(3, '0');

    return `SO-${dateStr}-${nextNumber}`;
  }

  async createSupplyOrderWithClient(
    client: PoolClient,
    data: {
      location_id: number;
      requested_by: number;
      note?: string;
      created_by: number;
    }
  ): Promise<SupplyOrder> {
    const code = await this.getNextSupplyOrderCode(client);

    const result = await client.query(
      `INSERT INTO supply_order (
         supply_order_code,
         location_id,
         status,
         requested_by,
         approved_by,
         approved_date,
         note,
         created_by
       )
       VALUES ($1, $2, 'Draft', $3, NULL, NULL, $4, $5)
       RETURNING *`,
      [code, data.location_id, data.requested_by, data.note || null, data.created_by]
    );

    return result.rows[0];
  }

  async createSupplyOrderItemWithClient(
    client: PoolClient,
    data: {
      supply_order_id: number;
      product_id: number;
      requested_qty: number;
    }
  ): Promise<SupplyOrderItem> {
    const result = await client.query(
      `INSERT INTO supply_order_item (
         supply_order_id,
         product_id,
         requested_qty,
         delivered_qty,
         approved_qty,
         status
       )
       VALUES ($1, $2, $3, 0, 0, 'Draft')
       RETURNING *`,
      [data.supply_order_id, data.product_id, data.requested_qty]
    );

    return result.rows[0];
  }

  async findMasterList(params: {
    role_id: number;
    user_location_ids: number[];
    search?: string;
    status?: string;
    location_id?: number;
    page?: number;
    limit?: number;
  }): Promise<{ rows: SupplyOrderWithDetails[]; total: number }> {
    const values: any[] = [];
    const where: string[] = ['1=1'];
    let idx = 1;

    if (params.role_id === 3) {
      where.push(`so.location_id = ANY($${idx}::int[])`);
      values.push(params.user_location_ids.length > 0 ? params.user_location_ids : [-1]);
      idx++;
    }

    if (params.search) {
      where.push(`(
        so.supply_order_code ILIKE $${idx}
        OR l.location_name ILIKE $${idx}
        OR rq.username ILIKE $${idx}
        OR rq.user_code ILIKE $${idx}
        OR so.requested_by::text ILIKE $${idx}
      )`);
      values.push(`%${params.search}%`);
      idx++;
    }

    if (params.status && params.status !== 'all') {
      where.push(`so.status = $${idx}`);
      values.push(params.status);
      idx++;
    }

    if (params.location_id) {
      where.push(`so.location_id = $${idx}`);
      values.push(params.location_id);
      idx++;
    }

    const page = Math.max(params.page || 1, 1);
    const limit = Math.min(Math.max(params.limit || 20, 1), 200);
    const offset = (page - 1) * limit;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const totalResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM supply_order so
       LEFT JOIN location l ON so.location_id = l.location_id
       LEFT JOIN "user" rq ON so.requested_by = rq.user_id
       ${whereSql}`,
      values
    );

    const listResult = await pool.query(
      `SELECT
         so.*,
         rq.username AS requested_by_username,
         rq.user_code AS requested_by_user_code,
         l.location_name,
         l.location_code,
         l.location_type,
         cb.username AS created_by_username,
         ab.username AS approved_by_username,
         (
           SELECT COUNT(*)::int
           FROM supply_order_item soi
           WHERE soi.supply_order_id = so.supply_order_id
         ) AS item_count
       FROM supply_order so
      LEFT JOIN "user" rq ON so.requested_by = rq.user_id
       LEFT JOIN location l ON so.location_id = l.location_id
       LEFT JOIN "user" cb ON so.created_by = cb.user_id
       LEFT JOIN "user" ab ON so.approved_by = ab.user_id
       ${whereSql}
       ORDER BY so.created_at DESC, so.supply_order_id DESC
       LIMIT ${limit} OFFSET ${offset}`,
      values
    );

    return {
      rows: listResult.rows,
      total: totalResult.rows[0].total || 0,
    };
  }

  async findById(orderId: number): Promise<SupplyOrderWithDetails | null> {
    const result = await pool.query(
      `SELECT
         so.*,
         rq.username AS requested_by_username,
         rq.user_code AS requested_by_user_code,
         l.location_name,
         l.location_code,
         l.location_type,
         cb.username AS created_by_username,
         ab.username AS approved_by_username
       FROM supply_order so
       LEFT JOIN "user" rq ON so.requested_by = rq.user_id
       LEFT JOIN location l ON so.location_id = l.location_id
       LEFT JOIN "user" cb ON so.created_by = cb.user_id
       LEFT JOIN "user" ab ON so.approved_by = ab.user_id
       WHERE so.supply_order_id = $1`,
      [orderId]
    );

    return result.rows[0] || null;
  }

  async findItemsByOrderId(orderId: number): Promise<SupplyOrderItemWithDetails[]> {
    const result = await pool.query(
      `SELECT
         soi.*,
         p.product_name,
         p.product_code,
         p.unit,
         COALESCE((
           SELECT SUM(bt.transfer_qty)
           FROM batch_transfer bt
           WHERE bt.supply_order_item_id = soi.supply_order_item_id
         ), 0)::int AS delivered_qty,
         GREATEST(
           COALESCE(soi.approved_qty, 0) - COALESCE((
             SELECT SUM(bt.transfer_qty)
             FROM batch_transfer bt
             WHERE bt.supply_order_item_id = soi.supply_order_item_id
           ), 0)::int,
           0
         )::int AS remaining_qty
       FROM supply_order_item soi
       LEFT JOIN product p ON soi.product_id = p.product_id
       WHERE soi.supply_order_id = $1
       ORDER BY soi.supply_order_item_id ASC`,
      [orderId]
    );

    return result.rows;
  }

  async findOrderByIdForUpdate(orderId: number, client: PoolClient): Promise<SupplyOrder | null> {
    const result = await client.query(
      `SELECT * FROM supply_order WHERE supply_order_id = $1 FOR UPDATE`,
      [orderId]
    );
    return result.rows[0] || null;
  }

  async findItemsByOrderIdForUpdate(
    orderId: number,
    client: PoolClient
  ): Promise<SupplyOrderItem[]> {
    const result = await client.query(
      `SELECT *
       FROM supply_order_item
       WHERE supply_order_id = $1
       ORDER BY supply_order_item_id ASC
       FOR UPDATE`,
      [orderId]
    );
    return result.rows;
  }

  async updateOrderStatusWithClient(
    client: PoolClient,
    orderId: number,
    status: string,
    options?: { approved_by?: number | null; approved_date?: string | null; note?: string | null }
  ): Promise<SupplyOrder | null> {
    const result = await client.query(
      `UPDATE supply_order
       SET status = $1,
           approved_by = COALESCE($2, approved_by),
           approved_date = COALESCE($3, approved_date),
           note = COALESCE($4, note)
       WHERE supply_order_id = $5
       RETURNING *`,
      [
        status,
        options?.approved_by ?? null,
        options?.approved_date ?? null,
        options?.note ?? null,
        orderId,
      ]
    );

    return result.rows[0] || null;
  }

  async updateOrderStatusOnlyWithClient(
    client: PoolClient,
    orderId: number,
    status: string
  ): Promise<SupplyOrder | null> {
    const result = await client.query(
      `UPDATE supply_order
       SET status = $1
       WHERE supply_order_id = $2
       RETURNING *`,
      [status, orderId]
    );

    return result.rows[0] || null;
  }

  async closeOrderWithClient(
    client: PoolClient,
    orderId: number,
    data: {
      closed_by: number;
      closed_at: string;
      close_reason: string;
      close_note?: string | null;
    }
  ): Promise<SupplyOrder | null> {
    const result = await client.query(
      `UPDATE supply_order
       SET status = 'Closed',
           closed_by = $1,
           closed_at = $2,
           close_reason = $3,
           close_note = $4
       WHERE supply_order_id = $5
       RETURNING *`,
      [
        data.closed_by,
        data.closed_at,
        data.close_reason,
        data.close_note ?? null,
        orderId,
      ]
    );

    return result.rows[0] || null;
  }

  async updateSupplyOrderItemApprovalWithClient(
    client: PoolClient,
    itemId: number,
    approvedQty: number,
    status: 'Approved' | 'Rejected'
  ): Promise<SupplyOrderItem | null> {
    const result = await client.query(
      `UPDATE supply_order_item
       SET approved_qty = $1,
           status = $2
       WHERE supply_order_item_id = $3
       RETURNING *`,
      [approvedQty, status, itemId]
    );

    return result.rows[0] || null;
  }

  async getDeliveredQtyByItemIdWithClient(
    client: PoolClient,
    itemId: number
  ): Promise<number> {
    const result = await client.query(
      `SELECT COALESCE(SUM(transfer_qty), 0)::int AS total
       FROM batch_transfer
       WHERE supply_order_item_id = $1`,
      [itemId]
    );
    return result.rows[0]?.total || 0;
  }

  async syncDeliveredQtyForItemWithClient(
    client: PoolClient,
    itemId: number
  ): Promise<void> {
    await client.query(
      `UPDATE supply_order_item soi
       SET delivered_qty = COALESCE((
         SELECT SUM(bt.transfer_qty)
         FROM batch_transfer bt
         WHERE bt.supply_order_item_id = soi.supply_order_item_id
       ), 0)::int
       WHERE soi.supply_order_item_id = $1`,
      [itemId]
    );
  }

  async findSupplyOrderItemByIdForUpdate(
    itemId: number,
    client: PoolClient
  ): Promise<SupplyOrderItem | null> {
    const result = await client.query(
      `SELECT * FROM supply_order_item WHERE supply_order_item_id = $1 FOR UPDATE`,
      [itemId]
    );
    return result.rows[0] || null;
  }

  async getCkWarehouseInventory(): Promise<CkInventoryRow[]> {
    const result = await pool.query(
      `SELECT
         bi.location_id,
         l.location_name,
         bi.product_id,
         p.product_code,
         p.product_name,
         p.unit,
         bi.batch_id,
         pb.batch_code,
         bi.qty_on_hand,
         bi.qty_available,
         bi.updated_at
       FROM batch_inventory bi
       INNER JOIN location l ON bi.location_id = l.location_id
       INNER JOIN product p ON bi.product_id = p.product_id
       LEFT JOIN production_batch pb ON bi.batch_id = pb.batch_id
       WHERE l.location_type = 'CK_WAREHOUSE'
         AND l.is_active = true
         AND bi.qty_available > 0
       ORDER BY p.product_name ASC, pb.batch_code ASC, bi.updated_at DESC`
    );

    return result.rows;
  }

  async searchRequesterUsers(params: {
    keyword?: string;
    location_id?: number | null;
  }): Promise<RequesterSuggestion[]> {
    const values: any[] = [];
    const where: string[] = ['u.is_active = true'];
    let idx = 1;

    if (params.keyword) {
      where.push(`(u.username ILIKE $${idx} OR u.user_code ILIKE $${idx})`);
      values.push(`%${params.keyword}%`);
      idx++;
    }

    if (params.location_id) {
      where.push(`(
        u.location_id = $${idx}
        OR EXISTS (
          SELECT 1
          FROM user_location ul
          WHERE ul.user_id = u.user_id AND ul.location_id = $${idx}
        )
      )`);
      values.push(params.location_id);
      idx++;
    }

    const result = await pool.query(
      `SELECT u.user_id, u.username, u.user_code
       FROM "user" u
       WHERE ${where.join(' AND ')}
       ORDER BY u.username ASC
       LIMIT 20`,
      values
    );

    return result.rows;
  }

  async getOrderDeliverySummaryWithClient(
    client: PoolClient,
    orderId: number
  ): Promise<Array<{ approved_qty: number; delivered_qty: number }>> {
    const result = await client.query(
      `SELECT
         COALESCE(soi.approved_qty, 0)::int AS approved_qty,
         COALESCE((
           SELECT SUM(bt.transfer_qty)
           FROM batch_transfer bt
           WHERE bt.supply_order_item_id = soi.supply_order_item_id
         ), 0)::int AS delivered_qty
       FROM supply_order_item soi
       WHERE soi.supply_order_id = $1`,
      [orderId]
    );
    return result.rows;
  }
}

export default new SupplyOrderRepository();
