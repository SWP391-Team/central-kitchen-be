import { Router } from 'express';
import { LocationController } from '../controllers/locationController';
import { jwtMiddleware } from '../middlewares/jwtMiddleware';
import { requireRole } from '../middlewares/authMiddleware';

const router = Router();
const locationController = new LocationController();

router.use(jwtMiddleware);
router.use(requireRole((1))); 

router.get('/', locationController.getAllLocations);
router.get('/:id', locationController.getLocationById);
router.post('/', locationController.createLocation);
router.put('/:id', locationController.updateLocation);
router.patch('/:id/status', locationController.toggleLocationStatus);
router.delete('/:id', locationController.deleteLocation);

export default router;
