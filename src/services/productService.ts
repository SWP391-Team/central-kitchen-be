import productRepository from '../repositories/productRepository';
import unitRepository from '../repositories/unitRepository';
import { Product, ProductCreateDto, ProductUpdateDto } from '../models/Product';

export class ProductService {
  async getAllProducts(isActive?: boolean): Promise<Product[]> {
    return await productRepository.findAll(isActive);
  }

  async getActiveProducts(): Promise<Product[]> {
    return await productRepository.findAllActive();
  }

  async getProductById(productId: number): Promise<Product> {
    const product = await productRepository.findById(productId);
    if (!product) {
      throw new Error('Product not found');
    }
    return product;
  }

  async createProduct(productData: ProductCreateDto, createdBy: number): Promise<Product> {
    if (!productData.product_name || !productData.product_name.trim()) {
      throw new Error('Product name is required');
    }
    if (!productData.unit_id || productData.unit_id <= 0) {
      throw new Error('Unit is required');
    }

    const unit = await unitRepository.findById(productData.unit_id);
    if (!unit || !unit.is_active) {
      throw new Error('Unit not found or inactive');
    }

    if (!productData.shelf_life_days || productData.shelf_life_days <= 0) {
      throw new Error('Shelf life must be greater than 0');
    }

    if (!Number.isInteger(productData.shelf_life_days)) {
      throw new Error('Shelf life must be an integer');
    }

    const exists = await productRepository.existsByNameAndUnitId(
      productData.product_name,
      productData.unit_id
    );

    if (exists) {
      throw new Error('Product with this name and unit already exists');
    }

    return await productRepository.create({
      ...productData,
      created_by: createdBy,
    });
  }

  async updateProduct(productId: number, productData: ProductUpdateDto, updatedBy: number): Promise<Product> {
    if ('product_code' in productData) {
      throw new Error('Cannot modify product_code after creation');
    }

    const existingProduct = await productRepository.findById(productId);
    if (!existingProduct) {
      throw new Error('Product not found');
    }

    if (productData.product_name !== undefined && !productData.product_name.trim()) {
      throw new Error('Product name cannot be empty');
    }
    if (productData.unit_id !== undefined && productData.unit_id <= 0) {
      throw new Error('Unit is invalid');
    }

    if (productData.unit_id !== undefined) {
      const unit = await unitRepository.findById(productData.unit_id);
      if (!unit || !unit.is_active) {
        throw new Error('Unit not found or inactive');
      }
    }

    if (productData.shelf_life_days !== undefined) {
      if (productData.shelf_life_days <= 0) {
        throw new Error('Shelf life must be greater than 0');
      }
      if (!Number.isInteger(productData.shelf_life_days)) {
        throw new Error('Shelf life must be an integer');
      }
    }

    if (productData.product_name || productData.unit_id !== undefined) {
      const nameToCheck = productData.product_name || existingProduct.product_name;
      const unitIdToCheck = productData.unit_id || existingProduct.unit_id;
      
      const exists = await productRepository.existsByNameAndUnitId(
        nameToCheck,
        unitIdToCheck,
        productId
      );

      if (exists) {
        throw new Error('Product with this name and unit already exists');
      }
    }

    const updatedProduct = await productRepository.update(productId, productData, updatedBy);
    if (!updatedProduct) {
      throw new Error('Failed to update product');
    }
    
    return updatedProduct;
  }

  async toggleProductActive(productId: number, updatedBy: number): Promise<Product> {
    const exists = await productRepository.findById(productId);
    if (!exists) {
      throw new Error('Product not found');
    }

    if (exists.is_active) {
      const blockers = await productRepository.getDeactivationBlockers(productId);
      if (blockers.length > 0) {
        throw new Error(`Cannot deactivate product: ${blockers.join('; ')}`);
      }
    }

    const updatedProduct = await productRepository.toggleActive(productId, updatedBy);
    if (!updatedProduct) {
      throw new Error('Failed to toggle product status');
    }
    
    return updatedProduct;
  }

  async searchProducts(searchTerm: string): Promise<Product[]> {
    if (!searchTerm || !searchTerm.trim()) {
      return await this.getAllProducts();
    }
    return await productRepository.search(searchTerm);
  }
}

export default new ProductService();
