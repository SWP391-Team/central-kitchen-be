import pool from '../config/database';
import warehouseReceiveRepository from '../repositories/warehouseReceiveRepository';
import batchTransferRepository from '../repositories/batchTransferRepository';
import productionBatchRepository from '../repositories/productionBatchRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import { ReceivedBySuggestion, WarehouseReceiveWithDetails } from '../models/WarehouseReceive';

export class WarehouseReceiveService {
  private toId(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 0;
    }
    return parsed;
  }

  private normalizeLocationIds(rawIds: unknown[]): number[] {
    const ids = rawIds
      .map((id) => {
        if (typeof id === 'number') return id;
        if (typeof id === 'string' && id.trim() !== '') {
          const parsed = Number(id);
          return Number.isFinite(parsed) ? parsed : NaN;
        }
        return NaN;
      })
      .filter((id) => Number.isInteger(id) && id > 0) as number[];

    return Array.from(new Set(ids));
  }

  private async resolveUserLocationScope(
    userId: number,
    rawLocationIds?: unknown[]
  ): Promise<number[]> {
    const tokenScope = this.normalizeLocationIds(rawLocationIds || []);
    if (tokenScope.length > 0) {
      return tokenScope;
    }

    const result = await pool.query(
      `SELECT
         u.location_id,
         COALESCE(
           ARRAY_AGG(ul.location_id) FILTER (WHERE ul.location_id IS NOT NULL),
           ARRAY[]::int[]
         ) AS location_ids
       FROM "user" u
       LEFT JOIN user_location ul ON ul.user_id = u.user_id
       WHERE u.user_id = $1
       GROUP BY u.user_id, u.location_id`,
      [userId]
    );

    if (result.rows.length === 0) {
      return [];
    }

    const row = result.rows[0];
    const ids = Array.isArray(row.location_ids)
      ? this.normalizeLocationIds(row.location_ids)
      : [];

    if (ids.length > 0) {
      return ids;
    }

    return this.normalizeLocationIds([row.location_id]);
  }

  private async validateReceivedByUser(receivedBy: number, locationId: number): Promise<void> {
    const result = await pool.query(
      `SELECT u.user_id
       FROM "user" u
       WHERE u.user_id = $1
         AND u.is_active = true
         AND (
           u.location_id = $2
           OR EXISTS (
             SELECT 1
             FROM user_location ul
             WHERE ul.user_id = u.user_id
               AND ul.location_id = $2
           )
         )
       LIMIT 1`,
      [receivedBy, locationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Received By user is invalid or not in corresponding location');
    }
  }

  async createWarehouseReceive(data: {
    batch_transfer_id: number;
    received_qty: number;
    received_date: string;
    received_by: number;
    created_by: number;
    user_role_id?: number;
    user_location_ids?: number[];
    requester_user_id?: number;
  }): Promise<WarehouseReceiveWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transfer = await batchTransferRepository.findByIdForUpdate(
        data.batch_transfer_id,
        client
      );
      if (!transfer) throw new Error('Batch transfer not found');

      await this.validateReceivedByUser(data.received_by, transfer.to_location_id);

      if (data.user_role_id === 3) {
        const allowedLocations = await this.resolveUserLocationScope(
          data.requester_user_id || data.created_by,
          data.user_location_ids
        );
        const toLocationId = this.toId(transfer.to_location_id);
        if (!allowedLocations.includes(toLocationId)) {
          throw new Error('Store Staff can only receive transfers to assigned store locations');
        }
      }

      if (transfer.status !== 'Delivering') {
        throw new Error('Batch transfer is not in Delivering status');
      }

      const sumReceived =
        await batchTransferRepository.getSumReceivedQtyByTransferId(
          data.batch_transfer_id,
          client
        );

      if (sumReceived >= transfer.transfer_qty) {
        throw new Error('Batch transfer has already been fully received');
      }

      if (data.received_qty < 0) {
        throw new Error('Received quantity must be >= 0');
      }

      const remainingQty = transfer.transfer_qty - sumReceived;
      if (data.received_qty > remainingQty) {
        throw new Error(
          `Received quantity (${data.received_qty}) exceeds remaining receivable quantity (${remainingQty})`
        );
      }

      const wareReceive = await warehouseReceiveRepository.createWithClient(
        client,
        {
          is_over_delivery: !!(
            transfer.supply_order_item_id &&
            (
              await client.query(
                `SELECT so.status
                 FROM supply_order_item soi
                 INNER JOIN supply_order so ON so.supply_order_id = soi.supply_order_id
                 WHERE soi.supply_order_item_id = $1`,
                [transfer.supply_order_item_id]
              )
            ).rows[0]?.status === 'Closed'
          ),
          batch_transfer_id: data.batch_transfer_id,
          batch_id: transfer.batch_id,
          location_id: transfer.to_location_id,
          received_qty: data.received_qty,
          received_date: data.received_date,
          received_by: data.received_by,
          created_by: data.created_by,
        }
      );

      await inventoryRepository.createTransactionWithClient(client, {
        location_id: transfer.to_location_id,
        product_id: transfer.product_id,
        batch_id: transfer.batch_id,
        reference_type: 'warehouse_receive',
        reference_id: wareReceive.warehouse_receive_id,
        qty: data.received_qty,
        transaction_type: 'IN',
      });

      await inventoryRepository.upsertBatchInventoryWithClient(client, {
        location_id: transfer.to_location_id,
        product_id: transfer.product_id,
        batch_id: transfer.batch_id,
        qty_change: data.received_qty,
      });

      const newSumReceived = sumReceived + data.received_qty;
      if (newSumReceived >= transfer.transfer_qty) {
        await batchTransferRepository.updateStatusWithClient(
          client,
          data.batch_transfer_id,
          'Received',
          0
        );

        const total = await batchTransferRepository.countAllByBatchId(
          transfer.batch_id,
          client
        );
        const receivedCount =
          await batchTransferRepository.countReceivedByBatchId(
            transfer.batch_id,
            client
          );
        if (total > 0 && total === receivedCount) {
          await productionBatchRepository.updateStatusWithHistory(transfer.batch_id, 'received', {
            client,
            changed_by: data.received_by,
            note: 'All transfers for batch received',
          });
        }
      }

      await client.query('COMMIT');

      const allReceives =
        await warehouseReceiveRepository.findByBatchTransferId(
          data.batch_transfer_id
        );
      const created = allReceives.find(
        (r) => r.warehouse_receive_id === wareReceive.warehouse_receive_id
      );
      return created!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllWarehouseReceives(
    locationIds?: number[]
  ): Promise<WarehouseReceiveWithDetails[]> {
    return warehouseReceiveRepository.findAll(locationIds);
  }

  async getReceivesByTransferId(
    transferId: number,
    locationIds?: number[]
  ): Promise<WarehouseReceiveWithDetails[]> {
    return warehouseReceiveRepository.findByBatchTransferId(transferId, locationIds);
  }

  async getWarehouseReceiveById(
    receiveId: number,
    locationIds?: number[]
  ): Promise<WarehouseReceiveWithDetails | null> {
    return warehouseReceiveRepository.findById(receiveId, locationIds);
  }

  async searchReceivedBySuggestions(params: {
    batch_transfer_id: number;
    requester_user_id: number;
    requester_role_id?: number;
    requester_location_ids?: number[];
    keyword?: string;
  }): Promise<ReceivedBySuggestion[]> {
    const transfer = await batchTransferRepository.findById(params.batch_transfer_id);
    if (!transfer) {
      throw new Error('Batch transfer not found');
    }

    const toLocationId = this.toId(transfer.to_location_id);
    if (!toLocationId) {
      throw new Error('Invalid destination location for this transfer');
    }

    if (params.requester_role_id === 3) {
      const allowedLocations = await this.resolveUserLocationScope(
        params.requester_user_id,
        params.requester_location_ids
      );
      if (!allowedLocations.includes(toLocationId)) {
        throw new Error('Store Staff can only access users in assigned store locations');
      }
    }

    const values: any[] = [toLocationId];
    let where = `
      u.is_active = true
      AND (
        u.location_id = $1
        OR EXISTS (
          SELECT 1
          FROM user_location ul
          WHERE ul.user_id = u.user_id
            AND ul.location_id = $1
        )
      )
    `;

    if (params.keyword && params.keyword.trim()) {
      values.push(`%${params.keyword.trim()}%`);
      where += ` AND (u.username ILIKE $2 OR u.user_code ILIKE $2)`;
    }

    const result = await pool.query(
      `SELECT u.user_id, u.user_code, u.username
       FROM "user" u
       WHERE ${where}
       ORDER BY u.username ASC
       LIMIT 20`,
      values
    );

    return result.rows;
  }
}

export default new WarehouseReceiveService();
