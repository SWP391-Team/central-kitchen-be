import { Router } from 'express';
import productBatchController from '../controllers/productBatchController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.use(requireRole(1, 2));

router.get('/', productBatchController.getAllBatches);
router.post('/', productBatchController.createBatches);
router.put('/:id/dispose', productBatchController.disposeBatch);
router.post('/update-statuses', productBatchController.updateStatuses);

export default router;
