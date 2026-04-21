"use client";
import { cn } from "../../lib/utils";
import { useMemo } from "react";

export const Meteors = ({
  number = 12,
  className,
}: {
  number?: number;
  className?: string;
}) => {
  const meteorsStyle = useMemo(() => {
    return new Array(number).fill(true).map((_, idx) => ({
      key: "meteor" + idx,
      /* eslint-disable-next-line react-hooks/purity */
      left: Math.floor(Math.random() * (400 - -400) + -400) + "px",
      /* eslint-disable-next-line react-hooks/purity */
      animationDelay: Math.random() * (0.8 - 0.2) + 0.2 + "s",
      /* eslint-disable-next-line react-hooks/purity */
      animationDuration: Math.floor(Math.random() * (10 - 2) + 2) + "s",
    }));
  }, [number]);

  return (
    <>
      {meteorsStyle.map((meteor) => (
        <span
          key={meteor.key}
          className={cn(
            "animate-meteor-effect absolute h-0.5 w-0.5 rounded-full bg-slate-400 shadow-[0_0_0_1px_#ffffff10] rotate-[215deg]",
            "before:content-[''] before:absolute before:top-1/2 before:transform before:-translate-y-[50%] before:w-[50px] before:h-[1px] before:bg-gradient-to-r before:from-[#64748b] before:to-transparent",
            className
          )}
          style={{
            top: 0,
            left: meteor.left,
            animationDelay: meteor.animationDelay,
            animationDuration: meteor.animationDuration,
          }}
        />
      ))}
    </>
  );
};
