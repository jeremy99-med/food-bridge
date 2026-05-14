import { useState, useEffect } from "react";

export interface LoadStep {
  text: string;
}

export type ShapeType = "leaf" | "drop" | "grain" | "circle" | "cross";

export interface FloatShape {
  type?: ShapeType;
  emoji?: string;
  top: string;
  left: string;
  dur: number;
  delay: number;
}

const FOREST = "#0f4c2b";
const RING   = "rgba(15, 76, 43, 0.22)";

function ShapeSVG({ type }: { type: ShapeType }) {
  const stroke = FOREST;
  const sw = "1.5";

  if (type === "leaf") return (
    <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
      <path
        d="M11 23C8 19 2 15 2 9C2 5 6 2 11 2C16 2 20 5 20 9C20 15 14 19 11 23Z"
        stroke={stroke} strokeWidth={sw}
      />
      <path
        d="M11 23V10"
        stroke={stroke} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 3"
      />
    </svg>
  );

  if (type === "drop") return (
    <svg width="16" height="22" viewBox="0 0 16 22" fill="none">
      <path
        d="M8 1C8 1 1.5 8.5 1.5 14C1.5 17.6 4.4 21 8 21C11.6 21 14.5 17.6 14.5 14C14.5 8.5 8 1 8 1Z"
        stroke={stroke} strokeWidth={sw}
      />
    </svg>
  );

  if (type === "grain") return (
    <svg width="14" height="22" viewBox="0 0 14 22" fill="none">
      <path d="M7 20V3" stroke={stroke} strokeWidth="1.2" strokeLinecap="round"/>
      <ellipse cx="7" cy="10" rx="5" ry="7.5" stroke={stroke} strokeWidth={sw}/>
    </svg>
  );

  if (type === "circle") return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7.5" stroke={stroke} strokeWidth={sw}/>
      <circle cx="9" cy="9" r="3" fill={stroke} opacity="0.22"/>
    </svg>
  );

  if (type === "cross") return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M8 2V14M2 8H14" stroke={stroke} strokeWidth={sw} strokeLinecap="round"/>
    </svg>
  );

  return null;
}

interface Props {
  title: string;
  steps: LoadStep[];
  centerIcon: React.ReactNode;
  shapes: FloatShape[];
}

export function LoadingScreen({ title, steps, centerIcon, shapes }: Props) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setStep(s => (s + 1) % steps.length), 2500);
    return () => clearInterval(t);
  }, [steps.length]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "#f7faf8",
      position: "relative", overflow: "hidden",
    }}>
      {/* Soft radial glow */}
      <div style={{
        position: "absolute", width: 480, height: 480, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(15,76,43,0.07) 0%, transparent 70%)",
        top: "50%", left: "50%", transform: "translate(-50%,-50%)",
        pointerEvents: "none",
      }} />

      {/* Expanding pulse rings */}
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: "absolute", width: 104, height: 104, borderRadius: "50%",
          border: `1.5px solid ${RING}`,
          animation: `mp-ring-expand 2.7s ease-out ${i * 0.9}s infinite`,
          pointerEvents: "none",
        }} />
      ))}

      {/* Floating background elements */}
      {shapes.map(({ type, emoji, top, left, dur, delay }, i) => (
        <div key={i} style={{
          position: "absolute", top, left, opacity: 0.38,
          animation: `mp-float ${dur}s ease-in-out ${delay}s infinite`,
          pointerEvents: "none",
        }}>
          {emoji
            ? <span style={{ fontSize: "1.6rem" }}>{emoji}</span>
            : type ? <ShapeSVG type={type} /> : null}
        </div>
      ))}

      {/* Center circle with icon */}
      <div style={{
        position: "relative", zIndex: 10,
        width: 88, height: 88, borderRadius: "50%",
        background: `linear-gradient(145deg, #2a8c58 0%, ${FOREST} 100%)`,
        display: "flex", alignItems: "center", justifyContent: "center",
        boxShadow: "0 0 0 10px rgba(15,76,43,0.09), 0 0 36px rgba(15,76,43,0.22)",
        animation: "mp-float 3s ease-in-out infinite",
      }}>
        {centerIcon}
      </div>

      {/* Title */}
      <h2 style={{
        marginTop: "1.75rem",
        fontSize: "1.35rem",
        fontWeight: 700,
        letterSpacing: "-0.03em",
        color: FOREST,
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {title}
      </h2>

      {/* Cycling step label */}
      <p key={step} style={{
        marginTop: "0.5rem", fontSize: "0.875rem",
        color: "#4d7560", animation: "mp-fade-up 0.3s ease-out",
        minHeight: "1.3rem",
      }}>
        {steps[step].text}
      </p>

      {/* Progress dots */}
      <div style={{ display: "flex", gap: 7, marginTop: "1.5rem", alignItems: "center" }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            height: 6, borderRadius: 3,
            width: i === step ? 24 : 6,
            background: i === step ? FOREST : "#daeade",
            transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: i === step ? "0 0 8px rgba(15,76,43,0.35)" : "none",
          }} />
        ))}
      </div>

      <p style={{ marginTop: "2.5rem", fontSize: "0.75rem", color: "#4d7560" }}>
        This usually takes 15–30 seconds
      </p>
    </div>
  );
}

