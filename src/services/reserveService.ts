import { PoolClient } from 'pg';
import pool from '../config/database';
import reserveRepository from '../repositories/reserveRepository';
import { ReserveBatchAllocationDto, ReserveBatchRecord, ReserveHistoryRecord, ReserveProductRecord } from '../models/Reserve';

interface AuthUser {
  user_id: number;
  role_id: number;
  location_id: number | null;
  location_ids: number[];
}

export class ReserveService {
  private normalizeLocationIds(raw: unknown[]): number[] {
    const mapped = raw
      .map((id) => {
        if (typeof id === 'number') return id;
        if (typeof id === 'string' && id.trim() !== '') {
          const parsed = Number(id);
          return Number.isFinite(parsed) ? parsed : NaN;
        }
        return NaN;
      })
      .filter((id) => Number.isInteger(id) && id > 0) as number[];

    return Array.from(new Set(mapped));
  }

  private getLocationScope(user?: AuthUser): number[] | undefined {
    if (!user) return undefined;
    if (user.role_id === 1 || user.role_id === 2) {
      return undefined;
    }

    const scoped = this.normalizeLocationIds(user.location_ids || []);
    if (scoped.length > 0) {
      return scoped;
    }

    return user.location_id ? [user.location_id] : [];
  }

  async listProductReserves(user?: AuthUser, params?: {
    status?: string;
    product_id?: number;
    supply_order_code?: string;
    supply_order_item_id?: number;
  }): Promise<ReserveProductRecord[]> {
    const locationScope = this.getLocationScope(user);
    return reserveRepository.listProductReserves({
      status: params?.status,
      product_id: params?.product_id,
      supply_order_code: params?.supply_order_code,
      supply_order_item_id: params?.supply_order_item_id,
      location_ids: locationScope,
    });
  }

  async listBatchReserves(user?: AuthUser, params?: {
    status?: string;
    product_id?: number;
    supply_order_code?: string;
    supply_order_item_id?: number;
  }): Promise<ReserveBatchRecord[]> {
    const locationScope = this.getLocationScope(user);
    return reserveRepository.listBatchReserves({
      status: params?.status,
      product_id: params?.product_id,
      supply_order_code: params?.supply_order_code,
      supply_order_item_id: params?.supply_order_item_id,
      location_ids: locationScope,
    });
  }

  async listReserveHistory(_user?: AuthUser, params?: {
    reserve_id?: number;
    supply_order_id?: number;
  }): Promise<ReserveHistoryRecord[]> {
    return reserveRepository.listReserveHistory(params);
  }

