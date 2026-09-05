"use client";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "meshoptimizer";
import type { AtlasManifest } from "@/lib/anatomy/types";
import { fetchAtlasChunk } from "@/lib/anatomy/validation";
export interface CanvasProps {
  manifest: AtlasManifest;
  systems: string[];
  selectedElements: string[];
  hiddenElements: string[];
  isolated: boolean;
  view: "front" | "back" | "side";
  reset: number;
  zoom: number;
  interactive: boolean;
  onPick: (id: string) => void;
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
    const box = new THREE.Box3(
      new THREE.Vector3(
        ...(props.manifest.bounds[0] as [number, number, number]),
      ),
      new THREE.Vector3(
        ...(props.manifest.bounds[1] as [number, number, number]),
      ),
    );
    const center = box.getCenter(new THREE.Vector3());
    const height = box.getSize(new THREE.Vector3()).y;
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
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
    let dead = false,
      frame = 0,
      lastView = "",
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
    const draw = () => {
      if (dead || document.hidden || !inViewport || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!dead && !document.hidden && inViewport)
          renderer.render(scene, camera);
      });
    };
    const refresh = () => {
      const p = latest.current;
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
            o.material = chosen ? highlight : materials.get(o)!;
          }
        });
      }
      controls.enabled = p.interactive;
      renderer.domElement.style.touchAction = p.interactive ? "none" : "pan-y";
      draw();
    };
    const setView = () => {
      const p = latest.current;
      if (p.zoom !== lastZoom) {
        const offset = camera.position.clone().sub(controls.target);
        offset.setLength(
          THREE.MathUtils.clamp(
            offset.length() * Math.pow(0.8, p.zoom - lastZoom),
            controls.minDistance,
            controls.maxDistance,
          ),
        );
        camera.position.copy(controls.target).add(offset);
        lastZoom = p.zoom;
        controls.update();
        draw();
      }
      if (lastView === p.view && lastReset === p.reset) return;
      lastView = p.view;
      lastReset = p.reset;
      const distance =
        (height / (2 * Math.tan(THREE.MathUtils.degToRad(16)))) * 1.15;
      controls.target.copy(center);
      camera.position
        .copy(center)
        .add(
          p.view === "side"
            ? new THREE.Vector3(distance, 0, 0)
            : new THREE.Vector3(0, 0, p.view === "back" ? -distance : distance),
        );
      controls.update();
      draw();
    };
    const load = () => {
      if (dead || document.hidden || !inViewport) return;
      const p = latest.current;
      const desired = p.manifest.chunks.filter((c) =>
        p.systems.includes(c.system),
      );
      for (const [id, g] of loaded)
        if (!desired.some((c) => c.id === id)) {
          scene.remove(g);
          dispose(g);
          loaded.delete(id);
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
        latest.current.onPick(id);
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
        loading.clear();
        load();
        draw();
      }
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    document.addEventListener("visibilitychange", visibility);
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
      intersection.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      controls.dispose();
      for (const g of loaded.values()) dispose(g);
      highlight.dispose();
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
