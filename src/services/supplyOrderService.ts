import { SupplyOrderRepository } from '../repositories/supplyOrderRepository';
import { SupplyOrder, SupplyOrderCreateDto } from '../models/SupplyOrder';
import { ProductRepository } from '../repositories/productRepository';
import { InventoryRepository } from '../repositories/inventoryRepository';
import * as supplyOrderItemBatchRepository from '../repositories/supplyOrderItemBatchRepository';

const supplyOrderRepository = new SupplyOrderRepository();
const productRepository = new ProductRepository();
const inventoryRepository = new InventoryRepository();

export class SupplyOrderService {
  async createSupplyOrder(
    storeId: number,
    createdBy: number,
    orderData: SupplyOrderCreateDto
  ): Promise<any> {
    if (!orderData.supply_order_code || !orderData.supply_order_code.trim()) {
      throw new Error('Supply order code is required');
    }

    const supplyOrderCodeRegex = /^SO-\d{6}-\d{4}$/;
    const upperSupplyOrderCode = orderData.supply_order_code.toUpperCase();

    if (!supplyOrderCodeRegex.test(upperSupplyOrderCode)) {
      throw new Error('Supply order code must follow format: SO-YYYYMM-XXXX');
    }

    const existingOrder = await supplyOrderRepository.findBySupplyOrderCode(upperSupplyOrderCode);
    if (existingOrder) {
      throw new Error(`Supply order code ${upperSupplyOrderCode} already exists`);
    }

    if (!orderData.items || orderData.items.length === 0) {
      throw new Error('Supply order must have at least one item');
    }

    const productIds = orderData.items.map(item => item.product_id);
    const uniqueProductIds = new Set(productIds);
    if (productIds.length !== uniqueProductIds.size) {
      throw new Error('Cannot select the same product twice in one order');
    }

    for (const item of orderData.items) {
      const product = await productRepository.findById(item.product_id);
      if (!product) {
        throw new Error(`Product with ID ${item.product_id} not found`);
      }
      if (!product.is_active) {
        throw new Error(`Product "${product.product_name}" is not active`);
      }
      if (item.requested_quantity <= 0) {
        throw new Error('Requested quantity must be greater than 0');
      }
    }

    const supplyOrder = await supplyOrderRepository.create(upperSupplyOrderCode, storeId, createdBy);

    for (const item of orderData.items) {
      await supplyOrderRepository.createItem({
        supply_order_id: supplyOrder.supply_order_id,
        product_id: item.product_id,
        requested_quantity: item.requested_quantity
      });
    }

    return await supplyOrderRepository.findByIdWithItems(supplyOrder.supply_order_id);
  }

  async getSupplyOrderById(orderId: number): Promise<any> {
    const order = await supplyOrderRepository.findByIdWithItems(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }
    return order;
  }

  async getSupplyOrdersByStore(storeId: number): Promise<SupplyOrder[]> {
    return await supplyOrderRepository.findByStoreId(storeId);
  }

  async getAllSupplyOrders(): Promise<SupplyOrder[]> {
    return await supplyOrderRepository.findAll();
  }

  async reviewSupplyOrder(
    orderId: number,
    items: Array<{ supply_order_item_id: number; action: 'APPROVE' | 'PARTLY_APPROVE' | 'REJECT'; approved_quantity?: number }>
  ): Promise<any> {
    const order = await supplyOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }
    if (order.status !== 'SUBMITTED') {
      throw new Error('Can only review orders with SUBMITTED status');
    }

    const orderItems = await supplyOrderRepository.getItemsByOrderId(orderId);
    const itemMap = new Map(orderItems.map(item => [item.supply_order_item_id, item]));

    let approvedCount = 0;
    let rejectedCount = 0;
    let partlyApprovedCount = 0;

    const productQuantityMap = new Map<number, number>();

    for (const reviewItem of items) {
      const originalItem = itemMap.get(reviewItem.supply_order_item_id);
      if (!originalItem) {
        throw new Error(`Item ${reviewItem.supply_order_item_id} not found in order`);
      }

      let itemStatus: string;
      let approvedQty: number | null = null;

      if (reviewItem.action === 'APPROVE') {
        itemStatus = 'APPROVED';
        approvedQty = originalItem.requested_quantity;
        approvedCount++;
      } else if (reviewItem.action === 'PARTLY_APPROVE') {
        if (!reviewItem.approved_quantity || reviewItem.approved_quantity <= 0 || reviewItem.approved_quantity >= originalItem.requested_quantity) {
          throw new Error(`Approved quantity must be greater than 0 and less than requested quantity (${originalItem.requested_quantity})`);
        }
        itemStatus = 'PARTLY_APPROVED';
        approvedQty = reviewItem.approved_quantity;
        partlyApprovedCount++;
      } else {
        itemStatus = 'REJECTED';
        approvedQty = null;
        rejectedCount++;
      }

      if (approvedQty !== null) {
        const product = await productRepository.findById(originalItem.product_id);
        if (!product) {
          throw new Error(`Product with ID ${originalItem.product_id} not found`);
        }

        const availableQty = await inventoryRepository.getAvailableQuantityByProduct(originalItem.product_id);
        
        const currentTotal = productQuantityMap.get(originalItem.product_id) || 0;
        productQuantityMap.set(originalItem.product_id, currentTotal + approvedQty);
        
        const totalApproved = productQuantityMap.get(originalItem.product_id)!;
        
        if (totalApproved > availableQty) {
          throw new Error(`Cannot approve ${totalApproved} ${product.unit} of ${product.product_name}. Only ${availableQty} ${product.unit} available in inventory`);
        }

        const batches = await supplyOrderRepository.getBatchesForProduct(originalItem.product_id);
        let remainingQty = approvedQty;
        
        for (const batch of batches) {
          if (remainingQty <= 0) break;
          
          const qtyToAllocate = Math.min(remainingQty, batch.quantity);
          
          await supplyOrderItemBatchRepository.create({
            supply_order_item_id: reviewItem.supply_order_item_id,
            batch_id: batch.batch_id,
            inventory_id: batch.inventory_id,
            quantity: qtyToAllocate
          });
          
          remainingQty -= qtyToAllocate;
        }
        
        if (remainingQty > 0) {
          throw new Error(`Failed to allocate all batches for ${product.product_name}. Short by ${remainingQty} units.`);
        }
      }

      await supplyOrderRepository.updateItem(reviewItem.supply_order_item_id, approvedQty, itemStatus);
    }

