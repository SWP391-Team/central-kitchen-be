import pool from '../config/database';
import batchTransferRepository from '../repositories/batchTransferRepository';
import inventoryRepository from '../repositories/inventoryRepository';
import supplyOrderRepository from '../repositories/supplyOrderRepository';
import {
  ApproveSupplyOrderDto,
  CloseSupplyOrderDto,
  CreateSupplyOrderDeliveryDto,
  CreateSupplyOrderDto,
  RequesterSuggestion,
  SupplyOrderItemWithDetails,
  SupplyOrderWithDetails,
} from '../models/SupplyOrder';

interface AuthUser {
  user_id: number;
  username?: string;
  role_id: number;
  location_id: number | null;
  location_ids: Array<number | string>;
}

export class SupplyOrderService {
  private toId(value: unknown): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return 0;
    }
    return parsed;
  }

  private normalizeLocationIds(rawIds: unknown[]): number[] {
    const ids = rawIds
      .map((value) => {
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && value.trim() !== '') {
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : NaN;
        }
        return NaN;
      })
      .filter((value) => Number.isInteger(value) && value > 0) as number[];

    return Array.from(new Set(ids));
  }

  private ensureAuthenticated(user?: AuthUser): asserts user is AuthUser {
    if (!user) {
      throw new Error('Unauthorized');
    }
  }

  private ensureStoreUser(user: AuthUser) {
    if (user.role_id !== 3) {
      throw new Error('Only Store Staff can create supply orders');
    }
  }

  private ensureCentralUser(user: AuthUser) {
    if (user.role_id !== 1 && user.role_id !== 2) {
      throw new Error('Only Admin or Central Staff can perform this action');
    }
  }

  private validateCloseReason(reason: string): void {
    const allowed = ['Out of stock', 'Production issue', 'No longer needed', 'Other'];
    if (!allowed.includes(reason)) {
      throw new Error('Invalid close reason');
    }
  }

  private getUserLocationScope(user: AuthUser): number[] {
    if (Array.isArray(user.location_ids) && user.location_ids.length > 0) {
      const normalized = this.normalizeLocationIds(user.location_ids);
      if (normalized.length > 0) {
        return normalized;
      }
    }

    if (user.location_id !== null && user.location_id !== undefined) {
      const fallback = this.normalizeLocationIds([user.location_id]);
      if (fallback.length > 0) {
        return fallback;
      }
    }

    return [];
  }

  private async resolveUserLocationScope(user: AuthUser): Promise<number[]> {
    const tokenScope = this.getUserLocationScope(user);
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
      [user.user_id]
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

  private async validateStoreLocation(locationId: number): Promise<void> {
    const result = await pool.query(
      `SELECT location_id
       FROM location
       WHERE location_id = $1
         AND location_type = 'STORE'
         AND is_active = true`,
      [locationId]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid store location');
    }
  }

  async getCkInventory() {
    return supplyOrderRepository.getCkWarehouseInventory();
  }

  async searchRequesters(user: AuthUser | undefined, keyword?: string): Promise<RequesterSuggestion[]> {
    this.ensureAuthenticated(user);

    const locationScope = await this.resolveUserLocationScope(user);
    const locationId = user.role_id === 3 ? (locationScope[0] || null) : null;

    return supplyOrderRepository.searchRequesterUsers({
      keyword,
      location_id: locationId,
    });
  }

  async listSupplyOrders(
    user: AuthUser | undefined,
    params: {
      search?: string;
      status?: string;
      location_id?: number;
      page?: number;
      limit?: number;
    }
  ): Promise<{ rows: SupplyOrderWithDetails[]; total: number }> {
    this.ensureAuthenticated(user);

    const locationScope = await this.resolveUserLocationScope(user);

    return supplyOrderRepository.findMasterList({
      role_id: user.role_id,
      user_location_ids: locationScope,
      search: params.search,
      status: params.status,
      location_id: params.location_id,
      page: params.page,
      limit: params.limit,
    });
  }

  async getSupplyOrderDetail(
    user: AuthUser | undefined,
    orderId: number
  ): Promise<{ order: SupplyOrderWithDetails; items: SupplyOrderItemWithDetails[] }> {
    this.ensureAuthenticated(user);

    const order = await supplyOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }

    if (user.role_id === 3) {
      const scope = await this.resolveUserLocationScope(user);
      if (scope.length === 0) {
        throw new Error('Store Staff has no assigned store location');
      }
      const orderLocationId = this.normalizeLocationIds([order.location_id])[0];
      if (!orderLocationId || !scope.includes(orderLocationId)) {
        throw new Error('You do not have permission to access this supply order');
      }
    }

    const items = await supplyOrderRepository.findItemsByOrderId(orderId);
    return { order, items };
  }

  async createSupplyOrder(
    user: AuthUser | undefined,
    payload: CreateSupplyOrderDto
  ): Promise<{ order: SupplyOrderWithDetails; items: SupplyOrderItemWithDetails[] }> {
    this.ensureAuthenticated(user);
    this.ensureStoreUser(user);

    const userLocations = await this.resolveUserLocationScope(user);
    const storeLocationId = userLocations[0];
    if (!storeLocationId) {
      throw new Error('Store Staff has no assigned store location');
    }

    await this.validateStoreLocation(storeLocationId);

    if (!payload.requested_by_user_id || payload.requested_by_user_id <= 0) {
      throw new Error('requested_by_user_id is required');
    }

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('At least one supply order item is required');
    }

    const productSet = new Set<number>();
    for (const item of payload.items) {
      if (!item.product_id || item.product_id <= 0) {
        throw new Error('Invalid product in supply order items');
      }
      if (!item.requested_qty || item.requested_qty <= 0) {
        throw new Error('requested_qty must be greater than 0');
      }
      if (productSet.has(item.product_id)) {
        throw new Error('Duplicate products are not allowed in one supply order');
      }
      productSet.add(item.product_id);
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const order = await supplyOrderRepository.createSupplyOrderWithClient(client, {
        location_id: storeLocationId,
        requested_by: payload.requested_by_user_id,
        note: payload.note,
        created_by: user.user_id,
      });

      for (const item of payload.items) {
        await supplyOrderRepository.createSupplyOrderItemWithClient(client, {
          supply_order_id: order.supply_order_id,
          product_id: item.product_id,
          requested_qty: item.requested_qty,
        });
      }

      await client.query('COMMIT');

      const fullOrder = await supplyOrderRepository.findById(order.supply_order_id);
      const fullItems = await supplyOrderRepository.findItemsByOrderId(order.supply_order_id);

      return {
        order: fullOrder!,
        items: fullItems,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async sendToCk(user: AuthUser | undefined, orderId: number): Promise<SupplyOrderWithDetails> {
    this.ensureAuthenticated(user);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const order = await supplyOrderRepository.findOrderByIdForUpdate(orderId, client);
      if (!order) {
        throw new Error('Supply order not found');
      }

      if (order.status === 'Closed') {
        throw new Error('Closed supply orders cannot be sent to CK');
      }

      if (user.role_id === 3) {
        const scope = await this.resolveUserLocationScope(user);
        if (scope.length === 0) {
          throw new Error('Store Staff has no assigned store location');
        }
        const orderLocationId = this.normalizeLocationIds([order.location_id])[0];
        if (!orderLocationId || !scope.includes(orderLocationId)) {
          throw new Error('You do not have permission to send this supply order');
        }
      }

      if (order.status !== 'Draft') {
        throw new Error('Only Draft supply orders can be sent to CK');
      }

      await supplyOrderRepository.updateOrderStatusOnlyWithClient(
        client,
        orderId,
        'Pending'
      );

      await client.query('COMMIT');

      const updated = await supplyOrderRepository.findById(orderId);
      return updated!;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async approveSupplyOrder(
    user: AuthUser | undefined,
    orderId: number,
    payload: ApproveSupplyOrderDto
  ): Promise<{ order: SupplyOrderWithDetails; items: SupplyOrderItemWithDetails[] }> {
    this.ensureAuthenticated(user);
    this.ensureCentralUser(user);

    if (!Array.isArray(payload.items) || payload.items.length === 0) {
      throw new Error('Approval items are required');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const order = await supplyOrderRepository.findOrderByIdForUpdate(orderId, client);
      if (!order) {
        throw new Error('Supply order not found');
      }

      if (order.status === 'Closed') {
        throw new Error('Closed supply orders cannot be approved');
      }

      if (order.status !== 'Pending') {
        throw new Error('Only Pending supply orders can be approved');
      }

      const items = await supplyOrderRepository.findItemsByOrderIdForUpdate(orderId, client);
      if (items.length === 0) {
        throw new Error('Supply order has no items');
      }

      const approvalMap = new Map<number, number>();
      for (const item of payload.items) {
        approvalMap.set(item.supply_order_item_id, item.approved_qty);
      }

      let hasApproved = false;
      for (const item of items) {
        const itemId = this.toId(item.supply_order_item_id);
        const approvedQty = approvalMap.get(itemId);
        if (approvedQty === undefined) {
          throw new Error('All supply order items must have approved_qty');
        }
        if (approvedQty < 0 || approvedQty > item.requested_qty) {
          throw new Error('approved_qty must be between 0 and requested_qty');
        }

        const itemStatus = approvedQty > 0 ? 'Approved' : 'Rejected';
        if (approvedQty > 0) {
          hasApproved = true;
        }

        await supplyOrderRepository.updateSupplyOrderItemApprovalWithClient(
          client,
          itemId,
          approvedQty,
          itemStatus
        );
      }

      const orderStatus = hasApproved ? 'Approved' : 'Rejected';
      await supplyOrderRepository.updateOrderStatusWithClient(client, orderId, orderStatus, {
        approved_by: user.user_id,
        approved_date: new Date().toISOString(),
        note: payload.note || null,
      });

      await client.query('COMMIT');

      const fullOrder = await supplyOrderRepository.findById(orderId);
      const fullItems = await supplyOrderRepository.findItemsByOrderId(orderId);

      return {
        order: fullOrder!,
        items: fullItems,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async refreshOrderStatusByDeliveries(
    client: any,
    orderId: number
  ): Promise<void> {
    const summary = await supplyOrderRepository.getOrderDeliverySummaryWithClient(client, orderId);

    if (summary.length === 0) {
      return;
    }

    const allApprovedZero = summary.every((row) => row.approved_qty <= 0);
    if (allApprovedZero) {
      await supplyOrderRepository.updateOrderStatusOnlyWithClient(client, orderId, 'Rejected');
      return;
    }

    const allDelivered = summary.every(
      (row) => row.approved_qty > 0 && row.delivered_qty >= row.approved_qty
    );
    if (allDelivered) {
      await supplyOrderRepository.updateOrderStatusOnlyWithClient(client, orderId, 'Delivered');
      return;
    }

    const hasAnyDelivered = summary.some((row) => row.delivered_qty > 0);
    if (hasAnyDelivered) {
      await supplyOrderRepository.updateOrderStatusOnlyWithClient(client, orderId, 'Partly Delivered');
      return;
    }

    await supplyOrderRepository.updateOrderStatusOnlyWithClient(client, orderId, 'Approved');
  }

  async createDeliveryTransfer(
    user: AuthUser | undefined,
    orderId: number,
    itemId: number,
    payload: CreateSupplyOrderDeliveryDto
  ): Promise<{ order: SupplyOrderWithDetails; items: SupplyOrderItemWithDetails[] }> {
    this.ensureAuthenticated(user);
    this.ensureCentralUser(user);

    if (!payload.batch_id || payload.batch_id <= 0) {
      throw new Error('batch_id is required');
    }
    if (!payload.transfer_qty || payload.transfer_qty <= 0) {
      throw new Error('transfer_qty must be greater than 0');
    }
    if (!payload.transfer_date) {
      throw new Error('transfer_date is required');
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const order = await supplyOrderRepository.findOrderByIdForUpdate(orderId, client);
      if (!order) {
        throw new Error('Supply order not found');
      }

      if (order.status === 'Closed') {
        throw new Error('Closed supply orders cannot be delivered');
      }

      if (!['Approved', 'Partly Delivered'].includes(order.status)) {
        throw new Error('Only Approved or Partly Delivered supply orders can be delivered');
      }

      const item = await supplyOrderRepository.findSupplyOrderItemByIdForUpdate(itemId, client);
      const itemOrderId = item ? this.toId(item.supply_order_id) : 0;
      if (!item || itemOrderId !== orderId) {
        throw new Error('Supply order item not found');
      }

      const itemApprovedQty = Number(item.approved_qty || 0);
      if (item.status !== 'Approved' || itemApprovedQty <= 0) {
        throw new Error('This supply order item is not approved for delivery');
      }

      const deliveredQty = await supplyOrderRepository.getDeliveredQtyByItemIdWithClient(
        client,
        itemId
      );
      const remainingQty = itemApprovedQty - deliveredQty;

      if (payload.transfer_qty > remainingQty) {
        throw new Error(
          `Transfer qty (${payload.transfer_qty}) exceeds remaining qty (${remainingQty})`
        );
      }

      const batchResult = await client.query(
        `SELECT batch_id, product_id
         FROM production_batch
         WHERE batch_id = $1
         FOR UPDATE`,
        [payload.batch_id]
      );
      if (batchResult.rows.length === 0) {
        throw new Error('Batch not found');
      }
      const batch = batchResult.rows[0];

      const batchProductId = this.toId(batch.product_id);
      const itemProductId = this.toId(item.product_id);
      if (batchProductId !== itemProductId) {
        throw new Error('Batch product does not match supply order item product');
      }

      const fromInventoryResult = await client.query(
        `SELECT bi.location_id, bi.qty_on_hand
         FROM batch_inventory bi
         INNER JOIN location l ON l.location_id = bi.location_id
         WHERE l.location_type = 'CK_WAREHOUSE'
           AND l.is_active = true
           AND bi.batch_id = $1
           AND bi.product_id = $2
           AND bi.qty_on_hand > 0
         ORDER BY bi.qty_on_hand DESC, bi.location_id ASC
         LIMIT 1
         FOR UPDATE`,
        [payload.batch_id, itemProductId]
      );

      if (fromInventoryResult.rows.length === 0) {
        throw new Error('No inventory available in CK Warehouse for this batch/product');
      }

      const fromInventory = fromInventoryResult.rows[0];
      if (fromInventory.qty_on_hand < payload.transfer_qty) {
        throw new Error(
          `Insufficient CK Warehouse inventory. Available: ${fromInventory.qty_on_hand}, requested: ${payload.transfer_qty}`
        );
      }

      const transfer = await batchTransferRepository.createWithClient(client, {
        batch_id: payload.batch_id,
        product_id: item.product_id,
        from_location_id: fromInventory.location_id,
        to_location_id: order.location_id,
        transfer_qty: payload.transfer_qty,
        transfer_date: payload.transfer_date,
        created_by: user.user_id,
        supply_order_item_id: itemId,
      });

      await inventoryRepository.createTransactionWithClient(client, {
        location_id: fromInventory.location_id,
        product_id: itemProductId,
        batch_id: payload.batch_id,
        reference_type: 'batch_transfer',
        reference_id: transfer.batch_transfer_id,
        qty: -payload.transfer_qty,
        transaction_type: 'OUT',
      });

      await inventoryRepository.upsertBatchInventoryWithClient(client, {
        location_id: fromInventory.location_id,
        product_id: itemProductId,
        batch_id: payload.batch_id,
        qty_change: -payload.transfer_qty,
      });

      await supplyOrderRepository.syncDeliveredQtyForItemWithClient(client, itemId);

      await this.refreshOrderStatusByDeliveries(client, orderId);

      await client.query('COMMIT');

      const fullOrder = await supplyOrderRepository.findById(orderId);
      const fullItems = await supplyOrderRepository.findItemsByOrderId(orderId);

      return {
        order: fullOrder!,
        items: fullItems,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async closeSupplyOrder(
    user: AuthUser | undefined,
    orderId: number,
    payload: CloseSupplyOrderDto
  ): Promise<{ order: SupplyOrderWithDetails; items: SupplyOrderItemWithDetails[] }> {
    this.ensureAuthenticated(user);

    if (!payload.close_reason) {
      throw new Error('close_reason is required');
    }
    this.validateCloseReason(payload.close_reason);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const order = await supplyOrderRepository.findOrderByIdForUpdate(orderId, client);
      if (!order) {
        throw new Error('Supply order not found');
      }

      if (order.status === 'Closed') {
        throw new Error('Supply order is already Closed');
      }

      if (user.role_id === 3) {
        const scope = await this.resolveUserLocationScope(user);
        if (scope.length === 0) {
          throw new Error('Store Staff has no assigned store location');
        }
        const orderLocationId = this.normalizeLocationIds([order.location_id])[0];
        if (!orderLocationId || !scope.includes(orderLocationId)) {
          throw new Error('You do not have permission to close this supply order');
        }
      }

      await supplyOrderRepository.closeOrderWithClient(client, orderId, {
        closed_by: user.user_id,
        closed_at: new Date().toISOString(),
        close_reason: payload.close_reason,
        close_note: payload.close_note?.trim() || null,
      });

      await client.query('COMMIT');

      const fullOrder = await supplyOrderRepository.findById(orderId);
      const fullItems = await supplyOrderRepository.findItemsByOrderId(orderId);

      return {
        order: fullOrder!,
        items: fullItems,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export default new SupplyOrderService();
