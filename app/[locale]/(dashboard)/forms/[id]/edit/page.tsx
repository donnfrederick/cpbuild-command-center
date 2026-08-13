import { getEffectiveSession } from "@/lib/masquerade";
import { canManageForms } from "@/lib/permissions";
import { db } from "@/lib/db";
import { notFound, redirect } from "next/navigation";
import { FormEditClient } from "@/components/forms/FormEditClient";

export async function generateMetadata() {
  return { title: "Edit Form — CP Build" };
}

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string; locale: string }>;
}) {
  const effective = await getEffectiveSession();
  if (!effective?.user) redirect("/sign-in");

  if (!canManageForms(effective.user.role, effective.user.specialPermissions)) {
    notFound();
  }

  const { id } = await params;

  const form = await db.form.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!form) notFound();

  return (
    <FormEditClient
      id={id}
      isPublishedEditMode={form.status === "PUBLISHED"}
    />
  );
}
