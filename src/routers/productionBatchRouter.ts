import { Router } from 'express';
import productionBatchController from '../controllers/productionBatchController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.post('/', requireRole(1, 2), productionBatchController.createBatch);
router.get('/next-code', requireRole(1, 2), productionBatchController.getNextBatchCode);
router.get('/produced-by-suggestions', requireRole(1, 2), productionBatchController.searchProducedBySuggestions);
router.put('/:id/finish', requireRole(1, 2), productionBatchController.finishProduction);
router.put('/:id/cancel', requireRole(1, 2), productionBatchController.cancelBatch);
router.put('/:id/send-to-qc', requireRole(1, 2), productionBatchController.sendToQC);
router.put('/:id/undo-send-to-qc', requireRole(1, 2), productionBatchController.undoSendToQC);
router.get('/all', requireRole(1, 2), productionBatchController.getAllBatches);
router.get('/:id/status-history', requireRole(1, 2), productionBatchController.getBatchStatusHistory);
router.get('/plan/:planId', requireRole(1, 2), productionBatchController.getBatchesByPlanId);
router.get('/:id', requireRole(1, 2), productionBatchController.getBatchById);

export default router;
