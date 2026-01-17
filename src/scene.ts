import { vec3 } from "gl-matrix";

// Scene description for a simple ray tracer.
export interface Scene {
  camera: Camera;
  materials: { [name: string]: Material };
  objects: Object3D[];
}

// Camera settings for rendering the scene. To keep the program scoped, the camera is locked to the
// origin looking down -Z, and always represents a perspective projection.
export interface Camera {
  // Field of view in the Y direction, in radians.
  fovY: number;
}

// Material properties for rendering surfaces. For simplicity, all materials are Lambertian diffuse
// reflectors with a single albedo color. In the future, we could support roughness and metallicity.
export interface Material {
  // Base color of the material. Component values are in the range [0, 1].
  albedo: vec3;
}

// Base type for all 3D objects in the scene.
export type Object3D = Geometry | Light;

// Geometric objects in the scene. Currently, only spheres are supported.
export type Geometry = Sphere;

// A point light source in 3D space. Emits white light uniformly in all directions.
export interface Light {
  type: "light";
  // Radiant power of the light source in watts.
  radiantPower: number;
  // Position of the light source in 3D space.
  position: vec3;
}

// A sphere object in the scene.
export interface Sphere {
  type: "sphere";
  // Radius of the sphere.
  radius: number;
  // Center of the sphere in 3D space.
  position: vec3;
  // Name of the material applied to the sphere.
  material: string;
}
