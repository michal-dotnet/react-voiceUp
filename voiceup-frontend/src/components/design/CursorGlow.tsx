import { useEffect, useRef } from "react";

/** A soft colored light that follows the mouse across every page (decorative only). */
const CursorGlow = () => {
  const glow = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (glow.current) {
        glow.current.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
      }
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return <div className="vu-cursor-glow" ref={glow} aria-hidden="true" />;
};

export default CursorGlow;
