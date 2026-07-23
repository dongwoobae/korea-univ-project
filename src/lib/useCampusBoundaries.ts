"use client";

import { useEffect, useState } from "react";
import type { CampusBoundaryCollection } from "@/lib/campusGeometry";

export function useCampusBoundaries() {
  const [boundaries, setBoundaries] = useState<CampusBoundaryCollection | null>(
    null,
  );
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/campus-boundaries.geojson", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`boundaries ${response.status}`);
        return response.json() as Promise<CampusBoundaryCollection>;
      })
      .then((data) => setBoundaries(data))
      .catch((loadError) => {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        ) {
          return;
        }
        setError(true);
      });

    return () => controller.abort();
  }, []);

  return { boundaries, error };
}
