import { Router } from 'express';
import productBatchController from '../controllers/productBatchController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);
router.use(requireRole(1, 2, 3)); 

router.get('/', productBatchController.getAllBatches);
router.get('/store/:storeId', productBatchController.getBatchesByStore);
router.post('/', productBatchController.createBatches);

export default router;
