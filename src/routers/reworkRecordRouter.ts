import { Router } from 'express';
import reworkRecordController from '../controllers/reworkRecordController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.post('/start', requireRole(2), reworkRecordController.startRework);
router.get('/rework-by-suggestions', requireRole(2), reworkRecordController.searchReworkBySuggestions);
router.put('/:id/finish', requireRole(2), reworkRecordController.finishRework);
router.put('/:id/undo', requireRole(2), reworkRecordController.undoFinishRework);
router.put('/batch/:batchId/send-to-qc', requireRole(2), reworkRecordController.sendToQC);
router.get('/', requireRole(1, 2), reworkRecordController.getAllReworkRecords);
router.get('/by-batch-ids', requireRole(1, 2), reworkRecordController.getReworksByBatchIds);
router.get('/:id', requireRole(1, 2), reworkRecordController.getReworkById);
router.get('/batch/:batchId', requireRole(1, 2), reworkRecordController.getReworksByBatchId);

export default router;
