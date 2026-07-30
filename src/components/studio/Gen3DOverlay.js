"use client";

import { useEffect, useRef } from "react";

let THREE = null;

async function loadThree() {
  if (THREE) return THREE;
  THREE = await import("three");
  return THREE;
}

/**
 * Three.js 3D looping animation displayed during generation.
 * Renders a TorusKnot with particle system and brand-colored lights.
 * Lazy-loads three.js on first use to avoid blocking initial render.
 */
export default function Gen3DOverlay({ active = false }) {
  const containerRef = useRef(null);
  const cleanupRef = useRef(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    if (!active) {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      return;
    }

    let cancelled = false;

    async function start() {
      if (!containerRef.current || typeof window === "undefined") return;

      try {
        const T = await loadThree();
        if (cancelled || !mountedRef.current) return;

        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;

        const scene = new T.Scene();
        const camera = new T.PerspectiveCamera(45, w / h, 0.1, 100);
        camera.position.z = 6;

        const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        containerRef.current.appendChild(renderer.domElement);

        const ambient = new T.AmbientLight(0x331122, 1.5);
        scene.add(ambient);
        const light1 = new T.PointLight(0xFF1B6B, 30, 15);
        light1.position.set(3, 2, 4);
        scene.add(light1);
        const light2 = new T.PointLight(0x7C3AED, 25, 12);
        light2.position.set(-3, -2, 2);
        scene.add(light2);

        const geom = new T.TorusKnotGeometry(1, 0.3, 128, 32);
        const mat = new T.MeshPhysicalMaterial({
          color: 0xFF1B6B, metalness: 0.1, roughness: 0.2,
          clearcoat: 0.3, clearcoatRoughness: 0.25,
          emissive: 0x330011, emissiveIntensity: 0.4,
        });
        const torus = new T.Mesh(geom, mat);
        scene.add(torus);

        const wireGeom = new T.TorusKnotGeometry(1.05, 0.08, 64, 16);
        const wireMat = new T.MeshBasicMaterial({
          color: 0x7C3AED, wireframe: true, transparent: true, opacity: 0.3,
        });
        const wireframe = new T.Mesh(wireGeom, wireMat);
        torus.add(wireframe);

        const pCount = 400;
        const positions = new Float32Array(pCount * 3);
        for (let i = 0; i < pCount; i++) {
          positions[i * 3] = (Math.random() - 0.5) * 8;
          positions[i * 3 + 1] = (Math.random() - 0.5) * 8;
          positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
        }
        const pGeom = new T.BufferGeometry();
        pGeom.setAttribute("position", new T.BufferAttribute(positions, 3));
        const pMat = new T.PointsMaterial({
          color: 0xFF1B6B, size: 0.02, transparent: true, opacity: 0.7,
          blending: T.AdditiveBlending, depthWrite: false,
        });
        const particles = new T.Points(pGeom, pMat);
        scene.add(particles);

        const clock = new T.Clock();
        let animActive = true;

        function animate() {
          if (!animActive) return;
          const t = clock.getElapsedTime();
          torus.rotation.x = t * 0.4;
          torus.rotation.y = t * 0.6;
          torus.rotation.z = t * 0.2;
          torus.scale.setScalar(1 + Math.sin(t * 2) * 0.05);
          particles.rotation.y = t * 0.1;
          particles.rotation.x = t * 0.05;
          renderer.render(scene, camera);
          requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);

        cleanupRef.current = () => {
          animActive = false;
        };
      } catch (err) {
        console.warn("Failed to initialize 3D scene:", err);
      }
    }

    start();

    return () => {
      cancelled = true;
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, [active]);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  if (!active) return null;

  return (
    <div
      className="studio__gen-canvas"
      ref={containerRef}
      role="img"
      aria-label="3D generation visualization"
    />
  );
}
