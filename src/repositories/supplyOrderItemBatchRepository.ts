import pool from '../config/database';
import { 
  SupplyOrderItemBatch, 
  CreateSupplyOrderItemBatchRequest} 
  from '../models/SupplyOrderItemBatch';

export const create = async (data: CreateSupplyOrderItemBatchRequest): Promise<SupplyOrderItemBatch> => {
  const query = `
    INSERT INTO supply_order_item_batch 
      (supply_order_item_id, batch_id, inventory_id, quantity)
    VALUES ($1, $2, $3, $4)
    RETURNING *
  `;
  
  const result = await pool.query(query, [
    data.supply_order_item_id,
    data.batch_id,
    data.inventory_id,
    data.quantity
  ]);
  
  return result.rows[0];
};

export const findBySupplyOrderItemId = async (supplyOrderItemId: number): Promise<SupplyOrderItemBatch[]> => {
  const query = `
    SELECT 
      soib.*,
      pb.batch_code,
      p.product_name
    FROM supply_order_item_batch soib
    LEFT JOIN product_batch pb ON soib.batch_id = pb.batch_id
    LEFT JOIN product p ON pb.product_id = p.product_id
    WHERE soib.supply_order_item_id = $1
    ORDER BY soib.created_at ASC
  `;
  
  const result = await pool.query(query, [supplyOrderItemId]);
  return result.rows;
};

export const findBySupplyOrderId = async (supplyOrderId: number): Promise<SupplyOrderItemBatch[]> => {
  const query = `
    SELECT 
      soib.*,
      pb.batch_code,
      p.product_name,
      soi.supply_order_item_id
    FROM supply_order_item_batch soib
    INNER JOIN supply_order_item soi ON soib.supply_order_item_id = soi.supply_order_item_id
    LEFT JOIN product_batch pb ON soib.batch_id = pb.batch_id
    LEFT JOIN product p ON pb.product_id = p.product_id
    WHERE soi.supply_order_id = $1
    ORDER BY soi.supply_order_item_id, soib.created_at ASC
  `;
  
  const result = await pool.query(query, [supplyOrderId]);
  return result.rows;
};

export const updateReceiptedQuantity = async (itemBatchId: number, receiptedQuantity: number): Promise<SupplyOrderItemBatch> => {
  const query = `
    UPDATE supply_order_item_batch
    SET receipted_quantity = $1
    WHERE item_batch_id = $2
    RETURNING *
  `;
  
  const result = await pool.query(query, [receiptedQuantity, itemBatchId]);
  return result.rows[0];
};

export const updateStockedQuantity = async (itemBatchId: number, stockedQuantity: number): Promise<SupplyOrderItemBatch> => {
  const query = `
    UPDATE supply_order_item_batch
    SET stocked_quantity = $1
    WHERE item_batch_id = $2
    RETURNING *
  `;
  
  const result = await pool.query(query, [stockedQuantity, itemBatchId]);
  return result.rows[0];
};

export const findById = async (itemBatchId: number): Promise<SupplyOrderItemBatch | null> => {
  const query = `
    SELECT 
      soib.*,
      pb.batch_code,
      p.product_name
    FROM supply_order_item_batch soib
    LEFT JOIN product_batch pb ON soib.batch_id = pb.batch_id
    LEFT JOIN product p ON pb.product_id = p.product_id
    WHERE soib.item_batch_id = $1
  `;
  
  const result = await pool.query(query, [itemBatchId]);
  return result.rows[0] || null;
};
