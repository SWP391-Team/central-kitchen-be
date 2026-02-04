import pool from '../config/database';
import { Product, ProductCreateDto, ProductUpdateDto } from '../models/Product';

export class ProductRepository {
  private normalizeText(text: string): string {
    return text.trim().toUpperCase();
  }

  async findAll(): Promise<Product[]> {
    const query = 'SELECT * FROM product ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  async findAllActive(): Promise<Product[]> {
    const query = 'SELECT * FROM product WHERE is_active = true ORDER BY created_at DESC';
    const result = await pool.query(query);
    return result.rows;
  }

  async findById(productId: number): Promise<Product | null> {
    const query = 'SELECT * FROM product WHERE product_id = $1';
    const result = await pool.query(query, [productId]);
    return result.rows[0] || null;
  }

  async findByProductCode(productCode: string): Promise<Product | null> {
    const query = 'SELECT * FROM product WHERE product_code = $1';
    const result = await pool.query(query, [productCode]);
    return result.rows[0] || null;
  }

  async existsByNameAndUnit(productName: string, unit: string, excludeId?: number): Promise<boolean> {
    const normalizedName = this.normalizeText(productName);
    const normalizedUnit = this.normalizeText(unit);
    
    let query = 'SELECT COUNT(*) FROM product WHERE UPPER(TRIM(product_name)) = $1 AND UPPER(TRIM(unit)) = $2';
    const params: any[] = [normalizedName, normalizedUnit];
    
    if (excludeId) {
      query += ' AND product_id != $3';
      params.push(excludeId);
    }
    
    const result = await pool.query(query, params);
    return parseInt(result.rows[0].count) > 0;
  }

  async create(productData: ProductCreateDto): Promise<Product> {
    const normalizedName = this.normalizeText(productData.product_name);
    const normalizedUnit = this.normalizeText(productData.unit);

    const query = `
      INSERT INTO product (product_code, product_name, unit)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    
    const result = await pool.query(query, [productData.product_code, normalizedName, normalizedUnit]);
    return result.rows[0];
  }

  async update(productId: number, productData: ProductUpdateDto): Promise<Product | null> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (productData.product_name !== undefined) {
      updates.push(`product_name = $${paramCount}`);
      values.push(this.normalizeText(productData.product_name));
      paramCount++;
    }

    if (productData.unit !== undefined) {
      updates.push(`unit = $${paramCount}`);
      values.push(this.normalizeText(productData.unit));
      paramCount++;
    }

    if (updates.length === 0) {
      return this.findById(productId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(productId);

    const query = `
      UPDATE product 
      SET ${updates.join(', ')}
      WHERE product_id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0] || null;
  }

  async toggleActive(productId: number): Promise<Product | null> {
    const query = `
      UPDATE product 
      SET is_active = NOT is_active
      WHERE product_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [productId]);
    return result.rows[0] || null;
  }

  async search(searchTerm: string): Promise<Product[]> {
    const normalizedSearch = `%${this.normalizeText(searchTerm)}%`;
    const query = `
      SELECT * FROM product 
      WHERE UPPER(product_name) LIKE $1 OR UPPER(unit) LIKE $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [normalizedSearch]);
    return result.rows;
  }
}

export default new ProductRepository();
