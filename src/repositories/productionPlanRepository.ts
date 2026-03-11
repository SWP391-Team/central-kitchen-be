import pool from '../config/database';
import { ProductionPlan, ProductionPlanCreateDto, ProductionPlanWithProduct, ProductionPlanListParams } from '../models/ProductionPlan';

export class ProductionPlanRepository {
  async findAll(params: ProductionPlanListParams): Promise<{ plans: ProductionPlanWithProduct[], total: number }> {
    const { search, status, sortBy = 'created_at', sortOrder = 'desc', page = 1, limit = 10 } = params;
    
    const offset = (page - 1) * limit;
    let whereConditions: string[] = [];
    let queryParams: any[] = [];
    let paramIndex = 1;

    if (search && search.trim()) {
      whereConditions.push(`(
        pp.plan_code ILIKE $${paramIndex} OR 
        p.product_name ILIKE $${paramIndex} OR 
        p.product_code ILIKE $${paramIndex}
      )`);
      queryParams.push(`%${search.trim()}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      whereConditions.push(`pp.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const allowedSortColumns = ['planned_date', 'created_at', 'plan_code'];
    const validSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'created_at';
    const validSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const countQuery = `
      SELECT COUNT(*) 
      FROM production_plan pp
      LEFT JOIN product p ON pp.product_id = p.product_id
      ${whereClause}
    `;
    const countResult = await pool.query(countQuery, queryParams);
    const total = parseInt(countResult.rows[0].count);

    const dataQuery = `
      SELECT 
        pp.*,
        p.product_code,
        p.product_name
      FROM production_plan pp
      LEFT JOIN product p ON pp.product_id = p.product_id
      ${whereClause}
      ORDER BY pp.${validSortBy} ${validSortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    queryParams.push(limit, offset);

    const result = await pool.query(dataQuery, queryParams);
    
    return {
      plans: result.rows,
      total
    };
  }

  async findById(planId: number): Promise<ProductionPlanWithProduct | null> {
    const query = `
      SELECT 
        pp.*,
        p.product_code,
        p.product_name
      FROM production_plan pp
      LEFT JOIN product p ON pp.product_id = p.product_id
      WHERE pp.plan_id = $1
    `;
    const result = await pool.query(query, [planId]);
    return result.rows[0] || null;
  }

  async findByPlanCode(planCode: string): Promise<ProductionPlan | null> {
    const query = 'SELECT * FROM production_plan WHERE plan_code = $1';
    const result = await pool.query(query, [planCode]);
    return result.rows[0] || null;
  }

  async getNextPlanCodeNumber(plannedDate: string): Promise<number> {
    const datePart = plannedDate.replace(/-/g, ''); 
    const prefix = `PLAN_${datePart}_`;
    
    const query = `
      SELECT plan_code 
      FROM production_plan 
      WHERE plan_code LIKE $1 
      ORDER BY plan_code DESC 
      LIMIT 1
    `;
    const result = await pool.query(query, [`${prefix}%`]);
    
    if (result.rows.length === 0) {
      return 1;
    }
    
    const lastPlanCode = result.rows[0].plan_code;
    const lastNumber = parseInt(lastPlanCode.substring(lastPlanCode.lastIndexOf('_') + 1));
    
    return lastNumber + 1;
  }

  async create(planData: ProductionPlanCreateDto, createdBy: number): Promise<ProductionPlan> {
    const nextNumber = await this.getNextPlanCodeNumber(planData.planned_date);
    const datePart = planData.planned_date.replace(/-/g, '');
    const planCode = `PLAN_${datePart}_${nextNumber.toString().padStart(3, '0')}`;

    const query = `
      INSERT INTO production_plan (
        plan_code, 
        product_id, 
        planned_qty, 
        planned_date, 
        status, 
        created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;

    const result = await pool.query(query, [
      planCode,
      planData.product_id,
      planData.planned_qty,
      planData.planned_date,
      'draft',
      createdBy
    ]);

    return result.rows[0];
  }

  async updateStatus(planId: number, status: string): Promise<ProductionPlan | null> {
    const query = `
      UPDATE production_plan 
      SET status = $1 
      WHERE plan_id = $2 
      RETURNING *
    `;
    const result = await pool.query(query, [status, planId]);
    return result.rows[0] || null;
  }

  async cancel(planId: number): Promise<ProductionPlan | null> {
    return await this.updateStatus(planId, 'cancelled');
  }

  async close(planId: number): Promise<ProductionPlan | null> {
    return await this.updateStatus(planId, 'closed');
  }

  async release(planId: number): Promise<ProductionPlan | null> {
    return await this.updateStatus(planId, 'planned');
  }

  async updateQuantities(planId: number): Promise<ProductionPlan | null> {
    const query = `
      UPDATE production_plan 
      SET 
        actual_qty = COALESCE((
          SELECT SUM(produced_qty) 
          FROM production_batch 
          WHERE plan_id = $1 AND status != 'cancelled' AND produced_qty IS NOT NULL
        ), 0),
        variance_qty = COALESCE((
          SELECT SUM(produced_qty) 
          FROM production_batch 
          WHERE plan_id = $1 AND status != 'cancelled' AND produced_qty IS NOT NULL
        ), 0) - planned_qty
      WHERE plan_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [planId]);
    return result.rows[0] || null;
  }

  async updateAutoStatus(planId: number): Promise<ProductionPlan | null> {
    const query = `
      UPDATE production_plan
      SET status = CASE
        WHEN actual_qty = 0 AND status != 'draft' THEN 'planned'
        WHEN actual_qty >= planned_qty THEN 'completed'
        WHEN actual_qty > 0 AND actual_qty < planned_qty THEN 'in_production'
        ELSE status
      END
      WHERE plan_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [planId]);
    return result.rows[0] || null;
  }
}

const productionPlanRepository = new ProductionPlanRepository();
export default productionPlanRepository;
