"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

export default function ThreeJsBackground(): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120f17);

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    const shaderMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        uniform float time;
        uniform vec2 resolution;

        vec3 palette(float t) {
          vec3 a = vec3(0.5, 0.5, 0.5);
          vec3 b = vec3(0.5, 0.5, 0.5);
          vec3 c = vec3(2.0, 1.0, 0.0);
          vec3 d = vec3(0.5, 0.2, 0.25);
          return a + b * cos(6.28318 * (c * t + d));
        }

        float noise(vec2 p) {
          return sin(p.x * 10.0 + time * 0.5) * cos(p.y * 10.0 + time * 0.3) * 0.5 + 0.5;
        }

        void main() {
          vec2 uv = vUv;
          vec2 pos = uv * 2.0 - 1.0;
          
          float wave1 = sin(pos.y * 3.0 + time * 0.5 + pos.x * 2.0) * 0.5 + 0.5;
          float wave2 = cos(pos.y * 2.5 + time * 0.3 - pos.x * 1.5) * 0.5 + 0.5;
          float wave3 = sin(pos.x * 2.0 + time * 0.4 + pos.y * 1.5) * 0.5 + 0.5;
          
          float dist = length(pos);
          float radial = exp(-dist * dist * 0.5) * 0.8;
          
          float pattern = wave1 * wave2 * wave3 * 0.6 + radial * 0.4;
          
          float stripes = abs(sin((pos.y + time * 0.2) * 8.0)) * 0.5;
          pattern += stripes * 0.3;
          
          vec3 col1 = palette(wave1 * 0.5 + time * 0.1);
          vec3 col2 = palette(wave2 * 0.5 + time * 0.15);
          vec3 col3 = palette(wave3 * 0.5 + time * 0.08);
          
          vec3 col = mix(col1, col2, wave3) * pattern;
          col = mix(col, col3, 0.3);
          
          col = mix(col, vec3(0.67, 0.33, 0.98), 0.4);
          
          col *= (1.0 - dist * 0.3);
          
          gl_FragColor = vec4(col * 0.5, 1.0);
        }
      `,
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    const mesh = new THREE.Mesh(geometry, shaderMaterial);
    scene.add(mesh);

    const animate = () => {
      requestAnimationFrame(animate);
      shaderMaterial.uniforms.time.value += 0.016;
      renderer.render(scene, camera);
    };

    animate();

    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      shaderMaterial.uniforms.resolution.value.set(width, height);
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="fixed inset-0 -z-10 pointer-events-none" />;
}