/* ── Pre-built center icons ── */

export const ForkKnifeIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
    {/* Fork — three even prongs at x=9, 12, 15 */}
    <path d="M9 4v7M12 4v7M15 4v7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    {/* Cross bar joining prongs */}
    <path d="M9 11h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    {/* Handle down the center */}
    <path d="M12 11v19" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    {/* Knife */}
    <path d="M23 4v26" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M23 4c0 0 4 3 4 9h-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const BasketIcon = () => (
  <svg width="34" height="32" viewBox="0 0 34 32" fill="none">
    {/* Handles */}
    <path d="M10 13L13.5 4M24 13L20.5 4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    {/* Rim */}
    <path d="M3 13h28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    {/* Body */}
    <path d="M5 13l2.5 15h19L29 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    {/* Stripe */}
    <path d="M13 22h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* ── Reusable shape presets ── */

export const MEAL_SHAPES: FloatShape[] = [
  { emoji: "🥦", top: "8%",  left: "7%",  dur: 6.2, delay: 0    },
  { emoji: "🍎", top: "15%", left: "82%", dur: 7.5, delay: -2.1 },
  { emoji: "🐟", top: "72%", left: "12%", dur: 5.8, delay: -1.3 },
  { emoji: "🥚", top: "78%", left: "78%", dur: 6.9, delay: -3.4 },
  { emoji: "🫐", top: "42%", left: "91%", dur: 7.1, delay: -0.8 },
  { emoji: "🥕", top: "55%", left: "4%",  dur: 6.4, delay: -2.7 },
  { emoji: "🌽", top: "25%", left: "55%", dur: 8.0, delay: -4.0 },
  { emoji: "🍇", top: "88%", left: "48%", dur: 5.5, delay: -1.6 },
];

export const GROCERY_SHAPES: FloatShape[] = [
  { emoji: "🥬", top: "9%",  left: "8%",  dur: 6.1, delay: 0    },
  { emoji: "🧅", top: "14%", left: "80%", dur: 7.3, delay: -2.0 },
  { emoji: "🥩", top: "70%", left: "11%", dur: 5.9, delay: -1.2 },
  { emoji: "🧀", top: "76%", left: "80%", dur: 7.0, delay: -3.3 },
  { emoji: "🍞", top: "44%", left: "90%", dur: 7.2, delay: -0.7 },
  { emoji: "🫙", top: "57%", left: "5%",  dur: 6.3, delay: -2.6 },
  { emoji: "🥫", top: "22%", left: "53%", dur: 8.1, delay: -4.1 },
  { emoji: "🧴", top: "86%", left: "46%", dur: 5.6, delay: -1.5 },
];
