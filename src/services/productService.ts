import productRepository from '../repositories/productRepository';
import { Product, ProductCreateDto, ProductUpdateDto } from '../models/Product';

export class ProductService {
  async getAllProducts(): Promise<Product[]> {
    return await productRepository.findAll();
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

  async createProduct(productData: ProductCreateDto): Promise<Product> {
    const productCodePattern = /^PRD-[A-Z0-9]{4}$/;
    if (!productData.product_code || !productCodePattern.test(productData.product_code.toUpperCase())) {
      throw new Error('Invalid product_code format. Expected format: PRD-XXXX');
    }

    productData.product_code = productData.product_code.toUpperCase();

    const existingProductCode = await productRepository.findByProductCode(productData.product_code);
    if (existingProductCode) {
      throw new Error('Product code already exists');
    }

    if (!productData.product_name || !productData.product_name.trim()) {
      throw new Error('Product name is required');
    }
    if (!productData.unit || !productData.unit.trim()) {
      throw new Error('Unit is required');
    }

    const exists = await productRepository.existsByNameAndUnit(
      productData.product_name,
      productData.unit
    );

    if (exists) {
      throw new Error('Product with this name and unit already exists');
    }

    return await productRepository.create(productData);
  }

  async updateProduct(productId: number, productData: ProductUpdateDto): Promise<Product> {
    // Prevent product_code modification
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
    if (productData.unit !== undefined && !productData.unit.trim()) {
      throw new Error('Unit cannot be empty');
    }

    if (productData.product_name || productData.unit) {
      const nameToCheck = productData.product_name || existingProduct.product_name;
      const unitToCheck = productData.unit || existingProduct.unit;
      
      const exists = await productRepository.existsByNameAndUnit(
        nameToCheck,
        unitToCheck,
        productId
      );

      if (exists) {
        throw new Error('Product with this name and unit already exists');
      }
    }

    const updatedProduct = await productRepository.update(productId, productData);
    if (!updatedProduct) {
      throw new Error('Failed to update product');
    }
    
    return updatedProduct;
  }

  async toggleProductActive(productId: number): Promise<Product> {
    const exists = await productRepository.findById(productId);
    if (!exists) {
      throw new Error('Product not found');
    }

    const updatedProduct = await productRepository.toggleActive(productId);
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
