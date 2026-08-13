"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import type { CustomSiteLocation } from "@/lib/custom-site-locations";
import { customSiteMatchesBuildingSection, customSiteMatchesLevelSection } from "@/lib/custom-site-locations";
import {
  createCustomSiteLocation,
  deleteCustomSiteLocation,
  fetchCustomSiteLocations,
  updateCustomSiteLocation,
  CustomSiteLocationApiError,
} from "@/lib/custom-site-locations-api";
import { AddCustomSiteLocationSheet } from "@/components/projects/AddCustomSiteLocationSheet";
import { CustomSiteAreaDetailModal } from "@/components/projects/CustomSiteAreaDetailModal";
import { DeleteCustomSiteLocationDialog } from "@/components/projects/DeleteCustomSiteLocationDialog";

interface CustomSiteLocationsContextValue {
  locations: CustomSiteLocation[];
  loading: boolean;
  refresh: () => Promise<void>;
  /** False when location-type filter excludes custom locations. */
  locationsFilterVisible: boolean;
  openAddSheet: () => void;
  openAddSheetForBuilding: (buildingKey: string) => void;
  openAddSheetForLevel: (buildingKey: string, levelKey: string) => void;
  openLocation: (location: CustomSiteLocation) => void;
  openEdit: (location: CustomSiteLocation) => void;
  requestDelete: (location: CustomSiteLocation) => void;
  locationsForLevel: (buildingKey: string, levelKey: string) => CustomSiteLocation[];
  locationsForBuilding: (buildingKey: string) => CustomSiteLocation[];
}

const CustomSiteLocationsContext = createContext<CustomSiteLocationsContextValue | null>(null);

export function useCustomSiteLocations(): CustomSiteLocationsContextValue {
  const ctx = useContext(CustomSiteLocationsContext);
  if (!ctx) {
    throw new Error("useCustomSiteLocations must be used within CustomSiteLocationsProvider");
  }
  return ctx;
}

interface CustomSiteLocationsProviderProps {
  projectId: string;
  buildingOptions: string[];
  levelOptions: string[];
  currentUserId?: string;
  currentUserRole?: string;
  locationsFilterVisible?: boolean;
  /** Desktop (≥768px): slide-in panel like unit grid detail; mobile: full-screen. */
  detailDesktopPanel?: boolean;
  children: ReactNode;
}

