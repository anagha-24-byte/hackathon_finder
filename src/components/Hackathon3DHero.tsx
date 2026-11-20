import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

interface Hackathon3DHeroProps {
  totalDiscovered: number;
  matchingCount: number;
  savedCount: number;
  onSyncNow: () => void;
  onExploreDiscover: () => void;
  syncing: boolean;
}

// Pre-allocated math helpers outside render loop (zero GC)
const _targetVec = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const Hackathon3DHero: React.FC<Hackathon3DHeroProps> = ({
  totalDiscovered,
  matchingCount,
  savedCount,
  onSyncNow,
  onExploreDiscover,
  syncing,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const pointerRef = useRef({ x: 0, y: 0, dragging: false, dragRotY: 0, dragRotX: 0 });

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = container.clientWidth || 560;
    const height = container.clientHeight || 300;
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x4a0526, 0.045);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTex = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    scene.environment = envTex;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
    camera.position.set(0, 0.6, 7.6);

    // 3-Point Studio Lighting (Warm White Key + Blush/Deep Berry Hemisphere + Pink Rim)
    const hemiLight = new THREE.HemisphereLight(0xffe4ef, 0x3b031d, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff5f8, 2.2);
    keyLight.position.set(4.5, 6.5, 5.5);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0xff4d94, 4.5, 22, 1.8);
    rimLight.position.set(-4.5, 2.2, -3.5);
    scene.add(rimLight);

    const fillLight = new THREE.PointLight(0xffffff, 2.4, 18, 1.5);
    fillLight.position.set(3.5, -2.5, 4.0);
    scene.add(fillLight);

    // Composite 8-Part 3D Procedural Sculpture: "HackMate Discovery Nexus"
    const nexusGroup = new THREE.Group();
    scene.add(nexusGroup);

    // Materials with calibrated roughness/metalness contrast
    const darkPinkCoreMat = new THREE.MeshPhysicalMaterial({
      color: 0x9d174d,
      metalness: 0.72,
      roughness: 0.22,
      clearcoat: 1.0,
      clearcoatRoughness: 0.08,
    });

    const pearlWhiteMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0.12,
      roughness: 0.18,
      clearcoat: 0.9,
      clearcoatRoughness: 0.1,
    });

    const brightPinkAccentMat = new THREE.MeshStandardMaterial({
      color: 0xf43f8e,
      metalness: 0.65,
      roughness: 0.26,
      emissive: 0x5c0a2e,
      emissiveIntensity: 0.35,
    });

    const roseMetalMat = new THREE.MeshPhysicalMaterial({
      color: 0xf9a8d4,
      metalness: 0.9,
      roughness: 0.16,
      clearcoat: 0.6,
    });

    // Part 1: Primary Core Crystal (Octahedron)
    const coreGeo = new THREE.OctahedronGeometry(1.12, 0);
    const coreMesh = new THREE.Mesh(coreGeo, darkPinkCoreMat);
    coreMesh.castShadow = !isSoftwareGl;
    nexusGroup.add(coreMesh);

    // Part 2: Outer Faceted Wireframe Cage
    const cageGeo = new THREE.IcosahedronGeometry(1.48, 0);
    const cageEdges = new THREE.EdgesGeometry(cageGeo);
    const cageMat = new THREE.LineBasicMaterial({
      color: 0xfbcfe8,
      transparent: true,
      opacity: 0.55,
    });
    const cageLines = new THREE.LineSegments(cageEdges, cageMat);
    nexusGroup.add(cageLines);

    // Part 3 & 4: Twin Gimbal Rings (White Pearl & Brushed Rose Metal)
    const ringGeo1 = new THREE.TorusGeometry(1.88, 0.055, 20, 72);
    const ring1 = new THREE.Mesh(ringGeo1, pearlWhiteMat);
    ring1.rotation.x = Math.PI * 0.34;
    ring1.rotation.y = Math.PI * 0.14;
    nexusGroup.add(ring1);

    const ringGeo2 = new THREE.TorusGeometry(2.35, 0.04, 18, 84);
    const ring2 = new THREE.Mesh(ringGeo2, roseMetalMat);
    ring2.rotation.x = -Math.PI * 0.28;
    ring2.rotation.z = Math.PI * 0.22;
    nexusGroup.add(ring2);

    // Part 5: Equator Collar Ring
    const collarGeo = new THREE.TorusGeometry(1.32, 0.035, 16, 60);
    const collar = new THREE.Mesh(collarGeo, brightPinkAccentMat);
    collar.rotation.x = Math.PI / 2;
    nexusGroup.add(collar);

    // Parts 6–11: 6 Orbiting Platform Discovery Nodes (Devpost, Unstop, Devfolio, HackerEarth, MLH, Hack2Skill)
    const nodeOrbitGroup = new THREE.Group();
    nexusGroup.add(nodeOrbitGroup);
    const nodeGeo = new THREE.DodecahedronGeometry(0.19, 0);
    const orbitNodes: THREE.Mesh[] = [];
    const nodeMaterials = [pearlWhiteMat, brightPinkAccentMat, roseMetalMat];

    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const radius = 2.35;
      const node = new THREE.Mesh(nodeGeo, nodeMaterials[i % nodeMaterials.length]);
      node.position.set(
        Math.cos(angle) * radius,
        Math.sin(angle * 2) * 0.45,
        Math.sin(angle) * radius
      );
      nodeOrbitGroup.add(node);
      orbitNodes.push(node);
    }

    // Contact Grounding Shadow Disc beneath Sculpture
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
      grad.addColorStop(0, 'rgba(26, 2, 14, 0.55)');
      grad.addColorStop(1, 'rgba(26, 2, 14, 0.0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    shadowTex.colorSpace = THREE.SRGBColorSpace;
    const shadowPlaneGeo = new THREE.PlaneGeometry(5.2, 5.2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.75,
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -2.25;
    scene.add(shadowPlane);

    // Subtle floating instanced ambient particles (zero per-frame allocations)
    const particleCount = 36;
    const pGeo = new THREE.OctahedronGeometry(0.045, 0);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xfce7f3, transparent: true, opacity: 0.6 });
    const instancedParticles = new THREE.InstancedMesh(pGeo, pMat, particleCount);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < particleCount; i++) {
      const theta = (i / particleCount) * Math.PI * 2;
      const r = 3.1 + (i % 5) * 0.45;
      dummy.position.set(
        Math.cos(theta) * r,
        ((i % 7) - 3) * 0.55,
        Math.sin(theta) * r - 0.8
      );
      const s = 0.7 + (i % 4) * 0.25;
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      instancedParticles.setMatrixAt(i, dummy.matrix);
    }
    instancedParticles.instanceMatrix.needsUpdate = true;
    instancedParticles.computeBoundingSphere();
    scene.add(instancedParticles);

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setWebglFailed(true);
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 560;
      const h = container.clientHeight || 300;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let frameId = 0;
    let disposed = false;
    const clock = new THREE.Clock();

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      if (!sync) {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      if (!pausedRef.current && !prefersReduced) {
        coreMesh.rotation.y += dt * 0.45;
        coreMesh.rotation.x = Math.sin(elapsed * 0.6) * 0.18;
        cageLines.rotation.y -= dt * 0.28;
        cageLines.rotation.z += dt * 0.14;
        ring1.rotation.z += dt * 0.35;
        ring2.rotation.y -= dt * 0.25;
        nodeOrbitGroup.rotation.y += dt * 0.4;
        instancedParticles.rotation.y += dt * 0.06;

        for (let i = 0; i < orbitNodes.length; i++) {
          orbitNodes[i].rotation.x += dt * 1.1;
          orbitNodes[i].rotation.y += dt * 0.9;
        }
      }

      const targetRotY = pointerRef.current.dragRotY + pointerRef.current.x * 0.35;
      const targetRotX = pointerRef.current.dragRotX + pointerRef.current.y * 0.22;
      nexusGroup.rotation.y = THREE.MathUtils.damp(nexusGroup.rotation.y, targetRotY, 5, dt);
      nexusGroup.rotation.x = THREE.MathUtils.damp(nexusGroup.rotation.x, targetRotX, 5, dt);

      _targetVec.set(0, 0, 0);
      camera.lookAt(_targetVec);
      renderer.render(scene, camera);

      if (prefersReduced) return;
      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      coreGeo.dispose();
      cageGeo.dispose();
      cageEdges.dispose();
      cageMat.dispose();
      ringGeo1.dispose();
      ringGeo2.dispose();
      collarGeo.dispose();
      nodeGeo.dispose();
      shadowPlaneGeo.dispose();
      shadowPlaneMat.dispose();
      shadowTex.dispose();
      pGeo.dispose();
      pMat.dispose();
      darkPinkCoreMat.dispose();
      pearlWhiteMat.dispose();
      brightPinkAccentMat.dispose();
      roseMetalMat.dispose();
      envTex.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointerRef.current.x = nx;
    pointerRef.current.y = ny;
    if (pointerRef.current.dragging) {
      pointerRef.current.dragRotY += e.movementX * 0.01;
      pointerRef.current.dragRotX = THREE.MathUtils.clamp(
        pointerRef.current.dragRotX + e.movementY * 0.01,
        -0.7,
        0.7
      );
    }
  };

  return (
    <section
      className="surface-3d-dark rounded-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 items-stretch"
      aria-label="3D Hackathon Discovery Nexus"
    >
      {/* Left: Crisp Semantic Copy & Actions on Dark Pink Surface */}
      <div className="lg:col-span-6 p-6 sm:p-8 flex flex-col justify-between gap-6">
        <div className="space-y-3">
          <p className="text-xs font-medium text-pink-200 tracking-wide">
            Autonomous Multi-Platform Discovery
          </p>
          <h2 className="text-2xl sm:text-3xl font-bold text-white leading-tight">
            Discover, Match, and Track Live Hackathons in 3D
          </h2>
          <p className="text-sm text-pink-100/85 max-w-xl leading-relaxed">
            Real-time aggregation across Devpost, Unstop, Devfolio, HackerEarth, MLH, and
            Hack2Skill — paired with Gemini AI compatibility scoring and automated deadline
            tracking.
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-pink-300/20 text-white">
            <div>
              <span className="text-xs text-pink-200/80 block">Live Hackathons</span>
              <span className="font-mono tabular-nums text-xl font-semibold">
                {totalDiscovered}
              </span>
            </div>
            <div>
              <span className="text-xs text-pink-200/80 block">Profile Matches</span>
              <span className="font-mono tabular-nums text-xl font-semibold text-pink-200">
                {matchingCount}
              </span>
            </div>
            <div>
              <span className="text-xs text-pink-200/80 block">Saved Tracked</span>
              <span className="font-mono tabular-nums text-xl font-semibold">
                {savedCount}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onExploreDiscover}
              className="px-4 py-2.5 text-xs font-semibold text-[#6b0f3b] bg-white hover:bg-pink-50 rounded-lg transition-colors whitespace-nowrap shrink-0 shadow-md"
            >
              Explore All Hackathons
            </button>
            <button
              type="button"
              onClick={onSyncNow}
              disabled={syncing}
              className="px-4 py-2.5 text-xs font-semibold text-white bg-pink-600 hover:bg-pink-500 border border-pink-300/30 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {syncing ? 'Syncing Platforms...' : 'Sync 6 Platforms'}
            </button>
          </div>
        </div>
      </div>

      {/* Right: Interactive Three.js 3D Viewport */}
      <div
        className="lg:col-span-6 relative min-h-[260px] sm:min-h-[300px] lg:min-h-[320px] select-none cursor-grab active:cursor-grabbing"
        onPointerMove={handlePointerMove}
        onPointerDown={() => {
          pointerRef.current.dragging = true;
        }}
        onPointerUp={() => {
          pointerRef.current.dragging = false;
        }}
        onPointerLeave={() => {
          pointerRef.current.dragging = false;
          pointerRef.current.x = 0;
          pointerRef.current.y = 0;
        }}
      >
        <div ref={mountRef} className="w-full h-full min-h-[260px]" />

        {webglFailed && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-[#5a0a30]">
            <p className="text-xs text-pink-100">
              3D WebGL preview paused on this device. All discovery tools remain active.
            </p>
          </div>
        )}

        {/* Solid/rgba compact bottom-right control (no backdrop-blur over WebGL) */}
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPaused((p) => !p)}
            className="px-2.5 py-1 text-[11px] font-medium text-pink-100 bg-[#3a041e]/90 hover:bg-[#52082b] border border-pink-300/25 rounded-md transition-colors"
          >
            {paused ? 'Resume 3D' : 'Pause 3D'}
          </button>
        </div>
      </div>
    </section>
  );
};
