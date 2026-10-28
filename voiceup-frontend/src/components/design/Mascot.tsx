import { useEffect, useRef } from "react";

/**
 * Decorative mascot for the login page: its eyes follow the mouse.
 * The pupils are moved directly through refs, so moving the mouse does not re-render React.
 */
const Mascot = () => {
  const leftPupil = useRef<HTMLSpanElement>(null);
  const rightPupil = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const x = (event.clientX / window.innerWidth) * 2 - 1;
      const y = (event.clientY / window.innerHeight) * 2 - 1;
      const transform = `translate(${x * 14}px, ${y * 12}px)`;

      if (leftPupil.current) leftPupil.current.style.transform = transform;
      if (rightPupil.current) rightPupil.current.style.transform = transform;
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div className="vu-mascot" aria-hidden="true">
      <span className="vu-mascot-bubble">👋 שמחים לראות אותך!</span>
      <div className="vu-mascot-body">
        <div className="vu-mascot-eyes">
          <span className="vu-eye">
            <span className="vu-pupil" ref={leftPupil} />
          </span>
          <span className="vu-eye">
            <span className="vu-pupil" ref={rightPupil} />
          </span>
        </div>
        <span className="vu-mouth" />
      </div>
    </div>
  );
};

export default Mascot;
