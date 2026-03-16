import { PoolClient } from 'pg';
import pool from '../config/database';
import { WarehouseReceive, WarehouseReceiveWithDetails } from '../models/WarehouseReceive';

const WITH_DETAILS_SELECT = `
  SELECT
    wr.*,
    pb.batch_code,
    p.product_name,
    p.product_code,
    l.location_name,
    u1.username AS received_by_username,
    u2.username AS created_by_username
  FROM warehouse_receive wr
  LEFT JOIN production_batch pb ON wr.batch_id     = pb.batch_id
  LEFT JOIN product          p  ON pb.product_id   = p.product_id
  LEFT JOIN location         l  ON wr.location_id  = l.location_id
  LEFT JOIN "user"           u1 ON wr.received_by  = u1.user_id
  LEFT JOIN "user"           u2 ON wr.created_by   = u2.user_id
`;

export class WarehouseReceiveRepository {
  async createWithClient(
    client: PoolClient,
    data: {
      batch_transfer_id: number;
      batch_id: number;
      location_id: number;
      received_qty: number;
      received_date: string;
      received_by: number;
      created_by: number;
    }
  ): Promise<WarehouseReceive> {
    const result = await client.query(
      `INSERT INTO warehouse_receive
         (warehouse_receive_code, batch_transfer_id, batch_id, location_id,
          received_qty, received_date, received_by, created_by, status)
       VALUES (
         'WR-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-' || LPAD(
           ((SELECT COUNT(*) FROM warehouse_receive WHERE warehouse_receive_code LIKE 'WR-' || TO_CHAR(NOW(), 'YYYYMMDD') || '-%') + 1)::text,
           3, '0'
         ),
         $1, $2, $3, $4, $5, $6, $7, 'Received')
       RETURNING *`,
      [
        data.batch_transfer_id,
        data.batch_id,
        data.location_id,
        data.received_qty,
        data.received_date,
        data.received_by,
        data.created_by,
      ]
    );
    return result.rows[0];
  }

  async findAll(): Promise<WarehouseReceiveWithDetails[]> {
    const result = await pool.query(
      `${WITH_DETAILS_SELECT} ORDER BY wr.created_at DESC`
    );
    return result.rows;
  }

  async findByBatchTransferId(
    transferId: number
  ): Promise<WarehouseReceiveWithDetails[]> {
    const result = await pool.query(
      `${WITH_DETAILS_SELECT} WHERE wr.batch_transfer_id = $1 ORDER BY wr.created_at DESC`,
      [transferId]
    );
    return result.rows;
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
}

export default new WarehouseReceiveRepository();
