import { Router } from 'express';
import qualityInspectionController from '../controllers/qualityInspectionController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.post('/start', requireRole(2), qualityInspectionController.startInspection);
router.post('/reinspection', requireRole(2), qualityInspectionController.reinspection);
router.get('/inspected-by-suggestions', requireRole(2), qualityInspectionController.searchInspectedBySuggestions);
router.put('/:id/finish', requireRole(2), qualityInspectionController.finishInspection);
router.put('/:id/undo', requireRole(2), qualityInspectionController.undoInspection);
router.put('/:id/send-rework-request', requireRole(2), qualityInspectionController.sendReworkRequest);
router.put('/batch/:batchId/reject', requireRole(2), qualityInspectionController.rejectBatch);
router.get('/batch/:batchId', requireRole(1, 2), qualityInspectionController.getInspectionsByBatchId);
router.get('/:id', requireRole(1, 2), qualityInspectionController.getInspectionById);
router.get('/', requireRole(1, 2), qualityInspectionController.getQualityInspections);

export default router;
