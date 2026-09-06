"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import type { AtlasManifest } from "@/lib/anatomy/types";
import { ATLAS_GEOMETRY_BUDGET, fitsAtlasMemory } from "@/lib/anatomy/budget";
import {
  cameraAngle,
  cameraEase,
  fitCamera,
  focusBounds,
  shortestAngle,
} from "@/lib/anatomy/camera";
import { fetchAtlasChunk } from "@/lib/anatomy/validation";
export interface RenderObservation {
  timestamp: number;
  durationMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}
export interface CanvasProps {
  onRender?: (value: RenderObservation) => void;
  manifest: AtlasManifest;
  systems: string[];
  selectedElements: string[];
  focusElements?: string[];
  cameraGroup?: string;
  cameraRequest?: number;
  elementColors?: Record<string, string>;
  hiddenElements: string[];
  isolated: boolean;
  view: "front" | "back" | "side";
  reset: number;
  zoom: number;
  interactive: boolean;
  onPick: (id: string, position?: { x: number; y: number }) => void;
  onError: (reason: string) => void;
  onProgress: (loaded: number, total: number) => void;
  label: string;
}
interface Runtime {
  refresh: () => void;
  setView: () => void;
  load: () => void;
  controls: OrbitControls;
}
export default function AtlasCanvas(props: CanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const runtime = useRef<Runtime | null>(null);
  useEffect(() => {
    latest.current = props;
    runtime.current?.refresh();
    runtime.current?.load();
    runtime.current?.setView();
  }, [props]);
  useEffect(() => {
    const container = host.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      latest.current.onError("webgl");
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = false;
    controls.enablePan = true;
    controls.minDistance = 0.3;
    controls.maxDistance = 5;
    controls.enableZoom = true;
    controls.enabled = latest.current.interactive;
    renderer.domElement.style.touchAction = latest.current.interactive
      ? "none"
      : "pan-y";
    scene.add(new THREE.HemisphereLight(0xffffff, 0x62646a, 2.3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(2, 3, 4);
    scene.add(light);
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const residentBytes = new Map<string, number>();
    const geometryBytes = (group: THREE.Object3D) => {
      let bytes = 0;
      const seen = new Set<THREE.BufferGeometry>();
      group.traverse((o) => {
        if (o instanceof THREE.Mesh && !seen.has(o.geometry)) {
          seen.add(o.geometry);
          for (const a of Object.values(o.geometry.attributes))
            bytes += (a as THREE.BufferAttribute).array.byteLength;
          bytes += o.geometry.index?.array.byteLength ?? 0;
        }
      });
      return bytes;
    };
    const loaded = new Map<string, THREE.Group>();
    const loading = new Set<string>();
    const failed = new Set<string>();
    const requests = new Map<string, AbortController>();
    const materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const highlight = new THREE.MeshStandardMaterial({
      color: 0xd4a853,
      roughness: 0.75,
      side: THREE.DoubleSide,
    });
    const muted = new THREE.MeshStandardMaterial({
      color: 0x727875,
      roughness: 0.85,
      side: THREE.DoubleSide,
    });
    const focusMaterials = new Map<string, THREE.MeshStandardMaterial>();
    const focusMaterial = (color: string) => {
      if (!focusMaterials.has(color))
        focusMaterials.set(
          color,
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.75,
            side: THREE.DoubleSide,
          }),
        );
      return focusMaterials.get(color)!;
    };
    let dead = false,
      frame = 0,
      lastView = "",
      lastFocus = "",
      lastReset = -1,
      lastZoom = 0,
      inViewport = true;
    const dispose = (obj: THREE.Object3D) => {
      const seen = new Set<THREE.Material>();
      obj.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const original = materials.get(o) ?? o.material;
          for (const m of Array.isArray(original) ? original : [original])
            if (m !== highlight && !seen.has(m)) {
              m.dispose();
              seen.add(m);
            }
          materials.delete(o);
        }
      });
    };
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    let transition: {
      start: number;
      from: THREE.Vector3;
      to: THREE.Vector3;
      radius: number;
      endRadius: number;
      theta: number;
      endTheta: number;
      phi: number;
      endPhi: number;
    } | null = null;
    const applyPose = (t: NonNullable<typeof transition>, progress: number) => {
      const eased = cameraEase(progress);
      controls.target.lerpVectors(t.from, t.to, eased);
      camera.position
        .copy(controls.target)
        .add(
          new THREE.Vector3().setFromSphericalCoords(
            THREE.MathUtils.lerp(t.radius, t.endRadius, eased),
            THREE.MathUtils.lerp(t.phi, t.endPhi, eased),
            THREE.MathUtils.lerp(t.theta, t.endTheta, eased),
          ),
        );
      controls.update();
    };
    const resumeTransition = () => {
      if (!transition) return;
      const offset = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target),
      );
      transition.from.copy(controls.target);
      transition.radius = offset.radius;
      transition.theta = offset.theta;
      transition.endTheta = shortestAngle(offset.theta, transition.endTheta);
      transition.phi = offset.phi;
      transition.start = performance.now();
    };
    const cancelTransition = () => {
      transition = null;
    };
    controls.addEventListener("start", cancelTransition);
    const reduceMotion = () => {
      if (reducedMotion.matches && transition) {
        applyPose(transition, 1);
        transition = null;
        draw();
      }
    };
    reducedMotion.addEventListener("change", reduceMotion);
    const draw = () => {
      if (dead || document.hidden || !inViewport || frame) return;
      frame = requestAnimationFrame((now) => {
        frame = 0;
        if (!dead && !document.hidden && inViewport) {
          if (transition) {
            const progress = Math.min(1, (now - transition.start) / 520);
            applyPose(transition, progress);
            if (progress === 1) transition = null;
          }
          const start = latest.current.onRender ? performance.now() : 0;
          renderer.render(scene, camera);
          latest.current.onRender?.({
            timestamp: performance.now(),
            durationMs: performance.now() - start,
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            geometries: renderer.info.memory.geometries,
            textures: renderer.info.memory.textures,
          });
          if (transition) draw();
        }
      });
    };
    const refresh = () => {
      const p = latest.current;
      const boneColor = getComputedStyle(container)
        .getPropertyValue("--anatomy-bone")
        .trim();
      const focus = new Set(p.focusElements ?? []);
      const selected = new Set(p.selectedElements),
        hidden = new Set(p.hiddenElements);
      for (const [id, g] of loaded) {
        const chunk = p.manifest.chunks.find((c) => c.id === id);
        g.visible = !!chunk && p.systems.includes(chunk.system);
        g.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const eid =
              o.userData.elementId ?? o.parent?.userData.elementId ?? o.name;
            const chosen = selected.has(eid);
            o.visible = !hidden.has(eid) && (!p.isolated || chosen);
            if (!materials.has(o)) materials.set(o, o.material);
            if (chunk?.system === "skeleton" && boneColor) {
              const original = materials.get(o)!;
              for (const material of Array.isArray(original)
                ? original
                : [original])
                if (material instanceof THREE.MeshStandardMaterial)
                  material.color.set(boneColor);
            }
            o.material = chosen
              ? highlight
              : p.elementColors?.[eid]
                ? focusMaterial(p.elementColors[eid])
                : focus.has(eid)
                  ? highlight
                  : p.focusElements !== undefined && chunk?.system === "muscles"
                    ? muted
                    : materials.get(o)!;
          }
        });
      }
      controls.enabled = p.interactive;
      renderer.domElement.style.touchAction = p.interactive ? "none" : "pan-y";
      draw();
    };
    const moveCamera = (
      target: THREE.Vector3,
      distance: number,
      theta: number,
      immediate = false,
      endPhi = Math.PI / 2,
    ) => {
      const offset = new THREE.Spherical().setFromVector3(
        camera.position.clone().sub(controls.target),
      );
      transition = {
        start: performance.now(),
        from: controls.target.clone(),
        to: target,
        radius: offset.radius || distance,
        endRadius: distance,
        theta: offset.theta,
        endTheta: shortestAngle(offset.theta, theta),
        phi: offset.phi || Math.PI / 2,
        endPhi,
      };
      if (immediate || reducedMotion.matches) {
        applyPose(transition, 1);
        transition = null;
      }
      draw();
    };
    const setView = () => {
      const p = latest.current;
      const ids = p.selectedElements.length
        ? p.selectedElements
        : (p.focusElements ?? []);
      const group = p.selectedElements.length ? undefined : p.cameraGroup;
      const focusKey = `${p.cameraRequest ?? 0}:${group ?? ""}:${ids.join(",")}`;
      const changedFocus = lastFocus !== focusKey;
      const changedReset = lastReset !== p.reset;
      const initial = lastReset === -1;
      if (changedFocus || changedReset || lastView !== p.view) {
        const bounds =
          changedReset && !initial
            ? p.manifest.bounds
            : (focusBounds(p.manifest, ids, group) ?? p.manifest.bounds);
        const pose = fitCamera(
          bounds,
          container.clientWidth / Math.max(1, container.clientHeight),
          cameraAngle(p.view, changedReset && !initial ? undefined : group),
        );
        moveCamera(
          new THREE.Vector3(...(pose.center as [number, number, number])),
          pose.distance,
          pose.theta,
          initial,
        );
        lastFocus = focusKey;
        lastReset = p.reset;
        lastView = p.view;
        lastZoom = p.zoom;
      } else if (p.zoom !== lastZoom) {
        const offset = new THREE.Spherical().setFromVector3(
          camera.position.clone().sub(controls.target),
        );
        const distance = THREE.MathUtils.clamp(
          (transition?.endRadius ?? offset.radius) *
            Math.pow(0.8, p.zoom - lastZoom),
          controls.minDistance,
          controls.maxDistance,
        );
        moveCamera(
          transition?.to.clone() ?? controls.target.clone(),
          distance,
          transition?.endTheta ?? offset.theta,
          false,
          transition?.endPhi ?? offset.phi,
        );
        lastZoom = p.zoom;
      }
    };
    const load = () => {
      if (dead || document.hidden || !inViewport) return;
      const p = latest.current;
      if (!fitsAtlasMemory(p.manifest, p.systems)) {
        p.onError("resident-budget");
        return;
      }
      const desired = p.manifest.chunks.filter((c) =>
        p.systems.includes(c.system),
      );
      for (const [id, g] of loaded)
        if (!desired.some((c) => c.id === id)) {
          scene.remove(g);
          dispose(g);
          loaded.delete(id);
          residentBytes.delete(id);
        }
      for (const [id, controller] of requests)
        if (!desired.some((c) => c.id === id)) controller.abort();
      p.onProgress(
        desired.filter((c) => loaded.has(c.id)).length,
        desired.length,
      );
      for (const chunk of desired) {
        if (requests.size >= 2) break;
        if (
          loaded.has(chunk.id) ||
          loading.has(chunk.id) ||
          failed.has(chunk.id)
        )
          continue;
        const controller = new AbortController();
        requests.set(chunk.id, controller);
        loading.add(chunk.id);
        void fetchAtlasChunk(
          chunk.url,
          chunk.bytes,
          chunk.sha256,
          controller.signal,
        )
          .then((data) => loader.parseAsync(data, ""))
          .then((gltf) => {
            if (dead || controller.signal.aborted) {
              dispose(gltf.scene);
              return;
            }
            const bytes = geometryBytes(gltf.scene);
            if (
              bytes + [...residentBytes.values()].reduce((n, b) => n + b, 0) >
              ATLAS_GEOMETRY_BUDGET
            ) {
              dispose(gltf.scene);
              throw Error("resident-budget");
            }
            residentBytes.set(chunk.id, bytes);
            loaded.set(chunk.id, gltf.scene);
            scene.add(gltf.scene);
            refresh();
          })
          .catch((error) => {
            if (!controller.signal.aborted && !dead) {
              failed.add(chunk.id);
              latest.current.onError(String(error));
            }
          })
          .finally(() => {
            requests.delete(chunk.id);
            loading.delete(chunk.id);
            if (!dead) {
              const total = desired.length;
              latest.current.onProgress(
                desired.filter((c) => loaded.has(c.id)).length,
                total,
              );
              load();
            }
          });
      }
    };
    const resize = () => {
      const w = container.clientWidth,
        h = container.clientHeight;
      if (w && h) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        draw();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    const intersection = new IntersectionObserver((entries) => {
      inViewport = entries[0]?.isIntersecting ?? false;
      if (inViewport) {
        resumeTransition();
        load();
        draw();
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
        for (const request of requests.values()) request.abort();
      }
    });
    intersection.observe(container);
    const ray = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down: [number, number] | null = null;
    const onDown = (e: PointerEvent) => {
      down = [e.clientX, e.clientY];
    };
    const onUp = (e: PointerEvent) => {
      if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6)
        return;
      down = null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      ray.setFromCamera(pointer, camera);
      const hit = ray.intersectObjects([...loaded.values()], true).find((h) => {
        let o: THREE.Object3D | null = h.object;
        while (o) {
          if (!o.visible) return false;
          o = o.parent;
        }
        return true;
      });
      if (hit) {
        const id =
          hit.object.userData.elementId ??
          hit.object.parent?.userData.elementId ??
          hit.object.name;
        latest.current.onPick(id, {
          x: (e.clientX - rect.left) / rect.width,
          y: (e.clientY - rect.top) / rect.height,
        });
      }
    };
    const lost = (e: Event) => {
      e.preventDefault();
      latest.current.onError("context-lost");
    };
    const visibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
        for (const c of requests.values()) c.abort();
      } else {
        resumeTransition();
        loading.clear();
        load();
        draw();
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", visibility);
    const themeObserver = new MutationObserver(refresh);
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    controls.addEventListener("change", draw);
    runtime.current = { refresh, setView, load, controls };
    setView();
    resize();
    load();
    return () => {
      dead = true;
      runtime.current = null;
      cancelAnimationFrame(frame);
      for (const c of requests.values()) c.abort();
      observer.disconnect();
      themeObserver.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      cancelTransition();
      reducedMotion.removeEventListener("change", reduceMotion);
      controls.removeEventListener("start", cancelTransition);
      controls.dispose();
      for (const g of loaded.values()) dispose(g);
      highlight.dispose();
      muted.dispose();
      for (const material of focusMaterials.values()) material.dispose();
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [props.manifest]);
  return (
    <div
      ref={host}
      role="img"
      aria-label={props.label}
      className="anatomy-canvas"
      style={{ touchAction: props.interactive ? "none" : "pan-y" }}
    />
  );
}
