import pool from '../config/database';
import { SupplyOrder, SupplyOrderCreateDto } from '../models/SupplyOrder';
import { SupplyOrderItem, SupplyOrderItemCreateDto } from '../models/SupplyOrderItem';
import * as supplyOrderItemBatchRepository from './supplyOrderItemBatchRepository';

export class SupplyOrderRepository {
  async create(supplyOrderCode: string, storeId: number, createdBy: number): Promise<SupplyOrder> {
    const query = `
      INSERT INTO supply_order (supply_order_code, store_id, status, created_by)
      VALUES ($1, $2, 'SUBMITTED', $3)
      RETURNING *
    `;
    const result = await pool.query(query, [supplyOrderCode, storeId, createdBy]);
    return result.rows[0];
  }

  async findBySupplyOrderCode(supplyOrderCode: string): Promise<SupplyOrder | null> {
    const query = 'SELECT * FROM supply_order WHERE supply_order_code = $1';
    const result = await pool.query(query, [supplyOrderCode]);
    return result.rows[0] || null;
  }

  async createItem(itemData: SupplyOrderItemCreateDto): Promise<SupplyOrderItem> {
    const query = `
      INSERT INTO supply_order_item (supply_order_id, product_id, requested_quantity, status, approved_quantity)
      VALUES ($1, $2, $3, 'PENDING', NULL)
      RETURNING *
    `;
    const result = await pool.query(query, [
      itemData.supply_order_id,
      itemData.product_id,
      itemData.requested_quantity
    ]);
    return result.rows[0];
  }

  async findByIdWithItems(orderId: number): Promise<any | null> {
    const orderQuery = `
      SELECT 
        so.*,
        s.store_name,
        u.username as created_by_username
      FROM supply_order so
      LEFT JOIN store s ON so.store_id = s.store_id
      LEFT JOIN "user" u ON so.created_by = u.user_id
      WHERE so.supply_order_id = $1
    `;
    const orderResult = await pool.query(orderQuery, [orderId]);
    
    if (orderResult.rows.length === 0) {
      return null;
    }

    const order = orderResult.rows[0];

    const itemsQuery = `
      SELECT 
        soi.*,
        p.product_name,
        p.product_code,
        p.unit,
        (
          SELECT COALESCE(SUM(i.quantity), 0)
          FROM inventory i
          INNER JOIN product_batch pb ON i.batch_id = pb.batch_id
          INNER JOIN store s ON i.store_id = s.store_id
          WHERE pb.product_id = soi.product_id
            AND s.store_name = 'Central Kitchen'
        ) as available_quantity
      FROM supply_order_item soi
      LEFT JOIN product p ON soi.product_id = p.product_id
      WHERE soi.supply_order_id = $1
      ORDER BY soi.supply_order_item_id
    `;
    const itemsResult = await pool.query(itemsQuery, [orderId]);

    const itemsWithBatches = await Promise.all(
      itemsResult.rows.map(async (item) => {
        const batches = await supplyOrderItemBatchRepository.findBySupplyOrderItemId(item.supply_order_item_id);
        return {
          ...item,
          batches
        };
      })
    );

    return {
      ...order,
      items: itemsWithBatches
    };
  }

  async findByStoreId(storeId: number): Promise<any[]> {
    const query = `
      SELECT 
        so.*,
        s.store_name,
        u.username as created_by_username,
        COALESCE(
          json_agg(
            json_build_object(
              'supply_order_item_id', soi.supply_order_item_id,
              'product_id', soi.product_id,
              'requested_quantity', soi.requested_quantity,
              'approved_quantity', soi.approved_quantity,
              'status', soi.status,
              'product_code', p.product_code,
              'product_name', p.product_name,
              'unit', p.unit
            )
          ) FILTER (WHERE soi.supply_order_item_id IS NOT NULL), 
          '[]'
        ) as items
      FROM supply_order so
      LEFT JOIN store s ON so.store_id = s.store_id
      LEFT JOIN "user" u ON so.created_by = u.user_id
      LEFT JOIN supply_order_item soi ON so.supply_order_id = soi.supply_order_id
      LEFT JOIN product p ON soi.product_id = p.product_id
      WHERE so.store_id = $1
      GROUP BY so.supply_order_id, s.store_name, u.username
      ORDER BY so.created_at DESC
    `;
    const result = await pool.query(query, [storeId]);
    
    const ordersWithBatches = await Promise.all(
      result.rows.map(async (order) => {
        const batches = await supplyOrderItemBatchRepository.findBySupplyOrderId(order.supply_order_id);
        
        const batchesByItem: { [key: number]: any[] } = {};
        batches.forEach(batch => {
          if (!batchesByItem[batch.supply_order_item_id]) {
            batchesByItem[batch.supply_order_item_id] = [];
          }
          batchesByItem[batch.supply_order_item_id].push(batch);
        });
        
        const itemsWithBatches = order.items.map((item: any) => ({
          ...item,
          batches: batchesByItem[item.supply_order_item_id] || []
        }));
        
        return {
          ...order,
          items: itemsWithBatches
        };
      })
    );
    
    return ordersWithBatches;
  }