export function CustomSiteLocationsProvider({
  projectId,
  buildingOptions,
  levelOptions,
  currentUserId,
  currentUserRole,
  locationsFilterVisible = true,
  detailDesktopPanel = false,
  children,
}: CustomSiteLocationsProviderProps) {
  const t = useTranslations("units.customSite");
  const [locations, setLocations] = useState<CustomSiteLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSheetContext, setAddSheetContext] = useState<
    | { type: "global" }
    | { type: "building"; buildingKey: string }
    | { type: "level"; buildingKey: string; levelKey: string }
    | null
  >(null);
  const [activeLocation, setActiveLocation] = useState<CustomSiteLocation | null>(null);
  const [editLocation, setEditLocation] = useState<CustomSiteLocation | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CustomSiteLocation | null>(null);

  const loadLocations = useCallback(async () => {
    try {
      const rows = await fetchCustomSiteLocations(projectId);
      setLocations(rows);
    } catch {
      toast.error(t("loadError"));
    } finally {
      setLoading(false);
    }
  }, [projectId, t]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  const handleCreate = async (payload: {
    name: string;
    placement: CustomSiteLocation["placement"];
    building: string;
    level: string;
  }) => {
    try {
      const created = await createCustomSiteLocation(projectId, payload, {
        actorUserId: currentUserId,
      });
      setLocations((prev) => [...prev, created]);
      setAddSheetContext(null);
      toast.success(navigator.onLine ? t("created") : t("createdOffline"));
    } catch (err) {
      if (err instanceof CustomSiteLocationApiError) {
        if (err.code === "duplicate_name") {
          toast.error(t("duplicateNameError"));
          return;
        }
        if (err.code === "invalid_scope") {
          toast.error(t("invalidScopeError"));
          return;
        }
      }
      toast.error(t("createError"));
    }
  };

  const handleUpdate = async (payload: {
    name: string;
    placement: CustomSiteLocation["placement"];
    building: string;
    level: string;
  }) => {
    if (!editLocation) return;
    try {
      const updated = await updateCustomSiteLocation(projectId, editLocation.id, payload);
      setLocations((prev) => prev.map((l) => (l.id === updated.id ? updated : l)));
      if (activeLocation?.id === updated.id) setActiveLocation(updated);
      setEditLocation(null);
      toast.success(t("edited"));
    } catch (err) {
      if (err instanceof CustomSiteLocationApiError) {
        if (err.code === "duplicate_name") {
          toast.error(t("duplicateNameError"));
          return;
        }
        if (err.code === "invalid_scope") {
          toast.error(t("invalidScopeError"));
          return;
        }
      }
      toast.error(t("editError"));
    }
  };

  const handleDelete = async (location: CustomSiteLocation) => {
    try {
      await deleteCustomSiteLocation(projectId, location.id);
      setLocations((prev) => prev.filter((l) => l.id !== location.id));
      if (activeLocation?.id === location.id) setActiveLocation(null);
      setPendingDelete(null);
      toast.success(t("deleted"));
    } catch (err) {
      if (err instanceof CustomSiteLocationApiError && err.code === "has_field_notes") {
        toast.error(t("hasFieldNotesError"));
        return;
      }
      toast.error(err instanceof Error ? err.message : t("deleteError"));
    }
  };

  const locationsForLevel = useCallback(
    (buildingKey: string, levelKey: string) =>
      locations.filter((loc) => customSiteMatchesLevelSection(loc, buildingKey, levelKey)),
    [locations],
  );

  const locationsForBuilding = useCallback(
    (buildingKey: string) =>
      locations.filter((loc) => customSiteMatchesBuildingSection(loc, buildingKey)),
    [locations],
  );

  const value = useMemo<CustomSiteLocationsContextValue>(
    () => ({
      locations,
      loading,
      refresh: loadLocations,
      locationsFilterVisible,
      openAddSheet: () => setAddSheetContext({ type: "global" }),
      openAddSheetForBuilding: (buildingKey: string) =>
        setAddSheetContext({ type: "building", buildingKey }),
      openAddSheetForLevel: (buildingKey: string, levelKey: string) =>
        setAddSheetContext({ type: "level", buildingKey, levelKey }),
      openLocation: setActiveLocation,
      openEdit: setEditLocation,
      requestDelete: setPendingDelete,
      locationsForLevel,
      locationsForBuilding,
    }),
    [locations, loading, loadLocations, locationsFilterVisible, locationsForLevel, locationsForBuilding],
  );

  return (
    <CustomSiteLocationsContext.Provider value={value}>
      {children}

      {addSheetContext && (
        <AddCustomSiteLocationSheet
          buildingOptions={buildingOptions}
          levelOptions={levelOptions}
          lockedBuilding={
            addSheetContext.type === "building"
              ? addSheetContext.buildingKey
              : addSheetContext.type === "level"
                ? addSheetContext.buildingKey
                : undefined
          }
          lockedLevel={
            addSheetContext.type === "level" ? addSheetContext.levelKey : undefined
          }
          onClose={() => setAddSheetContext(null)}
          onSubmit={handleCreate}
        />
      )}

      {editLocation && (
        <AddCustomSiteLocationSheet
          buildingOptions={buildingOptions}
          levelOptions={levelOptions}
          title={t("editTitle")}
          initialName={editLocation.name}
          initialPlacement={editLocation.placement}
          initialBuilding={editLocation.building}
          initialLevel={editLocation.level}
          submitLabel={t("saveEdit")}
          onClose={() => setEditLocation(null)}
          onSubmit={handleUpdate}
        />
      )}

      {pendingDelete && (
        <DeleteCustomSiteLocationDialog
          location={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      )}

      {activeLocation && (
        <CustomSiteAreaDetailModal
          projectId={projectId}
          location={activeLocation}
          currentUserId={currentUserId}
          currentUserRole={currentUserRole}
          desktopPanel={detailDesktopPanel}
          onClose={() => setActiveLocation(null)}
          onRefresh={loadLocations}
          onEdit={() => {
            const loc = activeLocation;
            setActiveLocation(null);
            setEditLocation(loc);
          }}
        />
      )}
    </CustomSiteLocationsContext.Provider>
  );
}
