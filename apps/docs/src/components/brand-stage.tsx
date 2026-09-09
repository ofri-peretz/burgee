'use client';

/**
 * The marks, extruded and lit — the docs hero, and only ever the hero.
 *
 * The identity stays the flat SVG: a favicon has no GPU, an npm README has no
 * canvas, and a rendered mark is a raster wherever it is pinned. This is the one
 * surface that can afford a renderer, so it is the one place a renderer runs.
 *
 * The rig is three's own `webgl_lights_hemisphere`: a sky/ground hemisphere
 * light for ambient and one directional key with shadows. That pair is what
 * makes an extruded logo read as an object rather than a sticker with a drop
 * shadow — the flat-extrusion prototype before it had no light and looked it.
 *
 * The geometry comes from `/brand/*.svg`, which `npm run brand` generates from
 * the same declaration as every other surface and the drift check pins. Those
 * copies are unlit on purpose: the published asset carries its own sheen and
 * bevel, and handing a lit mark to a renderer lights it twice.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Box3,
  Clock,
  Color,
  DirectionalLight,
  ExtrudeGeometry,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Vector3,
  WebGLRenderer,
  type Material,
} from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';

const MARKS = [
  'burgee',
  'roundel',
  'flagstaff',
  'caique',
  'linegauge',
  'seniority',
  'bellpull',
  'closeout',
] as const;

/** Extrusion, in the marks' own 100-unit space. */
const SOLID = { depth: 10, bevel: 1.6, bevelSegments: 4, curveSegments: 28 } as const;

/** Where the marks stand, and where the camera watches them from. */
const STAGE = { gap: 112, floorDrop: 80, cameraY: 14, cameraZ: 860, fov: 30 } as const;

/** Coplanar fills z-fight; each successive layer sits this much proud of the last. */
const LAYER_STEP = 0.6;

/** A slow turn and a slower rise, phase-offset so four marks are not one object. */
const DRIFT = { turn: 0.34, tilt: 0.55, rise: 0.8, lift: 4, offset: 0.7, parked: 0.42 } as const;

const LIGHT = {
  hemisphere: 2.1,
  key: 2.6,
  keyX: 130,
  keyY: 190,
  keyZ: 150,
  shadowMap: 2048,
  bias: 0.0004,
  frustum: 320,
  far: 1000,
  white: 0xffffff,
  shadowOpacity: 0.18,
} as const;

/** Brand colours, as the renderer wants them. */
const PALETTE = {
  ink: 0x0a0a0a,
  rock: 0xf4794a,
  juniper: 0x0d9460,
  paper: 0xefe9dd,
  sky: 0xe7ece9,
  bounce: 0x12201b,
} as const;

const SURFACE = { body: 0.62, colour: 0.38, metalness: 0.04 } as const;
const MAX_PIXEL_RATIO = 2;
const HALF = 2;

const SWATCHES = new Map<string, number>([
  ['#0a0a0a', PALETTE.ink],
  ['#f4794a', PALETTE.rock],
  ['#0d9460', PALETTE.juniper],
  ['#efe9dd', PALETTE.paper],
]);

function markUrl(name: string): string {
  return `/brand/${name}.svg`;
}

function materialFor(fill: string): Material {
  const color = SWATCHES.get(fill.toLowerCase()) ?? PALETTE.ink;
  return new MeshStandardMaterial({
    color,
    roughness: color === PALETTE.ink ? SURFACE.body : SURFACE.colour,
    metalness: SURFACE.metalness,
  });
}

