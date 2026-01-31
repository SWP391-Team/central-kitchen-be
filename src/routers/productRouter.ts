import { Router } from 'express';
import productController from '../controllers/productController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.get('/', requireRole(1, 2, 3), productController.getAllProducts);
router.get('/active', requireRole(1, 2, 3), productController.getActiveProducts);
router.get('/search', requireRole(1, 2, 3), productController.searchProducts);
router.get('/:id', requireRole(1, 2, 3), productController.getProductById);

router.post('/', requireRole(1, 2), productController.createProduct);
router.put('/:id', requireRole(1, 2), productController.updateProduct);
router.put('/:id/toggle-active', requireRole(1, 2), productController.toggleProductActive);

export default router;
