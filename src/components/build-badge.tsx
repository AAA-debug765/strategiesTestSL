"use client";

import { useEffect, useState } from "react";

export function BuildBadge() {
  const [info, setInfo] = useState<{ commit: string; time: string } | null>(null);

  useEffect(() => {
    fetch("/api/build-info")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  if (!info) return null;

  return (
    <span
      className="text-[10px] text-muted-foreground/60 font-mono shrink-0 cursor-default select-none hidden lg:inline"
      title={`Commit: ${info.commit}`}
    >
      {info.commit} &middot; {info.time}
    </span>
  );
}