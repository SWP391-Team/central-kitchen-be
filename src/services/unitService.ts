import unitRepository from '../repositories/unitRepository';
import { Unit, UnitCreateDto, UnitUpdateDto } from '../models/Unit';

export class UnitService {
  async getAllUnits(params?: { isActive?: boolean; search?: string }): Promise<Unit[]> {
    return unitRepository.findAll(params);
  }

  async getActiveUnits(): Promise<Unit[]> {
    return unitRepository.findAllActive();
  }

  async getUnitById(unitId: number): Promise<Unit> {
    const unit = await unitRepository.findById(unitId);
    if (!unit) {
      throw new Error('Unit not found');
    }
    return unit;
  }

  async createUnit(unitData: UnitCreateDto, createdBy: number): Promise<Unit> {
    if (!unitData.unit_name || !unitData.unit_name.trim()) {
      throw new Error('Unit name is required');
    }

    const exists = await unitRepository.existsByName(unitData.unit_name);
    if (exists) {
      throw new Error('Unit name already exists');
    }

    return unitRepository.create({
      ...unitData,
      created_by: createdBy,
    });
  }

  async updateUnit(unitId: number, unitData: UnitUpdateDto, updatedBy: number): Promise<Unit> {
    const existingUnit = await unitRepository.findById(unitId);
    if (!existingUnit) {
      throw new Error('Unit not found');
    }

    if (unitData.unit_name !== undefined && !unitData.unit_name.trim()) {
      throw new Error('Unit name cannot be empty');
    }

    if (unitData.unit_name) {
      const exists = await unitRepository.existsByName(unitData.unit_name, unitId);
      if (exists) {
        throw new Error('Unit name already exists');
      }
    }

    const updatedUnit = await unitRepository.update(unitId, unitData, updatedBy);
    if (!updatedUnit) {
      throw new Error('Failed to update unit');
    }

    return updatedUnit;
  }

  async toggleUnitActive(unitId: number, updatedBy: number): Promise<Unit> {
    const existingUnit = await unitRepository.findById(unitId);
    if (!existingUnit) {
      throw new Error('Unit not found');
    }

    if (existingUnit.is_active) {
      const blockers = await unitRepository.getDeactivationBlockers(unitId);
      if (blockers.length > 0) {
        throw new Error(`Cannot deactivate unit: ${blockers.join('; ')}`);
      }
    }

    const updatedUnit = await unitRepository.toggleActive(unitId, updatedBy);
    if (!updatedUnit) {
      throw new Error('Failed to toggle unit status');
    }

    return updatedUnit;
  }
}

export default new UnitService();
