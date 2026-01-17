import { mat3, vec3 } from "gl-matrix";
import type { Sphere } from "./scene.js";

export const X = vec3.fromValues(1, 0, 0);
export const Y = vec3.fromValues(0, 1, 0);

// The result of a collision detection between a ray and an object.
export interface Contact {
  // Point of contact in 3D space.
  position: vec3;
  // Normal vector at the point of contact.
  normal: vec3;
  // The geometry that was intersected.
  geometry: Sphere;
}

// A ray in 3D space defined by an origin and a direction.
export interface Ray {
  // Origin point of the ray.
  origin: vec3;
  // Direction vector of the ray. Must not be zero.
  direction: vec3;
}

// A line segment in 3D space defined by a start and end point.
export interface Seg {
  start: vec3;
  end: vec3;
}

// Computing ray-sphere and seg-sphere intersections involve a lot of code duplication. This
// function represents the common work between the two: solving the quadratic equation for the
// nearest intersection of a ray-like thing with a sphere. Specifically, we find the t value, which
// is basically the percentage along the segment where the hit occurs. For rays, the exact t value
// doesn't matter -- t >= 0 means the ray hit the sphere. For segments, the t value is more
// meaningful because it tells us where along the segment the intersection occurs: 0 is at the start
// point, 1 is at the end, and for example 0.3 is 30% of the way from start to end.
export function raySphereT(ray: Ray, sphere: Sphere): number | null {
  // To find the intersection of a ray with a sphere, we want to find where the distance between the
  // ray and the sphere center is equal to the sphere radius. The distance equation is quadratic, so
  // we can solve it using the quadratic formula.
  const oc = vec3.subtract(vec3.create(), ray.origin, sphere.position);
  const a = vec3.sqrLen(ray.direction);
  const b = 2.0 * vec3.dot(oc, ray.direction);
  const c = vec3.sqrLen(oc) - sphere.radius * sphere.radius;
  const discriminant = b * b - 4 * a * c;
  // If the discriminant is negative, the roots are imaginary and there is no intersection.
  if (discriminant < 0) {
    return null;
  } else {
    // In our case, we only want the near intersection point, so we only consider the negative root
    // of the quadratic formula.
    return (-b - Math.sqrt(discriminant)) / (2.0 * a);
  }
}

// Find the intersection of a ray with a sphere. Returns a Contact if there is an intersection,
// otherwise returns null.
export function intersectRaySphere(ray: Ray, sphere: Sphere): Contact | null {
  const t = raySphereT(ray, sphere);
  // If t is negative, the intersection point is behind the ray origin, so we ignore it.
  if (t === null || t < 0) {
    return null;
  }
  // At this point, we know there is an intersection. Compute the contact position and normal.
  const position = vec3.scaleAndAdd(
    vec3.create(),
    ray.origin,
    ray.direction,
    t,
  );
  const normal = vec3.subtract(vec3.create(), position, sphere.position);
  vec3.normalize(normal, normal);
  return { position, normal, geometry: sphere };
}

export function intersectSegSphere(seg: Seg, sphere: Sphere): Contact | null {
  // Finding the intersection of a line segment and a sphere is just like doing it for a ray, except
  // we're checking that 0 <= t <= 1 instead of t >= 0.
  const ray = {
    origin: seg.start,
    direction: vec3.subtract(vec3.create(), seg.end, seg.start),
  };
  const t = raySphereT(ray, sphere);
  if (t === null || t < 0 || t > 1) {
    return null;
  }
  // We have an intersection! Compute the contact position and normal.
  const position = vec3.scaleAndAdd(
    vec3.create(),
    seg.start,
    vec3.subtract(vec3.create(), seg.end, seg.start),
    t,
  );
  const normal = vec3.subtract(vec3.create(), position, sphere.position);
  vec3.normalize(normal, normal);
  return { position, normal, geometry: sphere };
}

// Returns a comparator function that sorts contacts by their distance to a given point. We use this
// to find the closest intersection to the ray origin when multiple intersections are found. It'd be
// slightly smarter to sort by the t value, but that'd require a bit of a refactor I don't have the
// motivation for.
export function closestTo(point: vec3) {
  return (a: Contact, b: Contact) => {
    const distA = vec3.sqrLen(vec3.subtract(vec3.create(), a.position, point));
    const distB = vec3.sqrLen(vec3.subtract(vec3.create(), b.position, point));
    return distA - distB;
  };
}

// Generates a cosine-weighted random direction on the unit hemisphere with +Z as up. Uses Malley's
// method: uniform sampling on unit disk, then project up to hemisphere. Returns a direction vector
// in local space where Z is the hemisphere axis. We use this for importance sampling for diffuse
// reflection.
function cosineWeightedHemisphereSampleZ(): vec3 {
  // To uniformly sample on the unit disk, we sample theta uniformly in [0, 2*pi), but r has to be
  // sampled with square root to account for the fact that uniformly sampled radii will clump at the
  // center.
  const r = Math.sqrt(Math.random());
  const theta = Math.random() * 2 * Math.PI;
  // Then we convert our polar coordinates to 2D cartesian.
  const x = r * Math.cos(theta);
  const y = r * Math.sin(theta);
  // Use the Pythagorean theorem to project the point up to the hemisphere.
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  // At this point we have a nice, cosine-weighted sampling on the hemisphere. While the disk
  // sampling is uniform, projecting it up to the hemisphere introduces the cosine weighting.
  return vec3.fromValues(x, y, z);
}

// Constructs an orthonormal basis from a given Z vector. The basis is arbitrary -- there's not
// really a good "canonical" choice for the X and Y axes given only Z. Instead, we start with a
// reference vector that is not parallel to Z, and use the cross product to generate the other axes
// to form a right-handed orthonormal basis.
function arbitraryBasis(z: vec3): mat3 {
  // Find a vector not parallel to z to use as reference.
  const ref = Math.abs(z[1]) < 0.9 ? Y : X;
  // Compute orthonormal basis vectors using cross products.
  const x = vec3.normalize(vec3.create(), vec3.cross(vec3.create(), z, ref));
  const y = vec3.cross(vec3.create(), z, x);
  // `mat3.fromValues` takes values in column-major order.
  return mat3.fromValues(x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2]);
}

// Generates a random direction in a cosine-weighted hemisphere around the normal. This importance
// sampling technique weights samples toward the normal (where the cosine term in the rendering
// equation is largest), reducing variance in Monte Carlo integration.
export function cosineWeightedHemisphereSample(normal: vec3): vec3 {
  // Generate sample in local space (Z-up hemisphere).
  const sampleDir = cosineWeightedHemisphereSampleZ();
  // Build orthonormal basis with normal as Z.
  const basis = arbitraryBasis(normal);
  // Transform our sample from local space to tangent space.
  return vec3.transformMat3(vec3.create(), sampleDir, basis);
}
