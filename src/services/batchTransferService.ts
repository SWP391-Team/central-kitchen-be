import pool from '../config/database';
import batchTransferRepository from '../repositories/batchTransferRepository';
import productionBatchRepository from '../repositories/productionBatchRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import { BatchTransferCreateDto, BatchTransferWithDetails } from '../models/BatchTransfer';

export class BatchTransferService {

  async createBatchTransfer(
    dto: BatchTransferCreateDto
  ): Promise<BatchTransferWithDetails> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const batchResult = await client.query(
        `SELECT * FROM production_batch WHERE batch_id = $1 FOR UPDATE`,
        [dto.batch_id]
      );
      const batch = batchResult.rows[0];
      if (!batch) throw new Error('Batch not found');

      if (batch.expired_date) {
        const expiredDate = new Date(batch.expired_date);
        expiredDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (expiredDate < today) {
          throw new Error('Cannot transfer an expired batch');
        }
      }

      if (!batch.good_qty || batch.good_qty <= 0) {
        throw new Error('Batch has no good quantity to transfer');
      }

      if (dto.transfer_qty <= 0) {
        throw new Error('Transfer quantity must be greater than 0');
      }

      const existingTransferQty =
        await batchTransferRepository.getSumTransferQtyByBatchId(
          dto.batch_id,
          client
        );
      const remainingQty = batch.good_qty - existingTransferQty;
      if (dto.transfer_qty > remainingQty) {
        throw new Error(
          `Transfer quantity (${dto.transfer_qty}) exceeds remaining transferable quantity (${remainingQty})`
        );
      }

      const ckWarehouseResult = await client.query(
        `SELECT location_id
         FROM location
         WHERE location_type = 'CK_WAREHOUSE'
           AND is_active = true
         ORDER BY location_id ASC
         LIMIT 1`
      );
      if (ckWarehouseResult.rows.length === 0) {
        throw new Error('CK Warehouse location not found');
      }
      const ckWarehouse = ckWarehouseResult.rows[0];

      const sourceLocationResult = await client.query(
        `SELECT bi.location_id
         FROM batch_inventory bi
         INNER JOIN location l ON l.location_id = bi.location_id
         WHERE l.location_type = 'CK_PRODUCTION'
           AND l.is_active = true
           AND bi.product_id = $1
           AND bi.batch_id = $2
           AND bi.qty_on_hand > 0
         ORDER BY bi.qty_on_hand DESC, bi.location_id ASC
         LIMIT 1`,
        [batch.product_id, dto.batch_id]
      );

      let ckProductionLocationId: number;
      if (sourceLocationResult.rows.length > 0) {
        ckProductionLocationId = sourceLocationResult.rows[0].location_id;
      } else {
        const ckProductionResult = await client.query(
          `SELECT location_id
           FROM location
           WHERE location_type = 'CK_PRODUCTION'
             AND is_active = true
           ORDER BY location_id ASC
           LIMIT 1`
        );
        if (ckProductionResult.rows.length === 0) {
          throw new Error('CK Production location not found');
        }
        ckProductionLocationId = ckProductionResult.rows[0].location_id;

        const alreadyHasProductionInventory =
          await inventoryRepository.existsProductionTransaction(dto.batch_id, client);
        if (!alreadyHasProductionInventory && existingTransferQty === 0 && batch.good_qty > 0) {
          await inventoryRepository.createTransactionWithClient(client, {
            location_id: ckProductionLocationId,
            product_id: batch.product_id,
            batch_id: dto.batch_id,
            reference_type: 'production_batch',
            reference_id: dto.batch_id,
            qty: batch.good_qty,
            transaction_type: 'IN',
          });

          await inventoryRepository.upsertBatchInventoryWithClient(client, {
            location_id: ckProductionLocationId,
            product_id: batch.product_id,
            batch_id: dto.batch_id,
            qty_change: batch.good_qty,
          });
        }
      }

      const currentQty = await inventoryRepository.getQtyOnHand(
        ckProductionLocationId,
        batch.product_id,
        dto.batch_id,
        client
      );
      if (currentQty - dto.transfer_qty < 0) {
        throw new Error(
          `Insufficient inventory. Available: ${currentQty}, Requested: ${dto.transfer_qty}`
        );
      }

      const batchTransfer = await batchTransferRepository.createWithClient(
        client,
        {
          batch_id: dto.batch_id,
          product_id: batch.product_id,
          from_location_id: ckProductionLocationId,
          to_location_id: ckWarehouse.location_id,
          transfer_qty: dto.transfer_qty,
          transfer_date: dto.transfer_date,
          created_by: dto.created_by,
        }
      );

      await inventoryRepository.createTransactionWithClient(client, {
        location_id: ckProductionLocationId,
        product_id: batch.product_id,
        batch_id: dto.batch_id,
        reference_type: 'batch_transfer',
        reference_id: batchTransfer.batch_transfer_id,
        qty: -dto.transfer_qty,
        transaction_type: 'OUT',
      });

      await inventoryRepository.upsertBatchInventoryWithClient(client, {
        location_id: ckProductionLocationId,
        product_id: batch.product_id,
        batch_id: dto.batch_id,
        qty_change: -dto.transfer_qty,
      });

      const newTotalTransferred = existingTransferQty + dto.transfer_qty;
      const newBatchStatus =
        newTotalTransferred >= batch.good_qty ? 'delivered' : 'delivering';
      await productionBatchRepository.updateStatusWithHistory(dto.batch_id, newBatchStatus, {
        client,
        changed_by: dto.created_by,
        note: 'Batch transfer created',
      });

      await client.query('COMMIT');

      const result = await batchTransferRepository.findById(
        batchTransfer.batch_transfer_id
      );
      return result!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAllBatchTransfers(locationIds?: number[]): Promise<BatchTransferWithDetails[]> {
    return batchTransferRepository.findAll(locationIds);
  }

  async getBatchTransfersByBatchId(
    batchId: number
  ): Promise<BatchTransferWithDetails[]> {
    return batchTransferRepository.findByBatchId(batchId);
  }

  async getBatchTransferById(
    transferId: number
  ): Promise<BatchTransferWithDetails | null> {
    return batchTransferRepository.findById(transferId);
  }

  async getDeliveringBatchTransfers(
    locationIds?: number[]
  ): Promise<BatchTransferWithDetails[]> {
    return batchTransferRepository.findDelivering(locationIds);
  }

  async completeReceive(transferId: number, changedBy?: number): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const transfer = await batchTransferRepository.findByIdForUpdate(
        transferId,
        client
      );
      if (!transfer) throw new Error('Batch transfer not found');
      if (transfer.status !== 'Delivering') {
        throw new Error('Batch transfer must be in Delivering status');
      }

      const sumReceived =
        await batchTransferRepository.getSumReceivedQtyByTransferId(
          transferId,
          client
        );
      if (sumReceived >= transfer.transfer_qty) {
        throw new Error('Batch transfer is already fully received');
      }

      const lostQty = transfer.transfer_qty - sumReceived;
      await batchTransferRepository.updateStatusWithClient(
        client,
        transferId,
        'Received',
        lostQty
      );

      const total = await batchTransferRepository.countAllByBatchId(
        transfer.batch_id,
        client
      );
      const received = await batchTransferRepository.countReceivedByBatchId(
        transfer.batch_id,
        client
      );
      if (total > 0 && total === received) {
        await productionBatchRepository.updateStatusWithHistory(transfer.batch_id, 'received', {
          client,
          changed_by: changedBy ?? null,
          note: 'All transfers for batch received',
        });
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new BatchTransferService();
