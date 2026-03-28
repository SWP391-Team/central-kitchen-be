import { PoolClient } from 'pg';
import pool from '../config/database';
import {
  ReserveBatchRecord,
  ReserveHistoryEventType,
  ReserveHistoryRecord,
  ReserveProductRecord,
} from '../models/Reserve';

const PRODUCT_WITH_DETAILS_SELECT = `
  SELECT
    rp.*,
    (rp.approved_qty - rp.consumed_qty - rp.released_qty)::int AS remaining_qty,
    COALESCE(rb_agg.allocated_remaining_qty, 0)::int AS allocated_remaining_qty,
    CASE
      WHEN COALESCE(rb_agg.allocated_remaining_qty, 0) <= 0 THEN 'NONE'
      WHEN COALESCE(rb_agg.allocated_remaining_qty, 0) >= (rp.approved_qty - rp.consumed_qty - rp.released_qty) THEN 'FULL'
      ELSE 'PARTIAL'
    END AS allocation_level,
    so.supply_order_code,
    p.product_code,
    p.product_name,
    un.unit_name,
    l.location_name
  FROM supply_order_item_reserve rp
  LEFT JOIN (
    SELECT
      reserve_id,
      COALESCE(SUM(allocated_qty - consumed_qty - released_qty), 0)::int AS allocated_remaining_qty
    FROM supply_order_item_reserve_batch
    GROUP BY reserve_id
  ) rb_agg ON rb_agg.reserve_id = rp.reserve_id
  INNER JOIN supply_order so ON so.supply_order_id = rp.supply_order_id
  INNER JOIN product p ON p.product_id = rp.product_id
  LEFT JOIN unit un ON un.unit_id = p.unit_id
  LEFT JOIN location l ON l.location_id = rp.location_id
`;

const BATCH_WITH_DETAILS_SELECT = `
  SELECT
    rb.*,
    rp.reserve_code,
    (rb.allocated_qty - rb.consumed_qty - rb.released_qty)::int AS remaining_qty,
    so.supply_order_code,
    p.product_code,
    p.product_name,
    un.unit_name,
    pb.batch_code,
    l.location_name
  FROM supply_order_item_reserve_batch rb
  INNER JOIN supply_order_item_reserve rp ON rp.reserve_id = rb.reserve_id
  INNER JOIN supply_order so ON so.supply_order_id = rb.supply_order_id
  INNER JOIN product p ON p.product_id = rb.product_id
  LEFT JOIN unit un ON un.unit_id = p.unit_id
  LEFT JOIN production_batch pb ON pb.batch_id = rb.batch_id
  LEFT JOIN location l ON l.location_id = rb.location_id
`;

export class ReserveRepository {
  private async getNextReserveProductCode(client: PoolClient): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const result = await client.query(
      `SELECT reserve_code
       FROM supply_order_item_reserve
       WHERE reserve_code LIKE $1
       ORDER BY reserve_code DESC
       LIMIT 1`,
      [`RSV-${dateStr}-%`]
    );

    if (result.rows.length === 0) {
      return `RSV-${dateStr}-001`;
    }

