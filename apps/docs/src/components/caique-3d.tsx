'use client';

/**
 * The caique, as a low-poly solid.
 *
 * Built from primitives at their lowest useful detail and flat-shaded, so every
 * facet catches the light separately — the faceted look is the geometry, not a
 * shader trick, which is why it survives being turned and lit from anywhere.
 *
 * Procedural rather than a downloaded mesh on purpose: a brand mark cannot rest
 * on a model whose licence is "found on the internet", and every dimension here
 * is a number someone can argue with.
 *
 * The colours are the bird's own — black cap, apricot cheek, white breast, green
 * wing — which happen to be the Interlace palette already.
 */
import { useEffect, useRef } from 'react';
import {
  Clock,
  Color,
  ConeGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SphereGeometry,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
} from 'three';

const PALETTE = {
  ink: 0x0a0a0a,
  rock: 0xf4794a,
  juniper: 0x0d9460,
  paper: 0xefe9dd,
  sky: 0xe7ece9,
  bounce: 0x12201b,
} as const;

/** Flat shading everywhere: the facets are the point. */
const FINISH = { roughness: 0.55, metalness: 0.05 } as const;

/** Detail 0 is a bare icosahedron; 1 is 80 faces, which still reads as facets. */
const DETAIL = { body: 1, head: 1, cheek: 0, wing: 0 } as const;

/**
 * The bird faces +x, so the camera sees the profile the flat mark is drawn in:
 * beak forward, tail back, wings on the z sides. Every position is in body radii.
 */
export const BIRD = {
  bodyR: 1,
  bodyScale: [0.88, 1, 0.76],
  headR: 0.64,
  headAt: [0.48, 1.08, 0],
  capScale: [1, 0.95, 0.95],
  cheekR: 0.38,
  cheekAt: [0.8, 0.68, 0],
  breastR: 0.66,
  breastAt: [0.5, -0.22, 0],
  breastScale: [0.78, 1.1, 0.78],
  mantleR: 0.86,
  mantleAt: [-0.22, 0.24, 0],
  mantleScale: [0.9, 0.86, 0.86],
  wingR: 0.74,
  wingAt: [-0.06, 0.02, 0.5],
  wingScale: [0.92, 0.98, 0.26],
  wingTilt: 0.16,
  beakR: 0.24,
  beakH: 0.66,
  beakAt: [1.14, 0.98, 0],
  beakTilt: 1.42,
  tailR: 0.52,
  tailH: 1.9,
  tailAt: [-1.2, -0.42, 0],
  tailScale: [1, 1, 0.3],
  tailTilt: 2.1,
  eyeR: 0.1,
  eyeAt: [0.8, 1.18, 0.28],
  standDrop: 1.15,
} as const;

const STAGE = {
  cameraX: 0.8,
  cameraY: 1.35,
  cameraZ: 5.4,
  fov: 34,
  floorDrop: 1.4,
  spin: 0.3,
  tilt: 0.42,
} as const;

const LIGHT = {
  hemisphere: 2.2,
  key: 2.4,
  keyAt: [-3, 5, 4],
  shadowMap: 1024,
  frustum: 5,
  far: 40,
  white: 0xffffff,
  shadowOpacity: 0.16,
} as const;

/** Face counts: a beak is a five-sided cone, a tail a four-sided one. */
const FACES = { beak: 5, tail: 4, eye: 8, eyeRings: 6 } as const;
/** The camera's near plane, and the negatives the linter will not take inline. */
const NEAR = 0.1;
const MAX_PIXEL_RATIO = 2;
/** The camera looks at the bird's shoulder, not the floor under it. */
const LOOK_AT_Y = 0.25;
const HALF = 2;

type Triple = readonly [number, number, number];

function surface(color: number): Material {
  return new MeshStandardMaterial({ color, flatShading: true, ...FINISH });
}

interface Part {
  geometry: BufferGeometry;
  color: number;
  at: Triple;
  scale?: Triple;
  tilt?: number;
}

