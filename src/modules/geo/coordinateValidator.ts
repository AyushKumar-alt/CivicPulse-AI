import type { GeoCoordinates, GeoContext } from "@/src/modules/contracts";
import { ValidationError } from "@/src/modules/core";

export class CoordinateValidator {
  public static isValidLatitude(lat: number): boolean {
    return typeof lat === "number" && !isNaN(lat) && lat >= -90 && lat <= 90;
  }

  public static isValidLongitude(lng: number): boolean {
    return typeof lng === "number" && !isNaN(lng) && lng >= -180 && lng <= 180;
  }

  public static validateCoordinates(coords: GeoCoordinates): void {
    if (!this.isValidLatitude(coords.latitude)) {
      throw new ValidationError(`Invalid latitude value '${coords.latitude}'`, "latitude");
    }
    if (!this.isValidLongitude(coords.longitude)) {
      throw new ValidationError(`Invalid longitude value '${coords.longitude}'`, "longitude");
    }
  }

  public static validateGeoContext(context: GeoContext): void {
    if (!context) {
      throw new ValidationError("GeoContext cannot be null or undefined");
    }
    this.validateCoordinates(context.coordinates);
    if (!context.fullAddress || !context.fullAddress.trim()) {
      throw new ValidationError("GeoContext must contain a non-empty fullAddress", "fullAddress");
    }
  }

  public static isWithinBoundingBox(
    coords: GeoCoordinates,
    box: { minLat: number; maxLat: number; minLng: number; maxLng: number }
  ): boolean {
    if (!this.isValidLatitude(coords.latitude) || !this.isValidLongitude(coords.longitude)) {
      return false;
    }
    return (
      coords.latitude >= box.minLat &&
      coords.latitude <= box.maxLat &&
      coords.longitude >= box.minLng &&
      coords.longitude <= box.maxLng
    );
  }
}
