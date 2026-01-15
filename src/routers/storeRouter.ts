import { Router } from 'express';
import { StoreController } from '../controllers/storeController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';

const router = Router();
const storeController = new StoreController();

// All store routes require authentication
router.use(jwtMiddleware);

router.get('/', storeController.getAllStores);
router.get('/:id', storeController.getStoreById);
router.post('/', storeController.createStore);
router.put('/:id', storeController.updateStore);
router.patch('/:id/status', storeController.toggleStoreStatus);
router.delete('/:id', storeController.deleteStore);

export default router;
