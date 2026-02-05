import { Router } from 'express';
import * as kitchenProductionController from '../controllers/kitchenProductionController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);
router.use(requireRole(1, 2)); 

router.get('/', kitchenProductionController.getAllBatchPlans);
router.post('/', kitchenProductionController.createBatchPlans);
router.post('/:batchId/produce', kitchenProductionController.produceBatch);
router.post('/:batchId/stock', kitchenProductionController.stockBatch);
router.post('/:batchId/cancel', kitchenProductionController.cancelBatch);

export default router;
