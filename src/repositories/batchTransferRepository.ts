import { PoolClient } from 'pg';
import pool from '../config/database';
import {
  BatchTransfer,
  BatchTransferWithDetails,
} from '../models/BatchTransfer';

const WITH_DETAILS_SELECT = `
  SELECT
    bt.*,
    pb.batch_code,
    p.product_name,
    p.product_code,
    un.unit_name,
    fl.location_name AS from_location_name,
    tl.location_name AS to_location_name,
    u.username       AS created_by_username,
    COALESCE(wr_sum.already_received_qty, 0)::int AS already_received_qty
  FROM batch_transfer bt
  LEFT JOIN production_batch pb ON bt.batch_id        = pb.batch_id
  LEFT JOIN product          p  ON bt.product_id      = p.product_id
  LEFT JOIN unit             un ON p.unit_id          = un.unit_id
  LEFT JOIN (
    SELECT
      batch_transfer_id,
      SUM(received_qty)::int AS already_received_qty
    FROM warehouse_receive
    GROUP BY batch_transfer_id
  ) wr_sum ON bt.batch_transfer_id = wr_sum.batch_transfer_id
  LEFT JOIN location         fl ON bt.from_location_id = fl.location_id
  LEFT JOIN location         tl ON bt.to_location_id   = tl.location_id
  LEFT JOIN "user"           u  ON bt.created_by       = u.user_id
`;

export class BatchTransferRepository {
  async createWithClient(
    client: PoolClient,
    dto: {
      batch_id: number;
      product_id: number;
      from_location_id: number;
      to_location_id: number;
      transfer_qty: number;
      transfer_date: string;
      created_by: number;
      supply_order_item_id?: number;
    }
  ): Promise<BatchTransfer> {
    const result = await client.query(
      `INSERT INTO batch_transfer
         (batch_transfer_code, supply_order_item_id, batch_id, product_id, from_location_id, to_location_id,
          transfer_qty, transfer_date, lost_qty, status, created_by)
       VALUES (
         'BT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
           ((SELECT COUNT(*) FROM batch_transfer WHERE batch_transfer_code LIKE 'BT-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%') + 1)::text,
           3, '0'
         ),
         $1, $2, $3, $4, $5, $6, $7, 0, 'Delivering', $8)
       RETURNING *`,
      [
        dto.supply_order_item_id ?? null,
        dto.batch_id,
        dto.product_id,
        dto.from_location_id,
        dto.to_location_id,
        dto.transfer_qty,
        dto.transfer_date,
        dto.created_by,
      ]
    );
    return result.rows[0];
  }

  async findAll(locationIds?: number[]): Promise<BatchTransferWithDetails[]> {
    const params: any[] = [];
    const where =
      locationIds && locationIds.length > 0
        ? (params.push(locationIds), 'WHERE bt.to_location_id = ANY($1::int[])')
        : '';

    const result = await pool.query(
      `${WITH_DETAILS_SELECT} ${where} ORDER BY bt.created_at DESC`,
      params
    );
    return result.rows;
  }

  async findById(id: number): Promise<BatchTransferWithDetails | null> {
    const result = await pool.query(
      `${WITH_DETAILS_SELECT} WHERE bt.batch_transfer_id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByIdForUpdate(
    id: number,
    client: PoolClient
  ): Promise<BatchTransfer | null> {
    const result = await client.query(
      `SELECT * FROM batch_transfer WHERE batch_transfer_id = $1 FOR UPDATE`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByBatchId(batchId: number): Promise<BatchTransferWithDetails[]> {
    const result = await pool.query(
      `${WITH_DETAILS_SELECT} WHERE bt.batch_id = $1 ORDER BY bt.created_at DESC`,
      [batchId]
    );
    return result.rows;
  }

  async findDelivering(locationIds?: number[]): Promise<BatchTransferWithDetails[]> {
    const params: any[] = [];
    const locationClause =
      locationIds && locationIds.length > 0
        ? (params.push(locationIds), ` AND bt.to_location_id = ANY($${params.length}::int[])`)
        : '';

    const result = await pool.query(
      `${WITH_DETAILS_SELECT} WHERE bt.status = 'Delivering'${locationClause} ORDER BY bt.created_at DESC`,
      params
    );
    return result.rows;
  }

  async getSumTransferQtyByBatchId(
    batchId: number,
    client?: PoolClient
  ): Promise<number> {
    const q = `SELECT COALESCE(SUM(transfer_qty), 0)::int AS total
               FROM batch_transfer WHERE batch_id = $1`;
    const r = client
      ? await client.query(q, [batchId])
      : await pool.query(q, [batchId]);
    return r.rows[0].total;
  }

  async getSumReceivedQtyByTransferId(
    transferId: number,
    client?: PoolClient
  ): Promise<number> {
    const q = `SELECT COALESCE(SUM(received_qty), 0)::int AS total
               FROM warehouse_receive WHERE batch_transfer_id = $1`;
    const r = client
      ? await client.query(q, [transferId])
      : await pool.query(q, [transferId]);
    return r.rows[0].total;
  }

  async countAllByBatchId(batchId: number, client?: PoolClient): Promise<number> {
    const q = `SELECT COUNT(*)::int AS cnt FROM batch_transfer WHERE batch_id = $1`;
    const r = client
      ? await client.query(q, [batchId])
      : await pool.query(q, [batchId]);
    return r.rows[0].cnt;
  }

  async countReceivedByBatchId(
    batchId: number,
    client?: PoolClient
  ): Promise<number> {
    const q = `SELECT COUNT(*)::int AS cnt
               FROM batch_transfer
               WHERE batch_id = $1 AND status = 'Received'`;
    const r = client
      ? await client.query(q, [batchId])
      : await pool.query(q, [batchId]);
    return r.rows[0].cnt;
  }

  async updateStatusWithClient(
    client: PoolClient,
    transferId: number,
    status: 'Delivering' | 'Received',
    lostQty: number
  ): Promise<BatchTransfer | null> {
    const result = await client.query(
      `UPDATE batch_transfer
         SET status = $1, lost_qty = $2
       WHERE batch_transfer_id = $3
       RETURNING *`,
      [status, lostQty, transferId]
    );
    return result.rows[0] || null;
  }
}

export default new BatchTransferRepository();
