"use client";

import { useEffect, useRef } from "react";

export default function AnimatedLiquidBackground(): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (wrapper === null) {
      return;
    }

    let rafId = 0;
    let targetX = 50;
    let targetY = 50;
    let currentX = 50;
    let currentY = 50;

    const updateTarget = (event: MouseEvent): void => {
      targetX = (event.clientX / window.innerWidth) * 100;
      targetY = (event.clientY / window.innerHeight) * 100;
    };

    const tick = (): void => {
      currentX += (targetX - currentX) * 0.04;
      currentY += (targetY - currentY) * 0.04;

      wrapper.style.setProperty("--cursor-x", `${currentX}%`);
      wrapper.style.setProperty("--cursor-y", `${currentY}%`);

      rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener("mousemove", updateTarget, { passive: true });
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener("mousemove", updateTarget);
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      className="liquid-stage pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_20%,rgba(56,189,248,0.2),transparent_40%),radial-gradient(circle_at_78%_24%,rgba(34,197,94,0.13),transparent_35%),radial-gradient(circle_at_75%_78%,rgba(99,102,241,0.15),transparent_40%),linear-gradient(180deg,#020617,#060b18)]" />

      <div className="liquid-blob liquid-blob-a" />
      <div className="liquid-blob liquid-blob-b" />
      <div className="liquid-blob liquid-blob-c" />
      <div className="liquid-blob-d" />
      <div className="liquid-cursor-a" />
      <div className="liquid-cursor-b" />
      <div className="liquid-noise" />
    </div>
  );
}
