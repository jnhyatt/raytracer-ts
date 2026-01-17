import { vec3 } from "gl-matrix";
import {
  closestTo,
  intersectRaySphere,
  intersectSegSphere,
  cosineWeightedHemisphereSample,
  type Ray,
} from "./collision.js";
import type { Light, Scene } from "./scene.js";
import { evaluatePointLight } from "./shading.js";

// Computes the color seen along a ray in the scene using physically-based path tracing. Returns
// null if the ray hits nothing, allowing us to substitute any background independently.
//
// This function implements a recursive path tracer that computes:
// 1. Direct lighting: contribution from light sources (with shadow rays for occlusion testing)
// 2. Indirect lighting: contribution from light bouncing off other surfaces (Monte Carlo integration)
//
// @param ray - The ray to trace through the scene
// @param scene - The scene containing geometry and lights
// @param depth - Remaining recursion depth (counts down to 0)
// @param indirectSamples - Number of indirect rays to cast per bounce (higher = more accurate but slower)
export function radianceForRay(
  ray: Ray,
  scene: Scene,
  depth: number,
  indirectSamples: number,
): vec3 | null {
  // Base case: stop recursion when depth reaches zero
  if (depth <= 0) return null;

  // Find all ray-sphere intersections in the scene, sorted by distance to ray origin.
  const rayHits = scene.objects
    .filter((o) => o.type === "sphere")
    .flatMap((sphere) => {
      const contact = intersectRaySphere(ray, sphere);
      return contact ? [contact] : [];
    })
    .sort(closestTo(ray.origin));

  // Grab the closest hit, if any, discarding the rest.
  if (rayHits.length === 0) return null;
  const hit = rayHits[0]!;

  // Grab the associated material for the hit object.
  const material = scene.materials[hit.geometry.material];
  if (!material) {
    console.warn(
      `Material ${hit.geometry.material} not found for object`,
      hit.geometry,
    );
    return null;
  }

  // === DIRECT LIGHTING ===
  // Compute contribution from each light source, checking for occlusion with shadow rays
  const directLight = scene.objects
    .filter((o) => o.type === "light")
    .map((light) => {
      // Draw a line segment from the hit point to the light to check for occlusion.
      const shadowSeg = {
        start: hit.position,
        end: light.position,
      };

      // Test the line segment against all spheres in the scene (except `hit.geometry`).
      const occluded = scene.objects
        .filter((o) => o.type === "sphere")
        .filter((o) => o !== hit.geometry)
        .some((sphere) => intersectSegSphere(shadowSeg, sphere));

      if (occluded) {
        // Point is in shadow, no direct lighting contribution from this light.
        return vec3.create();
      }

      // Evaluate the point light contribution at this surface point
      return evaluatePointLight(light as Light, hit, material);
    })
    .reduce((acc, x) => vec3.add(acc, acc, x), vec3.create());

  // === INDIRECT LIGHTING ===
  // Use Monte Carlo integration to estimate incoming radiance from all directions
  // The rendering equation for indirect lighting is:
  // L_o(x, ω_o) = ∫_Ω BRDF(x, ω_i, ω_o) * L_i(x, ω_i) * cos(θ_i) dω_i
  //
  // We approximate this integral using Monte Carlo: sum up samples and divide by PDF
  const indirectLight = vec3.create();

  for (let i = 0; i < indirectSamples; i++) {
    // Generate random direction using cosine-weighted hemisphere sampling
    // This importance sampling technique has PDF = cos(θ) / π
    const indirectDir = cosineWeightedHemisphereSample(hit.normal);

    // Offset ray origin slightly along normal to avoid self-intersection.
    const indirectOrigin = vec3.scaleAndAdd(
      vec3.create(),
      hit.position,
      hit.normal,
      0.001,
    );
    const indirectRay: Ray = { origin: indirectOrigin, direction: indirectDir };

    // Recursively trace the indirect ray.
    const incomingRadiance = radianceForRay(
      indirectRay,
      scene,
      depth - 1,
      indirectSamples,
    );

    if (incomingRadiance) {
      // For our Monte Carlo estimator for cosine-weighted sampling, the cos(θ) term and the 1/π
      // from the Lambertian BRDF cancel with the cos(θ)/π PDF, leaving us with just albedo * L_i.
      const contribution = vec3.multiply(
        vec3.create(),
        material.albedo,
        incomingRadiance,
      );
      vec3.add(indirectLight, indirectLight, contribution);
    }
  }

  // Average the indirect samples (Monte Carlo estimator)
  vec3.scale(indirectLight, indirectLight, 1 / indirectSamples);

  // Combine direct and indirect lighting
  return vec3.add(vec3.create(), directLight, indirectLight);
}
