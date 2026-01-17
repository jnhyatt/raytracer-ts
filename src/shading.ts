import { vec3 } from "gl-matrix";
import type { Camera, Light, Material } from "./scene.js";
import type { Contact, Ray } from "./collision.js";

// Viewport class for generating rays through image pixels based on camera settings.
export class Viewport {
  private imagePlaneWidth: number;
  private imagePlaneHeight: number;
  private dims: Dimensions;

  constructor(dims: Dimensions, camera: Camera) {
    this.dims = dims;
    // Rays originate from the origin. As for the direction, picture our image pasted onto a plane
    // at z=1, with the center of the image at (0,0,1). Now picture a ray from the origin through
    // the pixel at (x,y) on that image plane. That's the ray we're going to cast. We just have to
    // transform image-space coordinates to world-space coordinates on that plane.
    //
    // To do that, we need to do some trig. We know the aspect ratio of the image, and we know the
    // vertical field of view from the camera. We compute the height of the image plane at z=1 using
    // tan(fovY/2) = (height/2) / 1. The width is then just height * aspectRatio.
    const aspectRatio = dims.width / dims.height;
    this.imagePlaneHeight = 2 * Math.tan(camera.fovY / 2);
    this.imagePlaneWidth = this.imagePlaneHeight * aspectRatio;
  }

  // Builds a ray from the camera origin through the specified pixel (x,y) based on the camera's
  // field of view and the image dimensions.
  rayForPixel(x: number, y: number): Ray {
    // Compute the world-space coordinates of the pixel on the image plane at z=1.
    // First, we map pixel coordinates to [-1,1] range, where (-1,-1) is bottom-left. This requires
    // us to invert the Y axis since image coordinates have (0,0) at top-left.
    const pixelScreenX = (2 * x + 1) / this.dims.width - 1;
    const pixelScreenY = 1 - (2 * y + 1) / this.dims.height;

    // Then scale to the size of the image plane.
    const pixelWorldX = pixelScreenX * (this.imagePlaneWidth / 2);
    const pixelWorldY = pixelScreenY * (this.imagePlaneHeight / 2);

    // Build the ray from the origin through the pixel.
    return {
      origin: vec3.create(),
      direction: vec3.fromValues(pixelWorldX, pixelWorldY, -1),
    };
  }
}

// Dimensions of an image or viewport.
export interface Dimensions {
  width: number;
  height: number;
}

// Evaluates the direct lighting contribution from a point light source at a surface contact point.
// Returns the outgoing radiance (color) based on the rendering equation for point lights.
export function evaluatePointLight(
  light: Light,
  contact: Contact,
  material: Material,
): vec3 {
  const toLight = vec3.subtract(
    vec3.create(),
    light.position,
    contact.position,
  );
  // Irradiance at the surface falls off with the square of the distance.
  const falloff = 1 / vec3.sqrLen(toLight);
  // We know our light's radiant power (brightness) in watts. It emits uniformly in all directions,
  // so the intensity (power per unit solid angle) is power / (4π).
  const lightIntensity = light.radiantPower / (4 * Math.PI);
  const irradiance = lightIntensity * falloff;
  // Evaluate the Lambertian BRDF for the surface at the contact point for the light direction.
  const brdfCosine = lambertTerm(
    vec3.normalize(toLight, toLight),
    contact.normal,
    material,
  );
  // Outgoing radiance is simply the irradiance scaled by the scattering coefficient. Our lights all
  // emit white light only, so we scale equally across all color channels.
  return vec3.scale(vec3.create(), brdfCosine, irradiance);
}

// Computes the BRDF × cos(θ) term for Lambertian (perfectly diffuse) surfaces. The Lambertian BRDF
// is albedo/π (constant in all directions), and we multiply by max(dot(L,N), 0) which is the cosine
// of the angle between light and normal. This gives the fraction of incoming radiance that gets
// reflected toward the viewer. The 1/π factor ensures energy conservation (see rendering equation).
function lambertTerm(toLight: vec3, normal: vec3, material: Material): vec3 {
  return vec3.scale(
    vec3.create(),
    vec3.scale(vec3.create(), material.albedo, 1 / Math.PI),
    Math.max(vec3.dot(toLight, normal), 0),
  );
}

// Applies Reinhard tone mapping to a color vector. Tone mapping solves the problem of mapping high
// dynamic range colors to low dynamic range displays by compressing the color values while
// preserving relative differences. In other words: if our raytracer wants to output a color with
// RGB values greater than 1.0, we need some way to map that back into the [0,1] range for display.
// This simple Reinhard operator does that by dividing each color component by (1 + component),
// which approaches 1.0 as the component value increases. This means 0 maps to 0, 1 maps to 0.5, and
// very large values asymptotically approach 1.0.
export function tonemapReinhard(color: vec3): vec3 {
  return vec3.fromValues(
    color[0] / (1 + color[0]),
    color[1] / (1 + color[1]),
    color[2] / (1 + color[2]),
  );
}
