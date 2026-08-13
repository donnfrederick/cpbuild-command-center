"use client";

import { useEffect, useState } from "react";
import {
  getAnnouncementViewportMode,
  type AnnouncementViewportMode,
} from "@/lib/announcements/announcement-viewport";

export function useAnnouncementViewportMode(): AnnouncementViewportMode {
  const [mode, setMode] = useState<AnnouncementViewportMode>("desktop");

  useEffect(() => {
    const sync = () => setMode(getAnnouncementViewportMode(window.innerWidth));
    sync();
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  return mode;
}
