"use client";

import { Badge } from "@/components/ui/badge";
import { formatRole } from "@/lib/permissions";

interface Member {
  id: string;
  name: string | null;
  email: string;
  role: string;
  createdAt: string;
}

interface Props {
  members: Member[];
  currentUserId: string;
}

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "ADMIN") return "default";
  if (role === "TEAM_LEAD" || role === "DESIGNER") return "secondary";
  return "outline";
}

export function TeamDirectory({ members, currentUserId }: Props) {
  return (
    <section aria-labelledby="team-directory-heading">
      <h2 id="team-directory-heading" className="text-lg font-semibold mb-4">
        Team Members
      </h2>
      <ul className="space-y-2" role="list" aria-label="Team members">
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
          >
            <div className="min-w-0">
              <p className="font-medium truncate">
                {member.name ?? "Unnamed user"}
                {member.id === currentUserId && (
                  <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                )}
              </p>
              <p className="text-sm text-muted-foreground truncate">{member.email}</p>
            </div>
            <Badge variant={roleBadgeVariant(member.role)}>
              {formatRole(member.role)}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
