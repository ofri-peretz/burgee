'use client';

/**
 * A contact sheet for the low-poly caique.
 *
 * The same method the 2D mark lab uses, in three dimensions: one row per
 * parameter, one bird per value, every other number held at its current setting.
 * Choosing between twelve birds at once is a different act from judging one bird
 * against an idea of a bird, and it is the only loop here that has converged.
 *
 * One scene and one renderer, not twelve canvases: a browser gives out a limited
 * number of WebGL contexts and spends them badly on a grid.
 */
import { useEffect, useRef } from 'react';
import {
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  WebGLRenderer,
} from 'three';

import { BIRD, caique, type BirdShape } from './caique-3d';

const PALETTE = { sky: 0xe7ece9, bounce: 0x12201b, white: 0xffffff } as const;

/** What the sheet asks. One row per entry, one bird per value. */
const SWEEPS = [
  { key: 'headR', values: [0.54, 0.6, 0.66, 0.72] },
  { key: 'bodyScale', values: [0.9, 1, 1.12, 1.24], axis: 1 },
  { key: 'beakTilt', values: [1.2, 1.32, 1.42, 1.55] },
  { key: 'tailH', values: [1.3, 1.6, 1.9, 2.2] },
] as const;

const GRID = { gap: 3.2, rowGap: 3.2 } as const;
const STAGE = { cameraX: 1.2, cameraY: 0.6, cameraZ: 24, fov: 32, floorDrop: 1.5 } as const;
const LIGHT = { hemisphere: 2.2, key: 2.3, at: [-4, 7, 6], frustum: 12, far: 60, shadow: 0.14 } as const;
const MAX_PIXEL_RATIO = 2;
const NEAR = 0.1;
const HALF = 2;

/** One bird with a single number changed; `axis` picks a component of a triple. */
function variant(key: string, value: number, axis?: number): BirdShape {
  if (axis === undefined) return { ...BIRD, [key]: value };
  const triple = [...(BIRD[key as keyof BirdShape] as readonly number[])];
  triple[axis] = value;
  return { ...BIRD, [key]: triple };
}

function lightScene(scene: Scene): void {
  scene.add(new HemisphereLight(PALETTE.sky, PALETTE.bounce, LIGHT.hemisphere));
  const key = new DirectionalLight(PALETTE.white, LIGHT.key);
  const [kx, ky, kz] = LIGHT.at;
  key.position.set(kx, ky, kz);
  key.castShadow = true;
  key.shadow.camera.top = LIGHT.frustum;
  key.shadow.camera.bottom = -LIGHT.frustum;
  key.shadow.camera.left = -LIGHT.frustum;
  key.shadow.camera.right = LIGHT.frustum;
  key.shadow.camera.far = LIGHT.far;
  scene.add(key);

  const floor = new Mesh(
    new PlaneGeometry(LIGHT.far, LIGHT.far),
    new ShadowMaterial({ opacity: LIGHT.shadow }),
  );
  floor.rotation.x = -Math.PI / HALF;
  floor.position.y = -STAGE.floorDrop;
  floor.receiveShadow = true;
  scene.add(floor);
}

function noTeardown(): void {
  return undefined;
}

function sheet(mount: HTMLElement): () => void {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ antialias: true });
  } catch {
    return noTeardown;
  }

  const scene = new Scene();
  scene.background = new Color(PALETTE.sky);
  lightScene(scene);

  const grid = new Group();
  SWEEPS.forEach((sweep, row) => {
    sweep.values.forEach((value, column) => {
      const axis = 'axis' in sweep ? sweep.axis : undefined;
      const bird = caique(variant(sweep.key, value, axis));
      bird.position.x = (column - (sweep.values.length - 1) / HALF) * GRID.gap;
      bird.position.y = ((SWEEPS.length - 1) / HALF - row) * GRID.rowGap;
      grid.add(bird);
    });
  });
  scene.add(grid);

  const camera = new PerspectiveCamera(STAGE.fov, 1, NEAR, LIGHT.far);
  camera.position.set(STAGE.cameraX, STAGE.cameraY, STAGE.cameraZ);
  camera.lookAt(0, 0, 0);

  renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFSoftShadowMap;
  mount.append(renderer.domElement);

  const resize = (): void => {
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    camera.aspect = mount.clientWidth / Math.max(mount.clientHeight, 1);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(mount);

  return () => {
    observer.disconnect();
    renderer.dispose();
    renderer.domElement.remove();
  };
}

/** The sheet: four parameters, four values each, still — nothing to chase. */
export function CaiqueSheet() {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = host.current;
    if (mount === null) return;
    return sheet(mount);
  }, []);
  return <div ref={host} className="h-screen w-full" />;
}
