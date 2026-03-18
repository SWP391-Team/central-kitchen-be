import { Router } from 'express';
import supplyOrderController from '../controllers/supplyOrderController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);

router.get('/ck-inventory', requireRole(1, 2, 3), supplyOrderController.getCkInventory);
router.get('/requesters', requireRole(1, 2, 3), supplyOrderController.searchRequesters);
router.get('/', requireRole(1, 2, 3), supplyOrderController.getList);
router.get('/:id', requireRole(1, 2, 3), supplyOrderController.getDetail);

router.post('/', requireRole(3), supplyOrderController.create);
router.put('/:id/send-to-ck', requireRole(1, 2, 3), supplyOrderController.sendToCk);
router.put('/:id/approve', requireRole(1, 2), supplyOrderController.approve);
router.post('/:id/items/:itemId/deliver', requireRole(1, 2), supplyOrderController.deliverItem);
router.put('/:id/close', requireRole(1, 2, 3), supplyOrderController.closeOrder);

export default router;
