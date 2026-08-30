import { useEffect, useRef } from "react";
import ceoParticlesData from "./ceo_particles_data.json";

export function CEOHumanoidReactor({
  size = 380,
  isSpeaking = false,
  isListening = false,
  amplitude = 0,
  className = "",
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    let time = 0;

    // 4K Ultra-Crisp Canvas DPI Scaling
    const dpr = Math.max(window.devicePixelRatio || 1, 2.5);
    const width = size;
    const height = Math.round(size * 1.15);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // =========================================================================
    // 1. INITIALIZE EXACT CEO AI ICON PARTICLE CLOUD (9,500 POINTS)
    // =========================================================================
    const particles = ceoParticlesData.map((p, i) => {
      return {
        x: p.x,
        y: p.y,
        type: p.t,
        lum: p.l,
        phase: (i % 360) * 0.017,
        speed: 0.7 + (i % 10) * 0.08,
        driftX: (Math.random() - 0.5) * 0.6,
        driftY: (Math.random() - 0.5) * 0.6,
      };
    });

    // Ascending Quantum Ethereal Aura Dust (240 micro-particles)
    const DUST_COUNT = 240;
    const dust = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      dust.push({
        x: (Math.random() - 0.5) * width * 0.88 + width / 2,
        y: Math.random() * height * 0.95,
        size: 0.5 + Math.random() * 1.1,
        vx: (Math.random() - 0.5) * 0.28,
        vy: -0.35 - Math.random() * 0.65,
        alpha: Math.random() * 0.75 + 0.2,
        decay: 0.004 + Math.random() * 0.005,
      });
    }

    // =========================================================================
    // 2. 60 FPS 4K RENDER LOOP - AZUL REATOR & SOUND REACTIVITY ONLY
    // =========================================================================
    const render = () => {
      time += 0.022;
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height * 0.50;
      const scaleX = width * 0.44;
      const scaleY = height * 0.44;

      // Audio & Voice Dynamic Reactivity
      const reactBoost = isSpeaking
        ? 0.50 + amplitude * 0.9
        : isListening
        ? 0.28 + amplitude * 0.4
        : 0.06;

      // Natural executive breathing
      const breath = Math.sin(time * 0.85) * 2.8;
      const sonicPulse = Math.sin(time * 12.0) * (reactBoost * 3.5);

      // 1. Soft Ambient Volumetric Hologram Halo
      const bgHalo = ctx.createRadialGradient(
        centerX, centerY - height * 0.05, width * 0.12,
        centerX, centerY - height * 0.05, width * 0.56
      );
      bgHalo.addColorStop(0, "rgba(0, 240, 255, 0.14)");
      bgHalo.addColorStop(0.5, "rgba(14, 165, 233, 0.05)");
      bgHalo.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = bgHalo;
      ctx.fillRect(0, 0, width, height);

      // 2. Rising Quantum Dust (Micro-Aura)
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        d.y += d.vy;
        d.x += d.vx + Math.sin(time * 1.4 + d.y * 0.02) * 0.25;
        d.alpha -= d.decay;

        if (d.alpha <= 0 || d.y < 0) {
          const angle = Math.random() * Math.PI * 2;
          const rad = Math.random() * width * 0.38;
          d.x = centerX + Math.cos(angle) * rad;
          d.y = centerY + Math.sin(angle) * rad;
          d.alpha = Math.random() * 0.75 + 0.25;
        }

        ctx.fillStyle = `rgba(0, 240, 255, ${d.alpha * 0.8})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Render Exact CEO AI Icon Particles (Suit, Shirt, Tie, Cyber Face)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Voice Ripple Shockwaves emanating from throat/mouth
        const distFromCenter = Math.sqrt(p.x * p.x + (p.y + 0.1) * (p.y + 0.1));
        const soundWave = Math.sin(time * 6.0 - distFromCenter * 8.0) * (reactBoost * 2.2);

        // Micro-harmonics
        const microJitter = Math.sin(time * 2.5 * p.speed + p.phase) * (0.8 + reactBoost * 1.5);

        const px = centerX + p.x * scaleX + (p.x * soundWave * 0.04);
        const py = centerY + p.y * scaleY + breath * (1 - Math.abs(p.x) * 0.3) + soundWave * 0.8 + microJitter * 0.3;

        let color = "0, 240, 255"; // Pure Electric Cyan
        let alpha = 0.65;
        let pSize = 0.65;

        if (p.type === "circuit") {
          // Cybernetic Facial & Neck Circuitry (Hyper-glow Pulsing)
          const circuitWave = (Math.sin(time * 4.0 + p.y * 10.0 + p.phase) + 1.0) * 0.5;
          color = "224, 247, 255"; // Hot White-Cyan
          alpha = Math.min(1.0, 0.75 + circuitWave * 0.25 + reactBoost * 0.3);
          pSize = 0.95 + circuitWave * 0.35 + reactBoost * 0.3;
        } else if (p.type === "face" || p.type === "face_fill") {
          // Sleek Robotic Face Shell
          const faceGlow = 0.55 + p.lum * 0.40;
          color = p.lum > 0.75 ? "224, 247, 255" : "0, 240, 255";
          alpha = Math.min(0.95, faceGlow + reactBoost * 0.25);
          pSize = p.type === "face" ? 0.75 : 0.60;
        } else if (p.type === "collar" || p.type === "collar_fill") {
          // Crisp Dress Shirt Collar
          color = "186, 230, 253"; // Bright Ice Blue / White
          alpha = 0.75 + p.lum * 0.20 + reactBoost * 0.15;
          pSize = 0.70;
        } else if (p.type === "tie" || p.type === "tie_fill") {
          // Silk Necktie (Rich Blue Tone)
          color = "0, 210, 255";
          alpha = 0.58 + p.lum * 0.35;
          pSize = p.type === "tie" ? 0.75 : 0.60;
        } else if (p.type === "suit" || p.type === "suit_fill") {
          // Tailored Suit Jacket & Lapels (Deep Cobalt / Cyber Blue)
          color = p.lum > 0.35 ? "14, 165, 233" : "2, 132, 199";
          alpha = Math.max(0.20, (0.42 + p.lum * 0.45 + reactBoost * 0.15));
          pSize = p.type === "suit" ? 0.75 : 0.55;
        } else {
          // Edge & Contour Highlights
          color = "0, 240, 255";
          alpha = 0.70 + reactBoost * 0.2;
          pSize = 0.70;
        }

        ctx.fillStyle = `rgba(${color}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(px, py, pSize, 0, Math.PI * 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [size, isSpeaking, isListening, amplitude]);

  return (
    <div
      className={`relative flex items-center justify-center ${className}`}
      style={{ width: size, height: Math.round(size * 1.15) }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: size, height: Math.round(size * 1.15) }}
      />
    </div>
  );
}

