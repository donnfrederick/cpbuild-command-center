"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Database } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SeedTestDataForm } from "@/components/projects/SeedTestDataForm";

interface SeedTestDataDialogProps {
  projectId: string;
  projectName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SeedTestDataDialog({
  projectId,
  projectName,
  open,
  onOpenChange,
}: SeedTestDataDialogProps) {
  const t = useTranslations("testDataSeed");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description", { name: projectName })}</DialogDescription>
        </DialogHeader>
        <SeedTestDataForm projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}

interface SeedTestDataTriggerProps {
  projectId: string;
  projectName: string;
}

export function SeedTestDataTrigger({ projectId, projectName }: SeedTestDataTriggerProps) {
  const t = useTranslations("testDataSeed");
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("triggerAria", { name: projectName })}
        title={t("trigger")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--neutral-300)",
          backgroundColor: "var(--neutral-0)",
          color: "var(--neutral-700)",
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <Database size={16} />
      </button>
      <SeedTestDataDialog
        projectId={projectId}
        projectName={projectName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
