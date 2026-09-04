import { useEffect, useRef } from "react";

export function CEOHumanoidReactor({
  size = 380,
  isSpeaking = false,
  isListening = false,
  amplitude = 0,
  className = "",
}) {
  const canvasRef = useRef(null);
  const imgRef = useRef(null);

  // Avatar mode for small sizes (e.g., chat message bubble avatar)
  const isAvatar = size <= 64;

  useEffect(() => {
    if (isAvatar) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let animationFrameId;
    let time = 0;

    // Retina & 4K High-DPI Scaling
    const dpr = Math.max(window.devicePixelRatio || 1, 2);
    const width = size;
    const height = Math.round(size * 1.12);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Dynamic acoustic sonar pulse rings
    const rings = [];
    let lastRingTime = 0;

    // Rising quantum cyber-dust particles (high-definition micro-sparks)
    const DUST_COUNT = 70;
    const dust = [];
    for (let i = 0; i < DUST_COUNT; i++) {
      dust.push({
        x: (Math.random() - 0.5) * width * 0.85 + width / 2,
        y: Math.random() * height,
        size: 0.6 + Math.random() * 1.4,
        vx: (Math.random() - 0.5) * 0.25,
        vy: -0.35 - Math.random() * 0.75,
        alpha: Math.random() * 0.7 + 0.2,
        decay: 0.003 + Math.random() * 0.005,
      });
    }

    const render = () => {
      time += 0.022;
      ctx.clearRect(0, 0, width, height);

      const centerX = width / 2;
      const centerY = height * 0.44;

      // Reactivity boost calculation
      const reactBoost = isSpeaking
        ? 0.55 + amplitude * 0.85
        : isListening
        ? 0.28 + amplitude * 0.45
        : 0.08;

      // Natural executive breathing
      const breath = Math.sin(time * 0.95) * 2.6;
      const scaleBreath = 1 + (Math.sin(time * 0.95) * 0.006) + (reactBoost * 0.022);

      // -----------------------------------------------------------------------
      // 1. LAYER 1: VOLUMETRIC REACTOR AURA (Deep Azure & Electric Cyan)
      // -----------------------------------------------------------------------
      const auraRadius = width * (0.34 + reactBoost * 0.12);
      const bgHalo = ctx.createRadialGradient(
        centerX, centerY, width * 0.04,
        centerX, centerY, auraRadius
      );
      bgHalo.addColorStop(0, `rgba(0, 240, 255, ${0.28 + reactBoost * 0.32})`);
      bgHalo.addColorStop(0.35, `rgba(14, 165, 233, ${0.16 + reactBoost * 0.20})`);
      bgHalo.addColorStop(0.70, `rgba(2, 132, 199, ${0.06 + reactBoost * 0.10})`);
      bgHalo.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = bgHalo;
      ctx.beginPath();
      ctx.arc(centerX, centerY, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // -----------------------------------------------------------------------
      // 2. LAYER 2: ACOUSTIC RESONANCE RINGS (Expanding Sonar Waves on Speech)
      // -----------------------------------------------------------------------
      if ((isSpeaking || reactBoost > 0.4) && time - lastRingTime > 0.6) {
        rings.push({
          radius: width * 0.12,
          maxRadius: width * 0.52,
          alpha: 0.55,
          speed: 1.4 + reactBoost * 1.6,
        });
        lastRingTime = time;
      }

      for (let i = rings.length - 1; i >= 0; i--) {
        const ring = rings[i];
        ring.radius += ring.speed;
        ring.alpha = Math.max(0, 0.55 * (1 - ring.radius / ring.maxRadius));

        if (ring.radius >= ring.maxRadius || ring.alpha <= 0) {
          rings.splice(i, 1);
          continue;
        }

        ctx.strokeStyle = `rgba(0, 240, 255, ${ring.alpha * 0.75})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(centerX, centerY + 20, ring.radius, 0, Math.PI * 2);
        ctx.stroke();
      }

      // -----------------------------------------------------------------------
      // 3. LAYER 3: ASCENDING QUANTUM CYBER PARTICLES (Crisp Micro-Dust)
      // -----------------------------------------------------------------------
      for (let i = 0; i < dust.length; i++) {
        const d = dust[i];
        d.y += d.vy;
        d.x += d.vx + Math.sin(time * 1.6 + d.y * 0.02) * 0.3;
        d.alpha -= d.decay;

        if (d.alpha <= 0 || d.y < 0) {
          const angle = Math.random() * Math.PI * 2;
          const rad = Math.random() * width * 0.42;
          d.x = centerX + Math.cos(angle) * rad;
          d.y = centerY + Math.sin(angle) * rad + 40;
          d.alpha = Math.random() * 0.75 + 0.25;
        }

        ctx.fillStyle = `rgba(0, 240, 255, ${d.alpha * (0.6 + reactBoost * 0.4)})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // -----------------------------------------------------------------------
      // 4. UPDATE HERO IMAGE TRANSFORM & LIGHTING (60 FPS DOM SYNC)
      // -----------------------------------------------------------------------
      if (imgRef.current) {
        const translateY = breath + (isSpeaking ? Math.sin(time * 14) * (reactBoost * 1.4) : 0);
        imgRef.current.style.transform = `translate3d(0, ${translateY.toFixed(2)}px, 0) scale(${scaleBreath.toFixed(4)})`;

        const cyanGlow = 14 + reactBoost * 26;
        const blueGlow = 36 + reactBoost * 44;
        const cyanAlpha = (0.35 + reactBoost * 0.45).toFixed(2);
        const blueAlpha = (0.18 + reactBoost * 0.30).toFixed(2);
        const brightness = (1.0 + reactBoost * 0.14).toFixed(3);

        imgRef.current.style.filter = `drop-shadow(0 0 ${cyanGlow.toFixed(1)}px rgba(0, 240, 255, ${cyanAlpha})) drop-shadow(0 0 ${blueGlow.toFixed(1)}px rgba(14, 165, 233, ${blueAlpha})) brightness(${brightness})`;
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [size, isSpeaking, isListening, amplitude, isAvatar]);

  // Small avatar view (e.g. Chat assistant message icon)
  if (isAvatar) {
    return (
      <div
        className={`relative flex items-center justify-center overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        <img
          src="/android_cut.png"
          alt="CEO AI"
          className="w-full h-full object-cover object-[50%_18%] scale-125 select-none pointer-events-none transition-all duration-300"
          style={{
            filter: isSpeaking
              ? "drop-shadow(0 0 8px rgba(0,240,255,0.9)) brightness(1.18)"
              : "drop-shadow(0 0 3px rgba(0,240,255,0.45))",
          }}
        />
        {isSpeaking && (
          <div className="absolute inset-0 rounded-full border border-[#00F0FF] animate-ping opacity-35 pointer-events-none" />
        )}
      </div>
    );
  }

  const height = Math.round(size * 1.12);

  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size, height }}
    >
      {/* Background Volumetric Aura & Particle Canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 pointer-events-none z-0"
        style={{ width: size, height }}
      />

      {/* Ultra-High Definition CEO AI Photorealistic Humanoid Core */}
      <div
        className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none"
        style={{
          maskImage: "linear-gradient(to bottom, black 0%, black 82%, transparent 98%)",
          WebkitMaskImage: "linear-gradient(to bottom, black 0%, black 82%, transparent 98%)",
        }}
      >
        <img
          ref={imgRef}
          src="/android_cut.png"
          alt="CEO AI Humanoid"
          className="w-full h-full object-contain will-change-transform pointer-events-none select-none"
          style={{
            imageRendering: "auto",
            transition: "filter 0.15s ease-out",
          }}
        />
      </div>

      {/* Cybernetic Conduits Voice Energy Flare */}
      {isSpeaking && (
        <div
          className="absolute inset-0 pointer-events-none z-20 mix-blend-screen opacity-60 animate-pulse"
          style={{
            background: "radial-gradient(circle at 50% 48%, rgba(0, 240, 255, 0.4) 0%, transparent 45%)",
          }}
        />
      )}
    </div>
  );
}

