import { useState, useEffect } from "react";

export interface LoadStep {
  text: string;
}

export type ShapeType = "leaf" | "drop" | "grain" | "circle" | "cross";

export interface FloatShape {
  type?: ShapeType;
  svgIcon?: string;
  top: string;
  left: string;
  dur: number;
  delay: number;
}

function ShapeSVG({ type }: { type: ShapeType }) {
  const stroke = "var(--color-foreground)";
  const sw = "1.5";

  if (type === "leaf") return (
    <svg width="22" height="26" viewBox="0 0 22 26" fill="none">
      <path d="M11 23C8 19 2 15 2 9C2 5 6 2 11 2C16 2 20 5 20 9C20 15 14 19 11 23Z" stroke={stroke} strokeWidth={sw}/>
      <path d="M11 23V10" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="2 3"/>
    </svg>
  );
  if (type === "drop") return (
    <svg width="16" height="22" viewBox="0 0 16 22" fill="none">
      <path d="M8 1C8 1 1.5 8.5 1.5 14C1.5 17.6 4.4 21 8 21C11.6 21 14.5 17.6 14.5 14C14.5 8.5 8 1 8 1Z" stroke={stroke} strokeWidth={sw}/>
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
      background: "var(--color-background)",
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
        <div key={i} className="fb-loading-ring" style={{
          position: "absolute", width: 104, height: 104, borderRadius: "50%",
          border: "1.5px solid rgba(15,76,43,0.22)",
          animation: `mp-ring-expand 2.7s ease-out ${i * 0.9}s infinite`,
          pointerEvents: "none",
        }} />
      ))}

      {/* Floating background food icons */}
      {shapes.map(({ type, svgIcon, top, left, dur, delay }, i) => (
        <div key={i} className="fb-float-shape" style={{
          position: "absolute", top, left, opacity: 0.38,
          animation: `mp-float ${dur}s ease-in-out ${delay}s infinite`,
          pointerEvents: "none",
        }}>
          {svgIcon
            ? <img src={svgIcon} className="food-float-icon" alt=""
                   style={{ width: "2rem", height: "2rem", objectFit: "contain" }} />
            : type ? <ShapeSVG type={type} /> : null}
        </div>
      ))}

      {/* Center circle with icon */}
      <div style={{
        position: "relative", zIndex: 10,
        width: 88, height: 88, borderRadius: "50%",
        background: "linear-gradient(145deg, #2a8c58 0%, #0f4c2b 100%)",
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
        color: "var(--color-foreground)",
        fontFamily: "'Playfair Display', Georgia, serif",
      }}>
        {title}
      </h2>

      {/* Cycling step label */}
      <p key={step} style={{
        marginTop: "0.5rem", fontSize: "0.875rem",
        color: "var(--color-muted-foreground)",
        animation: "mp-fade-up 0.3s ease-out",
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
            background: i === step ? "var(--color-foreground)" : "var(--color-surface-2)",
            transition: "all 0.35s cubic-bezier(0.4,0,0.2,1)",
            boxShadow: i === step ? "0 0 8px rgba(15,76,43,0.35)" : "none",
          }} />
        ))}
      </div>

      <p style={{ marginTop: "2.5rem", fontSize: "0.75rem", color: "var(--color-muted-foreground)" }}>
        This usually takes 15–30 seconds
      </p>
    </div>
  );
}

/* ── Pre-built center icons ── */

export const ForkKnifeIcon = () => (
  <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
    <path d="M9 4v7M12 4v7M15 4v7" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M9 11h6" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M12 11v19" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M23 4v26" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M23 4c0 0 4 3 4 9h-4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export const BasketIcon = () => (
  <svg width="34" height="32" viewBox="0 0 34 32" fill="none">
    <path d="M10 13L13.5 4M24 13L20.5 4" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M3 13h28" stroke="white" strokeWidth="2" strokeLinecap="round"/>
    <path d="M5 13l2.5 15h19L29 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M13 22h8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

/* ── Reusable shape presets (using our SVG food icon library) ── */

export const MEAL_SHAPES: FloatShape[] = [
  { svgIcon: "/icons/food/broccoli.svg",  top: "7%",  left: "8%",  dur: 6.2, delay: 0    },
  { svgIcon: "/icons/food/apple.svg",     top: "14%", left: "83%", dur: 7.5, delay: -2.1 },
  { svgIcon: "/icons/food/corn.svg",      top: "26%", left: "49%", dur: 8.0, delay: -4.0 },
  { svgIcon: "/icons/food/mushroom.svg",  top: "37%", left: "11%", dur: 6.7, delay: -3.1 },
  { svgIcon: "/icons/food/blueberry.svg", top: "44%", left: "89%", dur: 7.1, delay: -0.8 },
  { svgIcon: "/icons/food/carrot.svg",    top: "58%", left: "5%",  dur: 6.4, delay: -2.7 },
  { svgIcon: "/icons/food/salmon.svg",    top: "71%", left: "23%", dur: 5.8, delay: -1.3 },
  { svgIcon: "/icons/food/egg.svg",       top: "80%", left: "78%", dur: 6.9, delay: -3.4 },
  { svgIcon: "/icons/food/grapes.svg",    top: "87%", left: "53%", dur: 5.5, delay: -1.6 },
];

export const GROCERY_SHAPES: FloatShape[] = [
  { svgIcon: "/icons/food/lemon.svg",     top: "8%",  left: "7%",  dur: 6.1, delay: 0    },
  { svgIcon: "/icons/food/orange.svg",    top: "12%", left: "82%", dur: 7.3, delay: -2.0 },
  { svgIcon: "/icons/food/grapes.svg",    top: "20%", left: "52%", dur: 8.0, delay: -4.0 },
  { svgIcon: "/icons/food/tomato.svg",    top: "42%", left: "90%", dur: 7.2, delay: -0.7 },
  { svgIcon: "/icons/food/carrot.svg",    top: "55%", left: "5%",  dur: 6.3, delay: -2.6 },
  { svgIcon: "/icons/food/celery.svg",    top: "30%", left: "25%", dur: 5.9, delay: -1.2 },
  { svgIcon: "/icons/food/salmon.svg",    top: "80%", left: "45%", dur: 5.6, delay: -1.5 },
  { svgIcon: "/icons/food/olive-oil.svg", top: "75%", left: "80%", dur: 7.0, delay: -3.3 },
  { svgIcon: "/icons/food/walnuts.svg",   top: "84%", left: "22%", dur: 6.4, delay: -2.8 },
];