/** One mark: every filled shape in its SVG, extruded, centred and stood up. */
async function loadMark(url: string): Promise<Group> {
  const data = await new SVGLoader().loadAsync(url);
  const group = new Group();
  let layer = 0;
  for (const path of data.paths) {
    // SVGLoader types userData as {}; the loader documents style.fill on it.
    const style = (path.userData as { style?: { fill?: string } } | undefined)?.style;
    const fill = style?.fill ?? '#0a0a0a';
    if (fill === 'none') continue;
    const material = materialFor(fill);
    for (const shape of SVGLoader.createShapes(path)) {
      const geometry = new ExtrudeGeometry(shape, {
        depth: SOLID.depth,
        bevelEnabled: true,
        bevelThickness: SOLID.bevel,
        bevelSize: SOLID.bevel,
        bevelSegments: SOLID.bevelSegments,
        curveSegments: SOLID.curveSegments,
      });
      const mesh = new Mesh(geometry, material);
      mesh.position.z = layer * LAYER_STEP;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    layer += 1;
  }
  // SVG space is y-down with its origin at the top left: centre it, then flip.
  const centre = new Box3().setFromObject(group).getCenter(new Vector3());
  for (const child of group.children) child.position.sub(centre);
  group.scale.y = -1;
  return group;
}

/** Nothing to tear down, when there was nothing to build. */
function noTeardown(): void {
  return undefined;
}

function newRenderer(): WebGLRenderer | null {
  try {
    return new WebGLRenderer({ antialias: true });
  } catch {
    return null;
  }
}

/** Hemisphere for ambient, one directional key, and a plane that only takes shadow. */
function lightScene(scene: Scene): void {
  scene.add(new HemisphereLight(PALETTE.sky, PALETTE.bounce, LIGHT.hemisphere));

  const key = new DirectionalLight(LIGHT.white, LIGHT.key);
  key.position.set(-LIGHT.keyX, LIGHT.keyY, LIGHT.keyZ);
  key.castShadow = true;
  key.shadow.mapSize.set(LIGHT.shadowMap, LIGHT.shadowMap);
  key.shadow.camera.top = LIGHT.frustum;
  key.shadow.camera.bottom = -LIGHT.frustum;
  key.shadow.camera.left = -LIGHT.frustum;
  key.shadow.camera.right = LIGHT.frustum;
  key.shadow.camera.far = LIGHT.far;
  key.shadow.bias = -LIGHT.bias;
  scene.add(key);

  const floor = new Mesh(
    new PlaneGeometry(LIGHT.far * HALF, LIGHT.far * HALF),
    new ShadowMaterial({ opacity: LIGHT.shadowOpacity }),
  );
  floor.rotation.x = -Math.PI / HALF;
  floor.position.y = -STAGE.floorDrop;
  floor.receiveShadow = true;
  scene.add(floor);
}

/**
 * Build the scene, start the loop, hand back the teardown.
 *
 * Outside the component on purpose: none of this is React's business, and a
 * hook body this long is a component that has to be read twice.
 */
function stage(mount: HTMLElement, onFail: () => void): () => void {
  const renderer = newRenderer();
  if (renderer === null) {
    onFail();
    return noTeardown;
  }

  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const scene = new Scene();
  scene.background = new Color(PALETTE.sky);
  lightScene(scene);

  const camera = new PerspectiveCamera(STAGE.fov, 1, 1, LIGHT.far);
  camera.position.set(0, STAGE.cameraY, STAGE.cameraZ);

  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  mount.append(renderer.domElement);

  const resize = (): void => {
    // Style updated too: at a device pixel ratio above 1, a canvas whose CSS
    // size is left unset displays at its buffer size and overflows the mount.
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(mount);

  const marks: Group[] = [];
  let stopped = false;
  let frame = 0;

  const place = (groups: Group[]): void => {
    if (stopped) return;
    groups.forEach((group, i) => {
      group.position.x = (i - (groups.length - 1) / HALF) * STAGE.gap;
      scene.add(group);
      marks.push(group);
    });
  };
  const drift = (mark: Group, i: number, t: number): void => {
    mark.rotation.y = reduced
      ? -DRIFT.parked
      : Math.sin(t * DRIFT.turn + i * DRIFT.offset) * DRIFT.tilt;
    mark.position.y = reduced ? 0 : Math.sin(t * DRIFT.rise + i) * DRIFT.lift;
  };

  void Promise.all(MARKS.map(markUrl).map(loadMark)).then(place).catch(onFail);

  const clock = new Clock();
  const tick = (): void => {
    frame = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    for (const [i, mark] of marks.entries()) drift(mark, i, t);
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    stopped = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

/** The stage, with the flat mark standing in wherever WebGL will not run. */
export function BrandStage() {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = host.current;
    if (mount === null) return;
    return stage(mount, () => setFailed(true));
  }, []);

  if (failed) {
    return (
      <div className="flex h-[460px] items-center justify-center">
        <img src={markUrl('burgee')} alt="burgee" width="140" height="140" />
      </div>
    );
  }
  return <div ref={host} className="h-[460px] w-full" />;
}
