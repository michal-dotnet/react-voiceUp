import type { MouseEvent, ReactNode } from "react";

/**
 * An <article> that tilts slightly toward the mouse (a design effect only).
 * The angles are written to CSS variables used by the .vu-tilt class in index.css.
 */
const TiltCard = ({ children }: { children: ReactNode }) => {
  const tilt = (event: MouseEvent<HTMLElement>) => {
    const card = event.currentTarget;
    const box = card.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width - 0.5;
    const y = (event.clientY - box.top) / box.height - 0.5;

    card.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
    card.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
  };

  const reset = (event: MouseEvent<HTMLElement>) => {
    event.currentTarget.style.setProperty("--rx", "0deg");
    event.currentTarget.style.setProperty("--ry", "0deg");
  };

  return (
    <article className="vu-tilt" onMouseMove={tilt} onMouseLeave={reset}>
      {children}
    </article>
  );
};

export default TiltCard;
