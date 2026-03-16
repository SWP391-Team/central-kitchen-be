import pool from '../config/database';
import warehouseReceiveRepository from '../repositories/warehouseReceiveRepository';
import batchTransferRepository from '../repositories/batchTransferRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import { WarehouseReceiveWithDetails } from '../models/WarehouseReceive';

export class WarehouseReceiveService {
  async createWarehouseReceive(data: {
    batch_transfer_id: number;
    received_qty: number;
    received_date: string;
    received_by: number;
    created_by: number;
  }): Promise<WarehouseReceiveWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transfer = await batchTransferRepository.findByIdForUpdate(
        data.batch_transfer_id,
        client
      );
      if (!transfer) throw new Error('Batch transfer not found');
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
          await client.query(
            `UPDATE production_batch SET status = 'received' WHERE batch_id = $1`,
            [transfer.batch_id]
          );
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

  async getAllWarehouseReceives(): Promise<WarehouseReceiveWithDetails[]> {
    return warehouseReceiveRepository.findAll();
  }

  async getReceivesByTransferId(
    transferId: number
  ): Promise<WarehouseReceiveWithDetails[]> {
    return warehouseReceiveRepository.findByBatchTransferId(transferId);
  }
}

export default new WarehouseReceiveService();