  async findAll(): Promise<any[]> {
    const query = `
      SELECT 
        so.*,
        s.store_name,
        u.username as created_by_username,
        COALESCE(
          json_agg(
            json_build_object(
              'supply_order_item_id', soi.supply_order_item_id,
              'product_id', soi.product_id,
              'requested_quantity', soi.requested_quantity,
              'approved_quantity', soi.approved_quantity,
              'status', soi.status,
              'product_code', p.product_code,
              'product_name', p.product_name,
              'unit', p.unit
            )
          ) FILTER (WHERE soi.supply_order_item_id IS NOT NULL), 
          '[]'
        ) as items
      FROM supply_order so
      LEFT JOIN store s ON so.store_id = s.store_id
      LEFT JOIN "user" u ON so.created_by = u.user_id
      LEFT JOIN supply_order_item soi ON so.supply_order_id = soi.supply_order_id
      LEFT JOIN product p ON soi.product_id = p.product_id
      GROUP BY so.supply_order_id, s.store_name, u.username
      ORDER BY so.created_at DESC
    `;
    const result = await pool.query(query);
    
    const ordersWithBatches = await Promise.all(
      result.rows.map(async (order) => {
        const batches = await supplyOrderItemBatchRepository.findBySupplyOrderId(order.supply_order_id);
        
        const batchesByItem: { [key: number]: any[] } = {};
        batches.forEach(batch => {
          if (!batchesByItem[batch.supply_order_item_id]) {
            batchesByItem[batch.supply_order_item_id] = [];
          }
          batchesByItem[batch.supply_order_item_id].push(batch);
        });
        
        const itemsWithBatches = order.items.map((item: any) => ({
          ...item,
          batches: batchesByItem[item.supply_order_item_id] || []
        }));
        
        return {
          ...order,
          items: itemsWithBatches
        };
      })
    );
    
    return ordersWithBatches;
  }

  async updateStatus(orderId: number, status: string): Promise<SupplyOrder | null> {
    const query = `
      UPDATE supply_order
      SET status = $1
      WHERE supply_order_id = $2
      RETURNING *
    `;
    const result = await pool.query(query, [status, orderId]);
    return result.rows[0] || null;
  }

  async findById(orderId: number): Promise<SupplyOrder | null> {
    const query = 'SELECT * FROM supply_order WHERE supply_order_id = $1';
    const result = await pool.query(query, [orderId]);
    return result.rows[0] || null;
  }

  async updateItem(itemId: number, approvedQuantity: number | null, status: string): Promise<SupplyOrderItem> {
    const query = `
      UPDATE supply_order_item
      SET approved_quantity = $1, status = $2
      WHERE supply_order_item_id = $3
      RETURNING *
    `;
    const result = await pool.query(query, [approvedQuantity, status, itemId]);
    return result.rows[0];
  }

  async getItemsByOrderId(orderId: number): Promise<SupplyOrderItem[]> {
    const query = 'SELECT * FROM supply_order_item WHERE supply_order_id = $1';
    const result = await pool.query(query, [orderId]);
    return result.rows;
  }

  async getBatchesForProduct(productId: number): Promise<any[]> {
    const query = `
      SELECT 
        i.inventory_id,
        i.batch_id,
        i.quantity,
        pb.expired_date
      FROM inventory i
      INNER JOIN product_batch pb ON i.batch_id = pb.batch_id
      INNER JOIN store s ON i.store_id = s.store_id
      WHERE pb.product_id = $1 
        AND s.store_name = 'Central Kitchen'
        AND i.quantity > 0
      ORDER BY pb.expired_date ASC
    `;
    const result = await pool.query(query, [productId]);
    return result.rows;
  }

  async deductInventory(inventoryId: number, quantity: number): Promise<void> {
    const query = `
      UPDATE inventory
      SET quantity = quantity - $1
      WHERE inventory_id = $2
    `;
    await pool.query(query, [quantity, inventoryId]);
  }

  async addInventoryToStore(batchId: number, storeId: number, quantity: number): Promise<void> {
    const checkQuery = `
      SELECT inventory_id, quantity 
      FROM inventory 
      WHERE batch_id = $1 AND store_id = $2
    `;
    const checkResult = await pool.query(checkQuery, [batchId, storeId]);

    if (checkResult.rows.length > 0) {
      const updateQuery = `
        UPDATE inventory
        SET quantity = quantity + $1
        WHERE batch_id = $2 AND store_id = $3
      `;
      await pool.query(updateQuery, [quantity, batchId, storeId]);
    } else {
      const insertQuery = `
        INSERT INTO inventory (batch_id, store_id, quantity, status)
        VALUES ($1, $2, $3, 'ACTIVE')
      `;
      await pool.query(insertQuery, [batchId, storeId, quantity]);
    }
  }
}

export default new SupplyOrderRepository();