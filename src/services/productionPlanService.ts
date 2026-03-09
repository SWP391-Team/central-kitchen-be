import productionPlanRepository from '../repositories/productionPlanRepository';
import productRepository from '../repositories/productRepository';
import { ProductionPlan, ProductionPlanCreateDto, ProductionPlanWithProduct, ProductionPlanListParams } from '../models/ProductionPlan';

export class ProductionPlanService {
  async getProductionPlans(params: ProductionPlanListParams): Promise<{ plans: ProductionPlanWithProduct[], total: number }> {
    return await productionPlanRepository.findAll(params);
  }

  async getProductionPlanById(planId: number): Promise<ProductionPlanWithProduct> {
    const plan = await productionPlanRepository.findById(planId);
    if (!plan) {
      throw new Error('Production plan not found');
    }
    return plan;
  }

  async createProductionPlan(planData: ProductionPlanCreateDto, createdBy: number): Promise<ProductionPlan> {
    if (!planData.product_id || planData.product_id <= 0) {
      throw new Error('Invalid product_id');
    }

    const product = await productRepository.findById(planData.product_id);
    if (!product) {
      throw new Error('Product not found');
    }

    if (!planData.planned_qty || planData.planned_qty <= 0) {
      throw new Error('Planned quantity must be greater than 0');
    }

    if (!Number.isInteger(planData.planned_qty)) {
      throw new Error('Planned quantity must be an integer');
    }

    if (!planData.planned_date) {
      throw new Error('Planned date is required');
    }

    const plannedDate = new Date(planData.planned_date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (isNaN(plannedDate.getTime())) {
      throw new Error('Invalid planned date format');
    }

    if (plannedDate < today) {
      throw new Error('Planned date cannot be in the past');
    }

    return await productionPlanRepository.create(planData, createdBy);
  }

  async cancelProductionPlan(planId: number): Promise<ProductionPlan> {
    const plan = await productionPlanRepository.findById(planId);
    
    if (!plan) {
      throw new Error('Production plan not found');
    }

    if (plan.status !== 'planned') {
      throw new Error('Only plans with status "planned" can be cancelled');
    }

    const cancelledPlan = await productionPlanRepository.cancel(planId);
    
    if (!cancelledPlan) {
      throw new Error('Failed to cancel production plan');
    }

    return cancelledPlan;
  }

  async releasePlan(planId: number): Promise<ProductionPlan> {
    const plan = await productionPlanRepository.findById(planId);
    
    if (!plan) {
      throw new Error('Production plan not found');
    }

    if (plan.status !== 'draft') {
      throw new Error('Only plans with status "draft" can be released');
    }

    const releasedPlan = await productionPlanRepository.release(planId);
    
    if (!releasedPlan) {
      throw new Error('Failed to release production plan');
    }

    return releasedPlan;
  }

  async closeProductionPlan(planId: number): Promise<ProductionPlan> {
    const plan = await productionPlanRepository.findById(planId);
    
    if (!plan) {
      throw new Error('Production plan not found');
    }

    if (plan.status !== 'in_production') {
      throw new Error('Only plans with status "in_production" can be closed');
    }

    const closedPlan = await productionPlanRepository.close(planId);
    
    if (!closedPlan) {
      throw new Error('Failed to close production plan');
    }

    return closedPlan;
  }
}

const productionPlanService = new ProductionPlanService();
export default productionPlanService;
