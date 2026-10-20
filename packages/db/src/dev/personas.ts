// One list, read by both the seeder that creates these users and the switcher
// that lets you become them. A persona the switcher offers but the seed never
// created would be a dead menu entry, which is what a second list produces.

export const DEV_LAB_IDS = {
  vlsi: "a1000000-0000-4000-8000-000000000001",
  emb: "a1000000-0000-4000-8000-000000000002",
  old: "a1000000-0000-4000-8000-000000000003",
} as const;

export type DevPersona = {
  key: string; // cookie-free stable key, sent by the switcher
  userId: string; // fixed UUID
  email: string; // <key>@dev.vinventory.invalid
  name: string;
  role: string; // human label shown in the switcher
  scope: string; // what makes this persona interesting to test
  accountType: "student" | "staff" | "system_admin";
  isActive: boolean;
};

export const DEV_PERSONAS: readonly DevPersona[] = [
  {
    key: "admin", userId: "b1000000-0000-4000-8000-000000000001", email: "admin@dev.vinventory.invalid",
    name: "Asha Deshpande", role: "System admin", scope: "Every lab",
    accountType: "system_admin", isActive: true,
  },
  {
    key: "incharge-vlsi", userId: "b1000000-0000-4000-8000-000000000002", email: "incharge-vlsi@dev.vinventory.invalid",
    name: "Ravi Kulkarni", role: "Lab incharge", scope: "DEV-VLSI only; denied in DEV-EMB",
    accountType: "staff", isActive: true,
  },
  {
    key: "incharge-emb", userId: "b1000000-0000-4000-8000-000000000003", email: "incharge-emb@dev.vinventory.invalid",
    name: "Sunita Rane", role: "Lab incharge", scope: "DEV-EMB only; denied in DEV-VLSI",
    accountType: "staff", isActive: true,
  },
  {
    key: "staff-restricted", userId: "b1000000-0000-4000-8000-000000000004", email: "staff-restricted@dev.vinventory.invalid",
    name: "Mandar Patil", role: "Lab staff", scope: "DEV-VLSI issue and receive only; cannot import stock",
    accountType: "staff", isActive: true,
  },
  {
    key: "student", userId: "b1000000-0000-4000-8000-000000000005", email: "student@dev.vinventory.invalid",
    name: "Neha Bhosale", role: "Student", scope: "Browses labs; manages nothing",
    accountType: "student", isActive: true,
  },
  {
    key: "unassigned", userId: "b1000000-0000-4000-8000-000000000006", email: "unassigned@dev.vinventory.invalid",
    name: "Rohit Gaikwad", role: "No role assigned", scope: "What a brand-new sign-in gets: the limited state",
    accountType: "student", isActive: true,
  },
  {
    key: "deactivated", userId: "b1000000-0000-4000-8000-000000000007", email: "deactivated@dev.vinventory.invalid",
    name: "Omkar Sawant", role: "Deactivated staff", scope: "Dev login refused; an existing cookie is rejected",
    accountType: "staff", isActive: false,
  },
];

export function findPersona(key: unknown): DevPersona | null {
  if (typeof key !== "string") return null;
  return DEV_PERSONAS.find((persona) => persona.key === key) ?? null;
}