    const lastCode = result.rows[0].reserve_code as string;
    const lastNumber = parseInt(lastCode.split('-')[2] || '0', 10);
    const nextNumber = String(lastNumber + 1).padStart(3, '0');
    return `RSV-${dateStr}-${nextNumber}`;
  }

  private async getNextReserveBatchCode(client: PoolClient): Promise<string> {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const dateStr = `${year}${month}${day}`;

    const result = await client.query(
      `SELECT reserve_batch_code
       FROM supply_order_item_reserve_batch
       WHERE reserve_batch_code LIKE $1
       ORDER BY reserve_batch_code DESC
       LIMIT 1`,
      [`RSB-${dateStr}-%`]
    );

    if (result.rows.length === 0) {
      return `RSB-${dateStr}-001`;
    }

    const lastCode = result.rows[0].reserve_batch_code as string;
    const lastNumber = parseInt(lastCode.split('-')[2] || '0', 10);
    const nextNumber = String(lastNumber + 1).padStart(3, '0');
    return `RSB-${dateStr}-${nextNumber}`;
  }

  private mapProductStatus(
    approvedQty: number,
    consumedQty: number,
    releasedQty: number,
    allocatedRemainingQty: number
  ): string {
    const deliveryRemaining = approvedQty - consumedQty - releasedQty;
    if (deliveryRemaining <= 0 && consumedQty >= approvedQty) {
      return 'FULFILLED';
    }
    if (deliveryRemaining <= 0 && releasedQty > 0) {
      return 'RELEASED';
    }

    if (deliveryRemaining > 0 && allocatedRemainingQty >= deliveryRemaining) {
      return 'FULFILLED';
    }

    if (consumedQty > 0 || releasedQty > 0 || allocatedRemainingQty > 0) {
      return 'PARTIAL';
    }

    return 'OPEN';
  }

  private mapBatchStatus(allocatedQty: number, consumedQty: number, releasedQty: number): string {
    const remaining = allocatedQty - consumedQty - releasedQty;
    if (remaining <= 0 && consumedQty >= allocatedQty) {
      return 'FULFILLED';
    }
    if (remaining <= 0 && releasedQty > 0) {
      return 'RELEASED';
    }
    return 'PARTIAL';
  }

  async listProductReserves(params?: {
    status?: string;
    product_id?: number;
    supply_order_code?: string;
    supply_order_item_id?: number;
    location_ids?: number[];
  }): Promise<ReserveProductRecord[]> {
    const values: any[] = [];
    const where: string[] = ['1=1'];
    let idx = 1;

    if (params?.product_id) {
      where.push(`rp.product_id = $${idx}`);
      values.push(params.product_id);
      idx += 1;
    }

    if (params?.supply_order_code) {
      where.push(`so.supply_order_code ILIKE $${idx}`);
      values.push(`%${params.supply_order_code}%`);
      idx += 1;
    }

    if (params?.supply_order_item_id) {
      where.push(`rp.supply_order_item_id = $${idx}`);
      values.push(params.supply_order_item_id);
      idx += 1;
    }

    if (params?.location_ids && params.location_ids.length > 0) {
      where.push(`rp.location_id = ANY($${idx}::int[])`);
      values.push(params.location_ids);
      idx += 1;
    }

    const result = await pool.query(
      `${PRODUCT_WITH_DETAILS_SELECT}
       WHERE ${where.join(' AND ')}
       ORDER BY rp.updated_at DESC, rp.reserve_id DESC`,
      values
    );

    const normalized = result.rows.map((row) => {
      const allocatedRemainingQty = Number(row.allocated_remaining_qty || 0);
      const deliveryRemaining = Math.max(
        Number(row.approved_qty || 0) - Number(row.consumed_qty || 0) - Number(row.released_qty || 0),
        0
      );
      const remainingUnallocatedQty = Math.max(deliveryRemaining - allocatedRemainingQty, 0);
      const allocationLevel: 'NONE' | 'PARTIAL' | 'FULL' =
        allocatedRemainingQty <= 0
          ? 'NONE'
          : allocatedRemainingQty >= deliveryRemaining
          ? 'FULL'
          : 'PARTIAL';

      const computedStatus = this.mapProductStatus(
        Number(row.approved_qty || 0),
        Number(row.consumed_qty || 0),
        Number(row.released_qty || 0),
        allocatedRemainingQty
      );

      return {
        ...row,
        status: computedStatus,
        remaining_qty: remainingUnallocatedQty,
        allocation_level: allocationLevel,
        allocated_remaining_qty: allocatedRemainingQty,
      } as ReserveProductRecord;
    });

    if (params?.status && params.status !== 'all') {
      return normalized.filter((row) => row.status === params.status);
    }

    return normalized;
  }

  async listBatchReserves(params?: {
    status?: string;
    product_id?: number;
    supply_order_code?: string;
    supply_order_item_id?: number;
    location_ids?: number[];
  }): Promise<ReserveBatchRecord[]> {
    const values: any[] = [];
    const where: string[] = ['1=1'];
    let idx = 1;

    if (params?.product_id) {
      where.push(`rb.product_id = $${idx}`);
      values.push(params.product_id);
      idx += 1;
    }

    if (params?.supply_order_code) {
      where.push(`so.supply_order_code ILIKE $${idx}`);
      values.push(`%${params.supply_order_code}%`);
      idx += 1;
    }

    if (params?.supply_order_item_id) {
      where.push(`rb.supply_order_item_id = $${idx}`);
      values.push(params.supply_order_item_id);
      idx += 1;
    }

    if (params?.location_ids && params.location_ids.length > 0) {
      where.push(`rb.location_id = ANY($${idx}::int[])`);
      values.push(params.location_ids);
      idx += 1;
    }

    const result = await pool.query(
      `${BATCH_WITH_DETAILS_SELECT}
       WHERE ${where.join(' AND ')}
       ORDER BY rb.updated_at DESC, rb.reserve_batch_id DESC`,
      values
    );

    const normalized = result.rows.map((row) => {
      const computedStatus = this.mapBatchStatus(
        Number(row.allocated_qty || 0),
        Number(row.consumed_qty || 0),
        Number(row.released_qty || 0)
      );

      return {
        ...row,
        status: computedStatus,
      } as ReserveBatchRecord;
    });

    if (params?.status && params.status !== 'all') {
      return normalized.filter((row) => row.status === params.status);
    }

    return normalized;
  }

  async listReserveHistory(params?: { reserve_id?: number; supply_order_id?: number }): Promise<ReserveHistoryRecord[]> {
    const values: any[] = [];
    const where: string[] = ['1=1'];
    let idx = 1;

    if (params?.reserve_id) {
      where.push(`rh.reserve_id = $${idx}`);
      values.push(params.reserve_id);
      idx += 1;
    }

    if (params?.supply_order_id) {
      where.push(`rp.supply_order_id = $${idx}`);
      values.push(params.supply_order_id);
      idx += 1;
    }

    const result = await pool.query(
      `SELECT
         rh.*,
         rp.reserve_code,
         rb.reserve_batch_code,
         so.supply_order_code,
         p.product_code,
         p.product_name,
         pb.batch_code,
         l.location_name
       FROM supply_order_item_reserve_history rh
       INNER JOIN supply_order_item_reserve rp ON rp.reserve_id = rh.reserve_id
       INNER JOIN supply_order so ON so.supply_order_id = rp.supply_order_id
       INNER JOIN product p ON p.product_id = rp.product_id
       LEFT JOIN supply_order_item_reserve_batch rb ON rb.reserve_batch_id = rh.reserve_batch_id
       LEFT JOIN production_batch pb ON pb.batch_id = rb.batch_id
       LEFT JOIN location l ON l.location_id = rb.location_id
       WHERE ${where.join(' AND ')}
       ORDER BY rh.created_at DESC, rh.reserve_history_id DESC
       LIMIT 500`,
      values
    );

    return result.rows;
  }

  async findProductReserveByItemIdForUpdate(
    client: PoolClient,
    supplyOrderItemId: number
  ): Promise<ReserveProductRecord | null> {
    const result = await client.query(
      `SELECT *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve
       WHERE supply_order_item_id = $1
       FOR UPDATE`,
      [supplyOrderItemId]
    );

    return result.rows[0] || null;
  }

  async upsertProductReserveForApprovalWithClient(
    client: PoolClient,
    data: {
      supply_order_item_id: number;
      supply_order_id: number;
      product_id: number;
      location_id: number;
      approved_qty: number;
      user_id: number;
    }
  ): Promise<ReserveProductRecord> {
    const nextReserveCode = await this.getNextReserveProductCode(client);

    const result = await client.query(
      `INSERT INTO supply_order_item_reserve
         (reserve_code, supply_order_item_id, supply_order_id, product_id, location_id, approved_qty, consumed_qty, released_qty, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 'OPEN', $7)
       ON CONFLICT (supply_order_item_id)
       DO UPDATE SET
         supply_order_id = EXCLUDED.supply_order_id,
         product_id = EXCLUDED.product_id,
         location_id = EXCLUDED.location_id,
         approved_qty = EXCLUDED.approved_qty,
         reserve_code = COALESCE(supply_order_item_reserve.reserve_code, EXCLUDED.reserve_code),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [
        nextReserveCode,
        data.supply_order_item_id,
        data.supply_order_id,
        data.product_id,
        data.location_id,
        data.approved_qty,
        data.user_id,
      ]
    );

    const row = result.rows[0];
    return this.refreshProductStatusWithClient(client, row.reserve_id);
  }

  async refreshProductStatusWithClient(
    client: PoolClient,
    reserveId: number
  ): Promise<ReserveProductRecord> {
    const current = await client.query(
      `SELECT *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve
       WHERE reserve_id = $1
       FOR UPDATE`,
      [reserveId]
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error('Reserve product record not found');
    }

    const allocatedResult = await client.query(
      `SELECT COALESCE(SUM(allocated_qty - consumed_qty - released_qty), 0)::int AS allocated_remaining_qty
       FROM supply_order_item_reserve_batch
       WHERE reserve_id = $1`,
      [reserveId]
    );
    const allocatedRemainingQty = Number(allocatedResult.rows[0]?.allocated_remaining_qty || 0);

    const status = this.mapProductStatus(
      row.approved_qty,
      row.consumed_qty,
      row.released_qty,
      allocatedRemainingQty
    );

    const updated = await client.query(
      `UPDATE supply_order_item_reserve
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE reserve_id = $2
       RETURNING *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [status, reserveId]
    );

    return updated.rows[0];
  }

  async addReserveHistoryWithClient(
    client: PoolClient,
    data: {
      reserve_id: number;
      reserve_batch_id?: number | null;
      event_type: ReserveHistoryEventType;
      qty_change: number;
      ref_type?: string | null;
      ref_id?: number | null;
      note?: string | null;
      created_by?: number | null;
    }
  ): Promise<void> {
    await client.query(
      `INSERT INTO supply_order_item_reserve_history
         (reserve_id, reserve_batch_id, event_type, qty_change, ref_type, ref_id, note, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.reserve_id,
        data.reserve_batch_id ?? null,
        data.event_type,
        data.qty_change,
        data.ref_type ?? null,
        data.ref_id ?? null,
        data.note ?? null,
        data.created_by ?? null,
      ]
    );
  }

  async getBatchReserveCurrentSumForUpdate(client: PoolClient, reserveId: number): Promise<number> {
    const result = await client.query(
      `SELECT COALESCE(SUM(allocated_qty - consumed_qty - released_qty), 0)::int AS total
       FROM supply_order_item_reserve_batch
       WHERE reserve_id = $1`,
      [reserveId]
    );

    return result.rows[0]?.total || 0;
  }

  async getBatchReserveByKeyForUpdate(
    client: PoolClient,
    reserveId: number,
    batchId: number,
    locationId: number
  ): Promise<ReserveBatchRecord | null> {
    const result = await client.query(
      `SELECT *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve_batch
       WHERE reserve_id = $1 AND batch_id = $2 AND location_id = $3
       FOR UPDATE`,
      [reserveId, batchId, locationId]
    );

    return result.rows[0] || null;
  }

  async addOrIncreaseBatchReserveWithClient(
    client: PoolClient,
    data: {
      reserve_id: number;
      supply_order_item_id: number;
      supply_order_id: number;
      product_id: number;
      batch_id: number;
      location_id: number;
      allocate_qty: number;
      user_id: number;
    }
  ): Promise<ReserveBatchRecord> {
    const nextReserveBatchCode = await this.getNextReserveBatchCode(client);

    const result = await client.query(
      `INSERT INTO supply_order_item_reserve_batch
         (reserve_batch_code, reserve_id, supply_order_item_id, supply_order_id, product_id, batch_id, location_id,
          allocated_qty, consumed_qty, released_qty, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 0, 0, 'PARTIAL', $9)
       ON CONFLICT (reserve_id, batch_id, location_id)
       DO UPDATE SET
         allocated_qty = supply_order_item_reserve_batch.allocated_qty + EXCLUDED.allocated_qty,
         reserve_batch_code = COALESCE(supply_order_item_reserve_batch.reserve_batch_code, EXCLUDED.reserve_batch_code),
         updated_at = CURRENT_TIMESTAMP
       RETURNING *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [
        nextReserveBatchCode,
        data.reserve_id,
        data.supply_order_item_id,
        data.supply_order_id,
        data.product_id,
        data.batch_id,
        data.location_id,
        data.allocate_qty,
        data.user_id,
      ]
    );

    const row = result.rows[0];
    const status = this.mapBatchStatus(row.allocated_qty, row.consumed_qty, row.released_qty);

    const statusResult = await client.query(
      `UPDATE supply_order_item_reserve_batch
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE reserve_batch_id = $2
       RETURNING *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [status, row.reserve_batch_id]
    );

    await this.refreshProductStatusWithClient(client, data.reserve_id);

    return statusResult.rows[0];
  }

  async increaseBatchInventoryReservedWithClient(
    client: PoolClient,
    locationId: number,
    productId: number,
    batchId: number,
    qtyDelta: number
  ): Promise<void> {
    const updateResult = await client.query(
      `UPDATE batch_inventory
       SET qty_reserved = qty_reserved + $4,
           qty_available = qty_on_hand - (qty_reserved + $4),
           updated_at = CURRENT_TIMESTAMP
       WHERE location_id = $1 AND product_id = $2 AND batch_id = $3
         AND qty_on_hand - qty_reserved >= $4`,
      [locationId, productId, batchId, qtyDelta]
    );

    if (!updateResult.rowCount || updateResult.rowCount <= 0) {
      throw new Error('Insufficient available quantity to allocate reserve for this batch');
    }
  }

  async consumeProductReserveWithClient(
    client: PoolClient,
    reserveId: number,
    qty: number
  ): Promise<ReserveProductRecord> {
    const current = await client.query(
      `SELECT *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve
       WHERE reserve_id = $1
       FOR UPDATE`,
      [reserveId]
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error('Reserve product record not found');
    }

    if (row.remaining_qty < qty) {
      throw new Error(
        `Reserve product remaining qty (${row.remaining_qty}) is less than transfer qty (${qty})`
      );
    }

    const updated = await client.query(
      `UPDATE supply_order_item_reserve
       SET consumed_qty = consumed_qty + $2,
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE reserve_id = $1
       RETURNING *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [
        reserveId,
        qty,
        this.mapProductStatus(row.approved_qty, row.consumed_qty + qty, row.released_qty, 0),
      ]
    );

    await this.refreshProductStatusWithClient(client, reserveId);

    return updated.rows[0];
  }

  async consumeBatchReserveWithClient(
    client: PoolClient,
    reserveBatchId: number,
    qty: number
  ): Promise<ReserveBatchRecord> {
    const current = await client.query(
      `SELECT *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve_batch
       WHERE reserve_batch_id = $1
       FOR UPDATE`,
      [reserveBatchId]
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error('Reserve batch record not found');
    }

    if (row.remaining_qty < qty) {
      throw new Error(
        `Reserve batch remaining qty (${row.remaining_qty}) is less than consumed qty (${qty})`
      );
    }

    const updated = await client.query(
      `UPDATE supply_order_item_reserve_batch
       SET consumed_qty = consumed_qty + $2,
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE reserve_batch_id = $1
       RETURNING *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [
        reserveBatchId,
        qty,
        this.mapBatchStatus(row.allocated_qty, row.consumed_qty + qty, row.released_qty),
      ]
    );

    await this.refreshProductStatusWithClient(client, row.reserve_id);

    return updated.rows[0];
  }

  async decreaseBatchInventoryReservedWithClient(
    client: PoolClient,
    locationId: number,
    productId: number,
    batchId: number,
    qtyDelta: number
  ): Promise<void> {
    const updated = await client.query(
      `UPDATE batch_inventory
       SET qty_reserved = GREATEST(qty_reserved - $4, 0),
           qty_available = qty_on_hand - GREATEST(qty_reserved - $4, 0),
           updated_at = CURRENT_TIMESTAMP
       WHERE location_id = $1 AND product_id = $2 AND batch_id = $3`,
      [locationId, productId, batchId, qtyDelta]
    );

    if (!updated.rowCount || updated.rowCount <= 0) {
      throw new Error('Batch inventory row not found while updating reserved quantity');
    }
  }

  async getOpenProductReservesByOrderForUpdate(
    client: PoolClient,
    orderId: number
  ): Promise<ReserveProductRecord[]> {
    const result = await client.query(
      `SELECT *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve
       WHERE supply_order_id = $1
         AND (approved_qty - consumed_qty - released_qty) > 0
       ORDER BY reserve_id ASC
       FOR UPDATE`,
      [orderId]
    );

    return result.rows;
  }

  async getOpenBatchReservesByReserveIdForUpdate(
    client: PoolClient,
    reserveId: number
  ): Promise<ReserveBatchRecord[]> {
    const result = await client.query(
      `SELECT *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve_batch
       WHERE reserve_id = $1
         AND (allocated_qty - consumed_qty - released_qty) > 0
       ORDER BY reserve_batch_id ASC
       FOR UPDATE`,
      [reserveId]
    );

    return result.rows;
  }

  async releaseBatchReserveWithClient(
    client: PoolClient,
    reserveBatchId: number,
    qty: number
  ): Promise<ReserveBatchRecord> {
    const current = await client.query(
      `SELECT *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve_batch
       WHERE reserve_batch_id = $1
       FOR UPDATE`,
      [reserveBatchId]
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error('Reserve batch record not found');
    }

    if (row.remaining_qty < qty) {
      throw new Error('Cannot release more than reserve batch remaining qty');
    }

    const updated = await client.query(
      `UPDATE supply_order_item_reserve_batch
       SET released_qty = released_qty + $2,
           status = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE reserve_batch_id = $1
       RETURNING *, (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [
        reserveBatchId,
        qty,
        this.mapBatchStatus(row.allocated_qty, row.consumed_qty, row.released_qty + qty),
      ]
    );

    await this.refreshProductStatusWithClient(client, row.reserve_id);

    return updated.rows[0];
  }

  async releaseProductReserveWithClient(
    client: PoolClient,
    reserveId: number,
    qty: number
  ): Promise<ReserveProductRecord> {
    const current = await client.query(
      `SELECT *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve
       WHERE reserve_id = $1
       FOR UPDATE`,
      [reserveId]
    );

    const row = current.rows[0];
    if (!row) {
      throw new Error('Reserve product record not found');
    }

    if (row.remaining_qty < qty) {
      throw new Error('Cannot release more than reserve product remaining qty');
    }

    const nextReleased = row.released_qty + qty;
    const status = this.mapProductStatus(row.approved_qty, row.consumed_qty, nextReleased, 0);

    const updated = await client.query(
      `UPDATE supply_order_item_reserve
       SET released_qty = released_qty + $2,
           status = $3,
           closed_at = CASE WHEN (approved_qty - consumed_qty - (released_qty + $2)) <= 0 THEN CURRENT_TIMESTAMP ELSE closed_at END,
           updated_at = CURRENT_TIMESTAMP
       WHERE reserve_id = $1
       RETURNING *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty`,
      [reserveId, qty, status]
    );

    await this.refreshProductStatusWithClient(client, reserveId);

    return updated.rows[0];
  }
}

export default new ReserveRepository();