    let orderStatus: string;
    const totalItems = items.length;

    if (partlyApprovedCount > 0 || (approvedCount > 0 && rejectedCount > 0)) {
      orderStatus = 'PARTLY_APPROVED';
    } else if (approvedCount === totalItems) {
      orderStatus = 'APPROVED';
    } else if (rejectedCount === totalItems) {
      orderStatus = 'REJECTED';
    } else {
      orderStatus = 'PARTLY_APPROVED'; 
    }

    await supplyOrderRepository.updateStatus(orderId, orderStatus);

    return await supplyOrderRepository.findByIdWithItems(orderId);
  }

  async startDelivery(orderId: number): Promise<any> {
    const order = await supplyOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }
    if (order.status !== 'APPROVED' && order.status !== 'PARTLY_APPROVED') {
      throw new Error('Can only start delivery for APPROVED or PARTLY_APPROVED orders');
    }

    const itemBatches = await supplyOrderItemBatchRepository.findBySupplyOrderId(orderId);
    
    for (const itemBatch of itemBatches) {
      if (itemBatch.quantity > 0) {
        await supplyOrderRepository.deductInventory(itemBatch.inventory_id, itemBatch.quantity);
      }
    }

    await supplyOrderRepository.updateStatus(orderId, 'DELIVERING');
    return await supplyOrderRepository.findByIdWithItems(orderId);
  }

  async confirmReceived(
    orderId: number,
    batches: Array<{ item_batch_id: number; receipted_quantity: number }>
  ): Promise<any> {
    const order = await supplyOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }
    if (order.status !== 'DELIVERING') {
      throw new Error('Can only confirm received for orders with DELIVERING status');
    }

    for (const batchItem of batches) {
      const itemBatch = await supplyOrderItemBatchRepository.findById(batchItem.item_batch_id);
      if (!itemBatch) {
        throw new Error(`Batch allocation ${batchItem.item_batch_id} not found`);
      }

      const maxQuantity = itemBatch.quantity;
      if (batchItem.receipted_quantity < 0 || batchItem.receipted_quantity > maxQuantity) {
        throw new Error(`Receipted quantity must be between 0 and ${maxQuantity}`);
      }

      await supplyOrderItemBatchRepository.updateReceiptedQuantity(
        batchItem.item_batch_id,
        batchItem.receipted_quantity
      );
    }

    await supplyOrderRepository.updateStatus(orderId, 'RECEIPTED');
    return await supplyOrderRepository.findByIdWithItems(orderId);
  }

  async stockSupplyOrder(
    orderId: number,
    batches: Array<{ item_batch_id: number; stocked_quantity: number }>
  ): Promise<any> {
    const order = await supplyOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }
    if (order.status !== 'RECEIPTED') {
      throw new Error('Can only stock orders with RECEIPTED status');
    }

    const allBatches = await supplyOrderItemBatchRepository.findBySupplyOrderId(orderId);
    
    const hasReceiptedBatches = allBatches.some(batch => 
      batch.receipted_quantity && batch.receipted_quantity > 0
    );
    
    if (!hasReceiptedBatches) {
      throw new Error('Cannot stock order: No batches have receipted quantity > 0');
    }

    for (const batchItem of batches) {
      const itemBatch = await supplyOrderItemBatchRepository.findById(batchItem.item_batch_id);
      if (!itemBatch) {
        throw new Error(`Batch allocation ${batchItem.item_batch_id} not found`);
      }

      const maxQuantity = itemBatch.receipted_quantity || 0;
      if (maxQuantity === 0) {
        throw new Error(`Cannot stock batch with 0 receipted quantity`);
      }
      if (batchItem.stocked_quantity < 0 || batchItem.stocked_quantity > maxQuantity) {
        throw new Error(`Stocked quantity must be between 0 and ${maxQuantity}`);
      }

      await supplyOrderItemBatchRepository.updateStockedQuantity(
        batchItem.item_batch_id,
        batchItem.stocked_quantity
      );

      if (batchItem.stocked_quantity > 0) {
        await supplyOrderRepository.addInventoryToStore(
          itemBatch.batch_id,
          order.store_id,
          batchItem.stocked_quantity
        );
      }
    }

    await supplyOrderRepository.updateStatus(orderId, 'STOCKED');
    return await supplyOrderRepository.findByIdWithItems(orderId);
  }

  async cancelSupplyOrder(orderId: number): Promise<any> {
    const order = await supplyOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }
    if (order.status !== 'APPROVED' && order.status !== 'PARTLY_APPROVED') {
      throw new Error('Can only cancel APPROVED or PARTLY_APPROVED orders');
    }

    await supplyOrderRepository.updateStatus(orderId, 'CANCELLED');
    return await supplyOrderRepository.findByIdWithItems(orderId);
  }
}

export default new SupplyOrderService();
