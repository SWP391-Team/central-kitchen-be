import { Router } from 'express';
import inventoryController from '../controllers/inventoryController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();

router.use(jwtMiddleware);
router.use(requireRole(1, 2, 3)); 

router.get('/store/:storeId', inventoryController.getInventoryByStore);
router.put('/:inventoryId/dispose', inventoryController.disposeInventory);
router.post('/update-statuses', inventoryController.updateStatuses);

export default router;
