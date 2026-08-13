"use client";

import { useEffect, useState } from "react";
import type { LocationBuilderTagOptions } from "@/lib/field-notes/location-builder-tags";

const EMPTY_OPTIONS: LocationBuilderTagOptions = {
  buildPhases: [],
  areas: [],
};

export function useLocationBuilderTagOptions(projectId: string) {
  const [options, setOptions] = useState<LocationBuilderTagOptions>(EMPTY_OPTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/projects/${projectId}/field-notes/location-builder-tags`);
        if (!res.ok) {
          throw new Error("Failed to load tags");
        }
        const data = (await res.json()) as LocationBuilderTagOptions;
        if (cancelled) return;
        setOptions({
          buildPhases: data.buildPhases ?? [],
          areas: data.areas ?? [],
        });
      } catch {
        if (cancelled) return;
        setError("load_failed");
        setOptions(EMPTY_OPTIONS);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  return { options, loading, error };
}
