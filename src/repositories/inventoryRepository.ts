import { PoolClient } from 'pg';
import pool from '../config/database';
import {
  InventoryTransaction,
  InventoryTransactionWithDetails,
  TransactionType,
  ReferenceType,
} from '../models/InventoryTransaction';
import { BatchInventory, BatchInventoryWithDetails } from '../models/BatchInventory';

export class InventoryRepository {

  async cleanupZeroQuantityRows(
    retentionDays: number,
    client?: PoolClient
  ): Promise<number> {
    const safeRetentionDays =
      Number.isFinite(retentionDays) && retentionDays > 0
        ? Math.floor(retentionDays)
        : 30;

    const query = `DELETE FROM batch_inventory
                   WHERE qty_on_hand = 0
                     AND qty_reserved = 0
                     AND qty_available = 0
                     AND updated_at < (CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day'))`;

    const result = client
      ? await client.query(query, [safeRetentionDays])
      : await pool.query(query, [safeRetentionDays]);

    return result.rowCount ?? 0;
  }

  async createTransactionWithClient(
    client: PoolClient,
    data: {
      location_id: number;
      product_id: number;
      batch_id: number;
      reference_type: ReferenceType;
      reference_id: number;
      qty: number;
      transaction_type: TransactionType;
    }
  ): Promise<InventoryTransaction> {
    const result = await client.query(
      `INSERT INTO inventory_transaction
         (location_id, product_id, batch_id, reference_type,
          reference_id, qty, transaction_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        data.location_id,
        data.product_id,
        data.batch_id,
        data.reference_type,
        data.reference_id,
        data.qty,
        data.transaction_type,
      ]
    );
    return result.rows[0];
  }

  async existsProductionTransaction(
    batchId: number,
    client?: PoolClient
  ): Promise<boolean> {
    const q = `SELECT 1 FROM inventory_transaction
               WHERE reference_type = 'production_batch'
                 AND reference_id   = $1
               LIMIT 1`;
    const r = client
      ? await client.query(q, [batchId])
      : await pool.query(q, [batchId]);
    return r.rows.length > 0;
  }

  async findAllTransactions(
    locationIds?: number[]
  ): Promise<InventoryTransactionWithDetails[]> {
    const params: any[] = [];
    const where =
      locationIds && locationIds.length > 0
        ? (params.push(locationIds), 'WHERE it.location_id = ANY($1::int[])')
        : '';

    const result = await pool.query(
      `SELECT
         it.*,
         l.location_name,
         p.product_name,
         p.product_code,
         un.unit_name,
         pb.batch_code
       FROM inventory_transaction it
       LEFT JOIN location         l  ON it.location_id = l.location_id
       LEFT JOIN product          p  ON it.product_id  = p.product_id
       LEFT JOIN unit             un ON p.unit_id      = un.unit_id
       LEFT JOIN production_batch pb ON it.batch_id    = pb.batch_id
       ${where}
       ORDER BY it.created_at DESC`,
      params
    );
    return result.rows;
  }

  async upsertBatchInventoryWithClient(
    client: PoolClient,
    data: {
      location_id: number;
      product_id: number;
      batch_id: number;
      qty_change: number;
    }
  ): Promise<BatchInventory> {
    const result = await client.query(
      `WITH updated AS (
         UPDATE batch_inventory
         SET
           qty_on_hand   = qty_on_hand + $4,
           qty_available = qty_on_hand + $4 - qty_reserved,
           updated_at    = CURRENT_TIMESTAMP
         WHERE location_id = $1 AND product_id = $2 AND batch_id = $3
         RETURNING *
       ),
       inserted AS (
         INSERT INTO batch_inventory
           (location_id, product_id, batch_id, qty_on_hand, qty_reserved, qty_available, updated_at)
         SELECT $1, $2, $3, $4, 0, $4, CURRENT_TIMESTAMP
         WHERE NOT EXISTS (SELECT 1 FROM updated)
         RETURNING *
       )
       SELECT * FROM updated
       UNION ALL
       SELECT * FROM inserted
       LIMIT 1`,
      [data.location_id, data.product_id, data.batch_id, data.qty_change]
    );
    return result.rows[0];
  }

  async getQtyOnHand(
    locationId: number,
    productId: number,
    batchId: number,
    client?: PoolClient
  ): Promise<number> {
    const q = `SELECT COALESCE(qty_on_hand, 0)::int AS qty_on_hand
               FROM batch_inventory
               WHERE location_id = $1 AND product_id = $2 AND batch_id = $3`;
    const r = client
      ? await client.query(q, [locationId, productId, batchId])
      : await pool.query(q, [locationId, productId, batchId]);
    return r.rows.length ? r.rows[0].qty_on_hand : 0;
  }

  async findAllBatchInventory(
    locationIds?: number[]
  ): Promise<BatchInventoryWithDetails[]> {
    const params: any[] = [];
    const where =
      locationIds && locationIds.length > 0
        ? (params.push(locationIds), 'WHERE bi.location_id = ANY($1::int[])')
        : '';

    const result = await pool.query(
      `SELECT
         bi.*,
         l.location_name,
         p.product_name,
         p.product_code,
         un.unit_name,
         pb.batch_code,
         pb.production_date,
         pb.expired_date
       FROM batch_inventory bi
       LEFT JOIN location         l  ON bi.location_id = l.location_id
       LEFT JOIN product          p  ON bi.product_id  = p.product_id
       LEFT JOIN unit             un ON p.unit_id      = un.unit_id
       LEFT JOIN production_batch pb ON bi.batch_id    = pb.batch_id
       ${where}
       ORDER BY bi.updated_at DESC`,
      params
    );
    return result.rows;
  }
}

export default new InventoryRepository();
