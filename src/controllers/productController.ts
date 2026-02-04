import { Request, Response } from 'express';
import productService from '../services/productService';
import { ProductCreateDto, ProductUpdateDto } from '../models/Product';

export class ProductController {
  getAllProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const products = await productService.getAllProducts();
      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error('Get all products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getActiveProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const products = await productService.getActiveProducts();
      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error('Get active products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };

  getProductById = async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = parseInt(req.params.id as string);
      
      if (isNaN(productId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid product ID',
        });
        return;
      }

      const product = await productService.getProductById(productId);
      
      res.json({
        success: true,
        data: product,
      });
    } catch (error: any) {
      console.error('Get product by ID error:', error);
      if (error.message === 'Product not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const productData: ProductCreateDto = req.body;
      
      const newProduct = await productService.createProduct(productData);
      
      res.status(201).json({
        success: true,
        message: 'Product created successfully',
        data: newProduct,
      });
    } catch (error: any) {
      console.error('Create product error:', error);
      if (error.message.includes('required')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else if (error.message === 'Product code already exists') {
        res.status(409).json({
          success: false,
          message: error.message,
        });
      } else if (error.message.includes('Invalid product_code format')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else if (error.message.includes('already exists')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = parseInt(req.params.id as string);
      
      if (isNaN(productId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid product ID',
        });
        return;
      }

      const productData: ProductUpdateDto = req.body;
      
      const updatedProduct = await productService.updateProduct(productId, productData);
      
      res.json({
        success: true,
        message: 'Product updated successfully',
        data: updatedProduct,
      });
    } catch (error: any) {
      console.error('Update product error:', error);
      if (error.message === 'Product not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else if (error.message === 'Cannot modify product_code after creation') {
        res.status(403).json({
          success: false,
          message: error.message,
        });
      } else if (error.message.includes('cannot be empty') || error.message.includes('already exists')) {
        res.status(400).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  toggleProductActive = async (req: Request, res: Response): Promise<void> => {
    try {
      const productId = parseInt(req.params.id as string);
      
      if (isNaN(productId)) {
        res.status(400).json({
          success: false,
          message: 'Invalid product ID',
        });
        return;
      }

      const updatedProduct = await productService.toggleProductActive(productId);
      
      res.json({
        success: true,
        message: `Product ${updatedProduct.is_active ? 'activated' : 'deactivated'} successfully`,
        data: updatedProduct,
      });
    } catch (error: any) {
      console.error('Toggle product active error:', error);
      if (error.message === 'Product not found') {
        res.status(404).json({
          success: false,
          message: error.message,
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Internal server error',
        });
      }
    }
  };

  searchProducts = async (req: Request, res: Response): Promise<void> => {
    try {
      const searchTerm = req.query.q as string || '';
      
      const products = await productService.searchProducts(searchTerm);
      
      res.json({
        success: true,
        data: products,
      });
    } catch (error) {
      console.error('Search products error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
      });
    }
  };
}

export default new ProductController();