function build(part: Part): Mesh {
  const mesh = new Mesh(part.geometry, surface(part.color));
  mesh.position.set(...part.at);
  if (part.scale !== undefined) mesh.scale.set(...part.scale);
  // Tilt is around z: the bird faces +x, so its beak and tail swing in that plane.
  if (part.tilt !== undefined) mesh.rotation.z = part.tilt;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** One wing, mirrored by the sign of `side`. */
function wing(side: number, BIRD: BirdShape): Mesh {
  const [x, y, z] = BIRD.wingAt;
  const mesh = build({
    geometry: new IcosahedronGeometry(BIRD.wingR, DETAIL.wing),
    color: PALETTE.juniper,
    at: [x, y, z * side],
    scale: BIRD.wingScale,
  });
  mesh.rotation.x = -BIRD.wingTilt * side;
  return mesh;
}

/** Every number the bird is made of, so a sheet can vary one at a time. */
export type BirdShape = typeof BIRD;

/** The bird: cap, cheek, breast, mantle, wings, beak, tail, eye. */
export function caique(shape: BirdShape = BIRD): Group {
  const BIRD = shape;
  const bird = new Group();
  bird.add(
    build({
      geometry: new IcosahedronGeometry(BIRD.bodyR, DETAIL.body),
      color: PALETTE.juniper,
      at: [0, 0, 0],
      scale: BIRD.bodyScale,
    }),
    build({
      geometry: new IcosahedronGeometry(BIRD.breastR, DETAIL.body),
      color: PALETTE.paper,
      at: BIRD.breastAt,
      scale: BIRD.breastScale,
    }),
    build({
      geometry: new IcosahedronGeometry(BIRD.mantleR, DETAIL.body),
      color: PALETTE.juniper,
      at: BIRD.mantleAt,
      scale: BIRD.mantleScale,
    }),
    build({
      geometry: new IcosahedronGeometry(BIRD.headR, DETAIL.head),
      color: PALETTE.ink,
      at: BIRD.headAt,
      scale: BIRD.capScale,
    }),
    build({
      geometry: new IcosahedronGeometry(BIRD.cheekR, DETAIL.cheek),
      color: PALETTE.rock,
      at: BIRD.cheekAt,
    }),
    build({
      geometry: new ConeGeometry(BIRD.beakR, BIRD.beakH, FACES.beak),
      color: PALETTE.ink,
      at: BIRD.beakAt,
      tilt: -BIRD.beakTilt,
    }),
    build({
      geometry: new ConeGeometry(BIRD.tailR, BIRD.tailH, FACES.tail),
      color: PALETTE.juniper,
      at: BIRD.tailAt,
      scale: BIRD.tailScale,
      tilt: BIRD.tailTilt,
    }),
    wing(1, BIRD),
    wing(-1, BIRD),
  );
  const eye = new Mesh(new SphereGeometry(BIRD.eyeR, FACES.eye, FACES.eyeRings), surface(PALETTE.paper));
  const [ex, ey, ez] = BIRD.eyeAt;
  eye.position.set(ex, ey, ez);
  const other = eye.clone();
  other.position.set(ex, ey, -ez);
  bird.add(eye, other);
  bird.position.y = -BIRD.standDrop / HALF;
  return bird;
}

function lightScene(scene: Scene): void {
  scene.add(new HemisphereLight(PALETTE.sky, PALETTE.bounce, LIGHT.hemisphere));
  const key = new DirectionalLight(LIGHT.white, LIGHT.key);
  key.position.set(...LIGHT.keyAt);
  key.castShadow = true;
  key.shadow.mapSize.set(LIGHT.shadowMap, LIGHT.shadowMap);
  key.shadow.camera.top = LIGHT.frustum;
  key.shadow.camera.bottom = -LIGHT.frustum;
  key.shadow.camera.left = -LIGHT.frustum;
  key.shadow.camera.right = LIGHT.frustum;
  key.shadow.camera.far = LIGHT.far;
  scene.add(key);

  const floor = new Mesh(
    new PlaneGeometry(LIGHT.far, LIGHT.far),
    new ShadowMaterial({ opacity: LIGHT.shadowOpacity }),
  );
  floor.rotation.x = -Math.PI / HALF;
  floor.position.y = -STAGE.floorDrop;
  floor.receiveShadow = true;
  scene.add(floor);
}

function noTeardown(): void {
  return undefined;
}

function stage(mount: HTMLElement): () => void {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch {
    return noTeardown;
  }

  const scene = new Scene();
  scene.background = new Color(PALETTE.sky);
  lightScene(scene);

  const camera = new PerspectiveCamera(STAGE.fov, 1, NEAR, LIGHT.far);
  camera.position.set(STAGE.cameraX, STAGE.cameraY, STAGE.cameraZ);
  camera.lookAt(0, LOOK_AT_Y, 0);

  const bird = caique();
  scene.add(bird);

  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  mount.append(renderer.domElement);

  const resize = (): void => {
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(mount);

  const clock = new Clock();
  let frame = 0;
  const tick = (): void => {
    frame = requestAnimationFrame(tick);
    bird.rotation.y = Math.sin(clock.getElapsedTime() * STAGE.spin) * STAGE.tilt;
    renderer.render(scene, camera);
  };
  tick();

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

/** The low-poly caique, turning slowly. */
export function Caique3D() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = host.current;
    if (mount === null) return;
    return stage(mount);
  }, []);
  return <div ref={host} className="h-[520px] w-full" />;
}
