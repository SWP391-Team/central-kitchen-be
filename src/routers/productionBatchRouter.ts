import { Router } from 'express';
import productionBatchController from '../controllers/productionBatchController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.post('/', requireRole(1, 2), productionBatchController.createBatch);
router.put('/:id/finish', requireRole(1, 2), productionBatchController.finishProduction);
router.put('/:id/cancel', requireRole(1, 2), productionBatchController.cancelBatch);
router.get('/plan/:planId', requireRole(1, 2), productionBatchController.getBatchesByPlanId);
router.get('/:id', requireRole(1, 2), productionBatchController.getBatchById);

export default router;
