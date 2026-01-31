import { SupplyOrderRepository } from '../repositories/supplyOrderRepository';
import { SupplyOrder, SupplyOrderCreateDto } from '../models/SupplyOrder';
import { ProductRepository } from '../repositories/productRepository';
import { InventoryRepository } from '../repositories/inventoryRepository';

const supplyOrderRepository = new SupplyOrderRepository();
const productRepository = new ProductRepository();
const inventoryRepository = new InventoryRepository();

export class SupplyOrderService {
  async createSupplyOrder(
    storeId: number,
    createdBy: number,
    orderData: SupplyOrderCreateDto
  ): Promise<any> {
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

    const supplyOrder = await supplyOrderRepository.create(storeId, createdBy);

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

    await supplyOrderRepository.updateStatus(orderId, 'DELIVERING');
    return await supplyOrderRepository.findByIdWithItems(orderId);
  }

  async confirmReceived(orderId: number): Promise<any> {
    const order = await supplyOrderRepository.findById(orderId);
    if (!order) {
      throw new Error('Supply order not found');
    }
    if (order.status !== 'DELIVERING') {
      throw new Error('Can only confirm received for orders with DELIVERING status');
    }

    const items = await supplyOrderRepository.getItemsByOrderId(orderId);

    for (const item of items) {
      let quantityToTransfer = 0;

      if (item.status === 'APPROVED') {
        quantityToTransfer = item.requested_quantity;
      } else if (item.status === 'PARTLY_APPROVED') {
        quantityToTransfer = item.approved_quantity || 0;
      }

      if (quantityToTransfer > 0) {
        const batches = await supplyOrderRepository.getBatchesForProduct(item.product_id);

        let remainingQty = quantityToTransfer;

        for (const batch of batches) {
          if (remainingQty <= 0) break;

          const qtyToDeduct = Math.min(remainingQty, batch.quantity);

          await supplyOrderRepository.deductInventory(batch.inventory_id, qtyToDeduct);

          await supplyOrderRepository.addInventoryToStore(batch.batch_id, order.store_id, qtyToDeduct);

          remainingQty -= qtyToDeduct;
        }

        if (remainingQty > 0) {
          const product = await productRepository.findById(item.product_id);
          throw new Error(`Insufficient inventory to fulfill transfer for ${product?.product_name}. Short by ${remainingQty} units.`);
        }
      }
    }

    await supplyOrderRepository.updateStatus(orderId, 'DELIVERED');

    return await supplyOrderRepository.findByIdWithItems(orderId);
  }
}

export default new SupplyOrderService();
