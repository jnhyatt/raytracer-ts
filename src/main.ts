import { readFileSync, writeFileSync } from "fs";
import { vec3 } from "gl-matrix";
import { PNG } from "pngjs";
import yargs from "yargs";

import type { Material, Object3D, Scene } from "./scene.js";
import { Viewport, tonemapReinhard } from "./shading.js";
import { radianceForRay } from "./trace.js";

// Parse command-line arguments for input/output files and image dimensions.
const argv = await yargs(process.argv.slice(2)).options({
  input: {
    alias: "i",
    type: "string",
    description: "Input scene JSON file path",
  },
  output: {
    alias: "o",
    type: "string",
    description: "Output PNG file path",
    default: "output.png",
  },
  width: {
    alias: "w",
    type: "number",
    description: "Image width in pixels",
    default: 256,
  },
  height: {
    alias: "h",
    type: "number",
    description: "Image height in pixels",
    default: 256,
  },
  samples: {
    alias: "s",
    type: "number",
    description:
      "Number of indirect samples per bounce for Monte Carlo integration",
    default: 16,
  },
  depth: {
    alias: "d",
    type: "number",
    description: "Maximum recursion depth for path tracing",
    default: 3,
  },
}).argv;

// Load and parse the scene description from the input JSON file.
const scene = argv.input
  ? (JSON.parse(readFileSync(argv.input, "utf-8")) as Scene)
  : randomScene();
console.log(
  argv.input ? `Loaded scene ${argv.input}` : "Generated random scene",
);

// Create a new PNG image we can stuff raytrace results into.
const png = new PNG({ width: argv.width, height: argv.height });

// Create a viewport for generating rays based on the camera and image dimensions.
const viewport = new Viewport(
  { width: png.width, height: png.height },
  scene.camera,
);

// Async function to render a single row of pixels. This allows us to demonstrate async/await and
// also provides a nice progress update mechanism.
async function renderRow(y: number): Promise<void> {
  return new Promise((resolve) => {
    // Use setImmediate to make this genuinely async (non-blocking). The callback will wait for the
    // next event loop tick before executing.
    setImmediate(() => {
      for (let x = 0; x < png.width; x++) {
        // Build the ray from the origin through the pixel.
        const ray = viewport.rayForPixel(x, y);
        // Cast the ray through the scene to get the radiance (color) seen along that ray.
        const radiance = radianceForRay(ray, scene, argv.depth, argv.samples);
        // Apply tone mapping to the radiance to get the final color for the pixel.
        const color = radiance ? tonemapReinhard(radiance) : vec3.create();

        // Write the accumulated color to the PNG data. Data is stored as RGBA bytes, so we need to
        // scale our [0,1] float color to [0,255] integers and compute the right index. Pixels are
        // indexed row-major from the top-left.
        const idx = (y * png.width + x) * 4;
        png.data[idx + 0] = color[0] * 255;
        png.data[idx + 1] = color[1] * 255;
        png.data[idx + 2] = color[2] * 255;
        png.data[idx + 3] = 255; // Alpha is always fully opaque
      }
      // Resolve the promise!
      resolve();
    });
  });
}

// Render all rows using our async function, with progress updates.
console.log(`Rendering ${png.height} rows...`);
for (let y = 0; y < png.height; y++) {
  await renderRow(y);
  // Print progress every 10% of rows.
  if ((y + 1) % Math.max(1, Math.floor(png.height / 10)) === 0) {
    console.log(`Progress: ${Math.round(((y + 1) / png.height) * 100)}%`);
  }
}
console.log("Rendering complete!");

// Write the PNG image data to the output file.
const buffer = PNG.sync.write(png);
writeFileSync(argv.output, buffer);
console.log(`Output written to ${argv.output}`);

// Generate a random scene consisting of 10 randomly positioned and colored spheres, plus a handful
// of randomly positioned lights of varying brightness. Used when no input scene file is provided.
function randomScene(): Scene {
  // We'll generate 10 random colors and name them color0, color1, ..., color9.
  const materials: { [name: string]: Material } = {};
  const objects: Object3D[] = [];
  for (let i = 0; i < 10; i++) {
    materials[`color${i}`] = {
      albedo: [Math.random(), Math.random(), Math.random()],
    };
    objects.push({
      type: "sphere",
      position: [
        Math.random() * 10 - 5,
        Math.random() * 10 - 5,
        Math.random() * -10 - 5,
      ],
      radius: Math.random() * 1 + 0.5,
      material: `color${i}`,
    });
  }
  // Generate 3 randomly positioned lights.
  for (let i = 0; i < 3; i++) {
    objects.push({
      type: "light",
      radiantPower: Math.random() * 1000 + 500,
      position: [
        Math.random() * 10 - 5,
        Math.random() * 10 - 5,
        Math.random() * -10 - 5,
      ],
    });
  }
  return {
    camera: {
      fovY: 1.0472,
    },
    materials,
    objects,
  };
}
