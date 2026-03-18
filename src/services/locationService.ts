import { LocationRepository } from '../repositories/locationRepository';
import { LocationCreateDto, LocationUpdateDto, LocationResponse } from '../models/Location';

export class LocationService {
  private locationRepository: LocationRepository;

  constructor() {
    this.locationRepository = new LocationRepository();
  }

  async getAllLocations(params?: { search?: string; is_active?: boolean; location_type?: string }): Promise<LocationResponse[]> {
    return await this.locationRepository.findAll(params);
  }

  async getLocationById(locationId: number): Promise<LocationResponse> {
    const location = await this.locationRepository.findById(locationId);
    if (!location) {
      throw new Error('Location not found');
    }
    return location;
  }

  async createLocation(locationData: LocationCreateDto): Promise<LocationResponse> {
    const locationCodePattern = /^[A-Z][A-Z0-9_-]{2,31}$/;
    if (!locationData.location_code || !locationCodePattern.test(locationData.location_code.toUpperCase())) {
      throw new Error('Invalid location_code format. Expected 3-32 chars: A-Z, 0-9, _, -');
    }

    if (!locationData.location_type) {
      throw new Error('location_type is required');
    }

    locationData.location_code = locationData.location_code.toUpperCase();

    const existingLocationCode = await this.locationRepository.findByCode(locationData.location_code);
    if (existingLocationCode) {
      throw new Error('Location code already exists');
    }

    const existingLocation = await this.locationRepository.findByName(locationData.location_name);
    if (existingLocation) {
      throw new Error('Location name already exists');
    }

    return await this.locationRepository.create(locationData);
  }

  async updateLocation(locationId: number, locationData: LocationUpdateDto): Promise<LocationResponse> {
    if ('location_code' in (locationData as any)) {
      throw new Error('Cannot modify location_code after creation');
    }

    const location = await this.locationRepository.findById(locationId);
    if (!location) {
      throw new Error('Location not found');
    }

    if (locationData.location_name && locationData.location_name !== location.location_name) {
      const existingLocation = await this.locationRepository.findByName(locationData.location_name);
      if (existingLocation) {
        throw new Error('Location name already exists');
      }
    }

    const updatedLocation = await this.locationRepository.update(locationId, locationData);
    if (!updatedLocation) {
      throw new Error('Failed to update location');
    }
    return updatedLocation;
  }

  async toggleLocationStatus(locationId: number, is_active: boolean): Promise<LocationResponse> {
    const location = await this.locationRepository.findById(locationId);
    if (!location) {
      throw new Error('Location not found');
    }

    const updatedLocation = await this.locationRepository.updateStatus(locationId, is_active);
    if (!updatedLocation) {
      throw new Error('Failed to update location status');
    }
    return updatedLocation;
  }

  async deleteLocation(locationId: number): Promise<void> {
    const location = await this.locationRepository.findById(locationId);
    if (!location) {
      throw new Error('Location not found');
    }

    const hasUsers = await this.locationRepository.hasUsers(locationId);
    if (hasUsers) {
      throw new Error('Cannot delete location with assigned users. Please reassign or remove users first.');
    }

    await this.locationRepository.delete(locationId);
  }
}
