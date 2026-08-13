import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/unifier/client", () => ({
  fetchAllRows: vi.fn(),
}));

const MOCK_UNIFIER_USERS = [
  {
    USERID: "u001",
    USERNAME: "jsmith",
    FULLNAME: "John Smith",
    EMAIL: "jsmith@example.com",
    TITLE: "Project Manager",
    CREATEDATE: "2024-01-15",
  },
  {
    USERID: "u002",
    USERNAME: "amiller",
    FULLNAME: "Alice Miller",
    EMAIL: null,
    TITLE: null,
    CREATEDATE: null,
  },
];

describe("getUnifierUsers()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  it("returns normalized users from Unifier", async () => {
    const { fetchAllRows } = await import("@/lib/unifier/client");
    vi.mocked(fetchAllRows).mockResolvedValue(MOCK_UNIFIER_USERS as never);

    const { getUnifierUsers } = await import("@/lib/unifier/users");
    const users = await getUnifierUsers();

    expect(users).toHaveLength(2);
    expect(users[0]).toEqual({
      userId: "u001",
      username: "jsmith",
      fullName: "John Smith",
      email: "jsmith@example.com",
      title: "Project Manager",
      createDate: "2024-01-15",
    });
  });

  it("handles null fields gracefully", async () => {
    const { fetchAllRows } = await import("@/lib/unifier/client");
    vi.mocked(fetchAllRows).mockResolvedValue(MOCK_UNIFIER_USERS as never);

    const { getUnifierUsers } = await import("@/lib/unifier/users");
    const users = await getUnifierUsers();

    expect(users[1].email).toBeNull();
    expect(users[1].title).toBeNull();
    expect(users[1].createDate).toBeNull();
  });
});

describe("suggestUserLinks()", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  const ccUsers = [
    { id: "cc001", email: "jsmith@example.com", name: "John Smith", unifierUserId: null },
    { id: "cc002", email: "nomatch@example.com", name: "No Match", unifierUserId: null },
    { id: "cc003", email: "amiller@example.com", name: "Alice Miller", unifierUserId: null },
    { id: "cc004", email: "already@example.com", name: "Already Linked", unifierUserId: "u999" },
  ];

  it("returns exact email matches for unlinked users", async () => {
    const { fetchAllRows } = await import("@/lib/unifier/client");
    vi.mocked(fetchAllRows).mockResolvedValue(MOCK_UNIFIER_USERS as never);

    const { suggestUserLinks } = await import("@/lib/unifier/users");
    const suggestions = await suggestUserLinks(ccUsers);

    expect(suggestions).toHaveLength(1); // only jsmith matches (amiller has null email in Unifier)
    expect(suggestions[0].ccUserId).toBe("cc001");
    expect(suggestions[0].unifierUserId).toBe("u001");
    expect(suggestions[0].confidence).toBe("exact");
  });

  it("skips already-linked users", async () => {
    const { fetchAllRows } = await import("@/lib/unifier/client");
    vi.mocked(fetchAllRows).mockResolvedValue(MOCK_UNIFIER_USERS as never);

    const { suggestUserLinks } = await import("@/lib/unifier/users");
    const suggestions = await suggestUserLinks(ccUsers);

    const linkedIds = suggestions.map((s) => s.ccUserId);
    expect(linkedIds).not.toContain("cc004"); // already linked — skip
  });

  it("matches case-insensitively", async () => {
    const { fetchAllRows } = await import("@/lib/unifier/client");
    vi.mocked(fetchAllRows).mockResolvedValue([
      { ...MOCK_UNIFIER_USERS[0], EMAIL: "JSMITH@EXAMPLE.COM" },
    ] as never);

    const { suggestUserLinks } = await import("@/lib/unifier/users");
    const suggestions = await suggestUserLinks([
      { id: "cc001", email: "jsmith@example.com", name: "John", unifierUserId: null },
    ]);

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].confidence).toBe("exact");
  });

  it("returns empty array when no matches", async () => {
    const { fetchAllRows } = await import("@/lib/unifier/client");
    vi.mocked(fetchAllRows).mockResolvedValue(MOCK_UNIFIER_USERS as never);

    const { suggestUserLinks } = await import("@/lib/unifier/users");
    const suggestions = await suggestUserLinks([
      { id: "cc001", email: "nobody@nowhere.com", name: "Nobody", unifierUserId: null },
    ]);

    expect(suggestions).toHaveLength(0);
  });
});