  async allocateReserveBatches(
    user: AuthUser | undefined,
    reserveId: number,
    allocations: ReserveBatchAllocationDto[]
  ): Promise<{ reserve: ReserveProductRecord; allocatedBatches: ReserveBatchRecord[] }> {
    if (!user || user.role_id !== 2) {
      throw new Error('Only Central Staff can allocate reserve batches');
    }

    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new Error('allocations is required');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const reserve = await this.getReserveByIdForUpdate(client, reserveId);
      const reserveRemaining = Number(reserve.remaining_qty || 0);
      if (reserveRemaining <= 0) {
        throw new Error('Reserve product has no remaining quantity to allocate');
      }

      const currentBatchReserved = await reserveRepository.getBatchReserveCurrentSumForUpdate(
        client,
        reserve.reserve_id
      );

      const totalRequestedAllocate = allocations.reduce((sum, item) => {
        if (!item.batch_id || item.batch_id <= 0) {
          throw new Error('Invalid batch_id in allocations');
        }
        if (!item.location_id || item.location_id <= 0) {
          throw new Error('Invalid location_id in allocations');
        }
        if (!item.allocate_qty || item.allocate_qty <= 0) {
          throw new Error('allocate_qty must be greater than 0');
        }
        return sum + item.allocate_qty;
      }, 0);

      if (currentBatchReserved + totalRequestedAllocate > reserveRemaining) {
        throw new Error(
          `sum(reserve_batch) <= reserve_product violated. Current reserve batch: ${currentBatchReserved}, ` +
            `new allocate: ${totalRequestedAllocate}, reserve product remaining: ${reserveRemaining}`
        );
      }

      const allocatedBatches: ReserveBatchRecord[] = [];
      for (const item of allocations) {
        const batchResult = await client.query(
          `SELECT expired_date
           FROM production_batch
           WHERE batch_id = $1
           FOR UPDATE`,
          [item.batch_id]
        );

        if (batchResult.rows.length === 0) {
          throw new Error(`Batch ${item.batch_id} not found`);
        }

        const expiredValue = batchResult.rows[0]?.expired_date;
        if (expiredValue) {
          const expiredDate = new Date(expiredValue);
          expiredDate.setHours(0, 0, 0, 0);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (expiredDate < today) {
            throw new Error(`Batch ${item.batch_id} is expired and cannot be allocated`);
          }
        }

        const inserted = await reserveRepository.addOrIncreaseBatchReserveWithClient(client, {
          reserve_id: reserve.reserve_id,
          supply_order_item_id: reserve.supply_order_item_id,
          supply_order_id: reserve.supply_order_id,
          product_id: reserve.product_id,
          batch_id: item.batch_id,
          location_id: item.location_id,
          allocate_qty: item.allocate_qty,
          user_id: user.user_id,
        });

        await reserveRepository.increaseBatchInventoryReservedWithClient(
          client,
          item.location_id,
          reserve.product_id,
          item.batch_id,
          item.allocate_qty
        );

        await reserveRepository.addReserveHistoryWithClient(client, {
          reserve_id: reserve.reserve_id,
          reserve_batch_id: inserted.reserve_batch_id,
          event_type: 'BATCH_ALLOCATE',
          qty_change: item.allocate_qty,
          ref_type: 'manual_allocate',
          note: 'Allocate reserve batch from Reserve page',
          created_by: user.user_id,
        });

        allocatedBatches.push(inserted);
      }

      await client.query('COMMIT');

      return {
        reserve: await this.getReserveById(reserveId),
        allocatedBatches,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async ensureReserveOnApproveWithClient(
    client: PoolClient,
    data: {
      supply_order_item_id: number;
      supply_order_id: number;
      product_id: number;
      location_id: number;
      approved_qty: number;
      user_id: number;
    }
  ): Promise<void> {
    if (data.approved_qty <= 0) {
      return;
    }

    const reserve = await reserveRepository.upsertProductReserveForApprovalWithClient(client, data);

    await reserveRepository.addReserveHistoryWithClient(client, {
      reserve_id: reserve.reserve_id,
      event_type: reserve.created_at === reserve.updated_at ? 'APPROVE_CREATE' : 'APPROVE_UPDATE',
      qty_change: data.approved_qty,
      ref_type: 'supply_order_approve',
      ref_id: data.supply_order_id,
      created_by: data.user_id,
      note: 'Create/update reserve product after supply order approval',
    });
  }

  async validateDeliveryBatchRuleWithClient(
    client: PoolClient,
    data: {
      supply_order_item_id: number;
      batch_id: number;
      location_id: number;
      transfer_qty: number;
    }
  ): Promise<void> {
    const batchId = Number(data.batch_id);
    const locationId = Number(data.location_id);
    const transferQty = Number(data.transfer_qty);

    const reserve = await reserveRepository.findProductReserveByItemIdForUpdate(
      client,
      data.supply_order_item_id
    );

    if (!reserve) {
      return;
    }

    const reserveRemaining = Number(reserve.remaining_qty || 0);
    if (reserveRemaining <= 0) {
      throw new Error('Reserve product has no remaining quantity for delivery');
    }

    const batchResult = await client.query(
      `SELECT
         reserve_batch_id,
         batch_id,
         location_id,
         (allocated_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve_batch
       WHERE reserve_id = $1
         AND (allocated_qty - consumed_qty - released_qty) > 0
       ORDER BY reserve_batch_id ASC
       FOR UPDATE`,
      [reserve.reserve_id]
    );

    const totalAllocatedRemaining = batchResult.rows.reduce(
      (sum, row) => sum + Number(row.remaining_qty || 0),
      0
    );

    const matchedBatch = batchResult.rows.find(
      (row) => Number(row.batch_id) === batchId && Number(row.location_id) === locationId
    );

    const inventoryResult = await client.query(
      `SELECT COALESCE(qty_available, 0)::int AS qty_available
       FROM batch_inventory
       WHERE location_id = $1
         AND product_id = $2
         AND batch_id = $3
       FOR UPDATE`,
      [locationId, reserve.product_id, batchId]
    );

    const freeQtyAvailable = Number(inventoryResult.rows[0]?.qty_available || 0);

    if (batchResult.rows.length === 0) {
      const maxNonAllocatedDeliverable = Math.max(freeQtyAvailable, 0);
      if (transferQty > maxNonAllocatedDeliverable) {
        throw new Error(
          `Transfer qty (${transferQty}) exceeds allowed non-allocated qty (${maxNonAllocatedDeliverable}) ` +
            `for selected batch`
        );
      }
      return;
    }

    const isFullAllocation = totalAllocatedRemaining >= reserveRemaining;
    if (isFullAllocation) {
      if (!matchedBatch) {
        throw new Error('This item is fully allocated by batch. Delivery must use an allocated batch.');
      }

      const matchedRemaining = Number(matchedBatch.remaining_qty || 0);
      if (transferQty > matchedRemaining) {
        throw new Error(
          `Transfer qty (${transferQty}) exceeds allocated remaining qty (${matchedRemaining}) for selected batch`
        );
      }

      return;
    }

    const freeInventoryDeliverable = Math.max(freeQtyAvailable, 0);

    if (!matchedBatch) {
      if (transferQty > freeInventoryDeliverable) {
        throw new Error(
          `This item is partially allocated. Non-allocated batch delivery is limited to free inventory qty (${freeInventoryDeliverable})`
        );
      }
      return;
    }

    const matchedRemaining = Number(matchedBatch.remaining_qty || 0);
    const allocatedTake = Math.min(transferQty, matchedRemaining);
    const unallocatedTake = Math.max(transferQty - allocatedTake, 0);

    if (unallocatedTake > freeInventoryDeliverable) {
      throw new Error(
        `Transfer qty (${transferQty}) exceeds allowed qty for selected batch in partial-allocation mode. ` +
          `Allocated take: ${allocatedTake}, requested unallocated: ${unallocatedTake}, ` +
          `max non-allocated allowed by free inventory: ${freeInventoryDeliverable}`
      );
    }
  }

  async consumeOnDeliveryWithClient(
    client: PoolClient,
    data: {
      supply_order_item_id: number;
      batch_id: number;
      location_id: number;
      transfer_qty: number;
      transfer_id: number;
      user_id: number;
    }
  ): Promise<void> {
    const batchId = Number(data.batch_id);
    const locationId = Number(data.location_id);

    const reserve = await reserveRepository.findProductReserveByItemIdForUpdate(
      client,
      data.supply_order_item_id
    );

    if (!reserve) {
      return;
    }

    const qty = data.transfer_qty;
    if (qty <= 0) {
      return;
    }

    const batchReserve = await reserveRepository.getBatchReserveByKeyForUpdate(
      client,
      reserve.reserve_id,
      batchId,
      locationId
    );
    const historyReserveBatchId = batchReserve?.reserve_batch_id ?? null;

    let consumedFromBatch = 0;
    if (batchReserve) {
      const batchRemaining = Number(batchReserve.remaining_qty || 0);
      consumedFromBatch = Math.min(batchRemaining, qty);
      if (consumedFromBatch > 0) {
        const updatedBatch = await reserveRepository.consumeBatchReserveWithClient(
          client,
          batchReserve.reserve_batch_id,
          consumedFromBatch
        );

        await reserveRepository.decreaseBatchInventoryReservedWithClient(
          client,
          locationId,
          reserve.product_id,
          batchId,
          consumedFromBatch
        );

        await reserveRepository.addReserveHistoryWithClient(client, {
          reserve_id: reserve.reserve_id,
          reserve_batch_id: updatedBatch.reserve_batch_id,
          event_type: 'BATCH_CONSUME',
          qty_change: -consumedFromBatch,
          ref_type: 'batch_transfer',
          ref_id: data.transfer_id,
          created_by: data.user_id,
          note: 'Consume reserve batch on delivery transfer',
        });
      }
    }

    const consumedFromUnallocated = Math.max(qty - consumedFromBatch, 0);

    const updatedProduct = await reserveRepository.consumeProductReserveWithClient(
      client,
      reserve.reserve_id,
      qty
    );

    if (consumedFromBatch > 0) {
      await reserveRepository.addReserveHistoryWithClient(client, {
        reserve_id: updatedProduct.reserve_id,
        reserve_batch_id: historyReserveBatchId,
        event_type: 'PRODUCT_CONSUME',
        qty_change: -consumedFromBatch,
        ref_type: 'batch_transfer',
        ref_id: data.transfer_id,
        created_by: data.user_id,
        note: 'Consume reserve product from allocated portion (priority first)',
      });
    }

    if (consumedFromUnallocated > 0) {
      await reserveRepository.addReserveHistoryWithClient(client, {
        reserve_id: updatedProduct.reserve_id,
        reserve_batch_id: historyReserveBatchId,
        event_type: 'PRODUCT_CONSUME',
        qty_change: -consumedFromUnallocated,
        ref_type: 'batch_transfer',
        ref_id: data.transfer_id,
        created_by: data.user_id,
        note: 'Consume reserve product from non-allocated/free-inventory portion (after allocated consumed)',
      });
    }
  }

  async releaseOnCloseWithClient(
    client: PoolClient,
    orderId: number,
    userId: number
  ): Promise<void> {
    const productReserves = await reserveRepository.getOpenProductReservesByOrderForUpdate(
      client,
      orderId
    );

    for (const reserve of productReserves) {
      const batchReserves = await reserveRepository.getOpenBatchReservesByReserveIdForUpdate(
        client,
        reserve.reserve_id
      );

      let allocatedReleasedQty = 0;
      let fallbackReserveBatchId: number | null = null;

      for (const batchReserve of batchReserves) {
        const remainingBatch = Number(batchReserve.remaining_qty || 0);
        if (remainingBatch <= 0) continue;
        allocatedReleasedQty += remainingBatch;

        const releasedBatch = await reserveRepository.releaseBatchReserveWithClient(
          client,
          batchReserve.reserve_batch_id,
          remainingBatch
        );
        if (!fallbackReserveBatchId) {
          fallbackReserveBatchId = releasedBatch.reserve_batch_id;
        }

        await reserveRepository.decreaseBatchInventoryReservedWithClient(
          client,
          batchReserve.location_id,
          batchReserve.product_id,
          batchReserve.batch_id,
          remainingBatch
        );

        await reserveRepository.addReserveHistoryWithClient(client, {
          reserve_id: reserve.reserve_id,
          reserve_batch_id: releasedBatch.reserve_batch_id,
          event_type: 'BATCH_RELEASE',
          qty_change: -remainingBatch,
          ref_type: 'supply_order_close',
          ref_id: orderId,
          created_by: userId,
          note: 'Release remaining reserve batch on supply order close',
        });

        await reserveRepository.addReserveHistoryWithClient(client, {
          reserve_id: reserve.reserve_id,
          reserve_batch_id: releasedBatch.reserve_batch_id,
          event_type: 'PRODUCT_RELEASE',
          qty_change: -remainingBatch,
          ref_type: 'supply_order_close',
          ref_id: orderId,
          created_by: userId,
          note: 'Release reserve product from allocated batch portion on supply order close',
        });
      }

      const latestReserve = await reserveRepository.findProductReserveByItemIdForUpdate(
        client,
        reserve.supply_order_item_id
      );
      const remainingProduct = Number(latestReserve?.remaining_qty || 0);
      if (remainingProduct <= 0) {
        continue;
      }

      const releasedProduct = await reserveRepository.releaseProductReserveWithClient(
        client,
        reserve.reserve_id,
        remainingProduct
      );

      const unallocatedReleasedQty = Math.max(remainingProduct - allocatedReleasedQty, 0);

      if (unallocatedReleasedQty > 0) {
        await reserveRepository.addReserveHistoryWithClient(client, {
          reserve_id: releasedProduct.reserve_id,
          reserve_batch_id: fallbackReserveBatchId,
          event_type: 'PRODUCT_RELEASE',
          qty_change: -unallocatedReleasedQty,
          ref_type: 'supply_order_close',
          ref_id: orderId,
          created_by: userId,
          note: 'Release reserve product from unallocated portion on supply order close',
        });
      }
    }
  }

  private async getReserveByIdForUpdate(client: PoolClient, reserveId: number): Promise<ReserveProductRecord> {
    const result = await client.query(
      `SELECT *, (approved_qty - consumed_qty - released_qty)::int AS remaining_qty
       FROM supply_order_item_reserve
       WHERE reserve_id = $1
       FOR UPDATE`,
      [reserveId]
    );

    if (!result.rows[0]) {
      throw new Error('Reserve product record not found');
    }

    return result.rows[0];
  }

  private async getReserveById(reserveId: number): Promise<ReserveProductRecord> {
    const list = await reserveRepository.listProductReserves();
    const found = list.find((item) => Number(item.reserve_id) === reserveId);
    if (!found) {
      throw new Error('Reserve product record not found');
    }
    return found;
  }
}

export default new ReserveService();
