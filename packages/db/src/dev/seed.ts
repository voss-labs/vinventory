import { sql } from "drizzle-orm";

import type { Database } from "../index.js";
import {
  auditEvents,
  componentModels,
  inventoryMovements,
  labMemberships,
  labStock,
  labs,
  physicalUnits,
  quantityBalances,
  stockPolicies,
  users,
} from "../schema/index.js";
import { DEV_LAB_IDS, DEV_PERSONAS } from "./personas.js";

export type SeedSummary = Record<
  | "users" | "labs" | "lab_memberships" | "stock_policies" | "component_models" | "lab_stock"
  | "quantity_balances" | "physical_units" | "inventory_movements" | "audit_events",
  number
>;

const personaId = (key: string): string => {
  const persona = DEV_PERSONAS.find((candidate) => candidate.key === key);
  if (!persona) throw new Error(`Unknown dev persona: ${key}`);
  return persona.userId;
};

const ADMIN_ID = personaId("admin");
// Every seed audit event shares this id, so one seed run reads as one operation.
const SEED_CORRELATION_ID = "f0000000-0000-4000-8000-000000000001";

const DEV_POLICY_IDS = {
  vlsiEssential: "c1000000-0000-4000-8000-000000000001",
  vlsiProject: "c1000000-0000-4000-8000-000000000002",
  embEssential: "c1000000-0000-4000-8000-000000000003",
} as const;

const devLabs = [
  { id: DEV_LAB_IDS.vlsi, code: "DEV-VLSI", name: "VLSI Design Lab", location: "Dev building, room 1", isActive: true },
  { id: DEV_LAB_IDS.emb, code: "DEV-EMB", name: "Embedded Systems Lab", location: "Dev building, room 2", isActive: true },
  { id: DEV_LAB_IDS.old, code: "DEV-OLD", name: "Decommissioned Lab", location: "Dev building, room 3", isActive: false },
];

// Incharge memberships carry no flags on purpose: the role alone grants every
// permission in its lab, so the seed exercises that rule rather than the flags.
const devMemberships = [
  { id: "a2000000-0000-4000-8000-000000000001", labId: DEV_LAB_IDS.vlsi, userId: personaId("incharge-vlsi"), role: "incharge" as const },
  { id: "a2000000-0000-4000-8000-000000000002", labId: DEV_LAB_IDS.emb, userId: personaId("incharge-emb"), role: "incharge" as const },
  {
    id: "a2000000-0000-4000-8000-000000000003", labId: DEV_LAB_IDS.vlsi, userId: personaId("staff-restricted"),
    role: "staff" as const, canIssue: true, canReceive: true,
  },
  {
    id: "a2000000-0000-4000-8000-000000000004", labId: DEV_LAB_IDS.vlsi, userId: personaId("deactivated"),
    role: "incharge" as const, isActive: false,
  },
];

const essentialPolicy = {
  name: "Essential", preset: "essential" as const, borrowerRequired: true, returnRequired: true, defaultLoanDays: 4,
};
const devPolicies = [
  { id: DEV_POLICY_IDS.vlsiEssential, labId: DEV_LAB_IDS.vlsi, ...essentialPolicy },
  {
    id: DEV_POLICY_IDS.vlsiProject, labId: DEV_LAB_IDS.vlsi, name: "Project", preset: "project" as const,
    borrowerRequired: true, returnRequired: true, defaultLoanDays: 14, projectPurposeRequired: true, extensionsAllowed: true,
  },
  { id: DEV_POLICY_IDS.embEssential, labId: DEV_LAB_IDS.emb, ...essentialPolicy },
];

type DevStock = {
  id: string;
  modelId: string;
  slug: string;
  name: string;
  labId: string;
  policyId: string;
  stockCode: string;
  storageLocation: string;
  unitOfMeasure: string;
} & ({ tracking: "quantity"; quantity: number } | { tracking: "individual"; units: { id: string; assetTag: string }[] });

const devStock: DevStock[] = [
  {
    id: "e1000000-0000-4000-8000-000000000001", modelId: "d1000000-0000-4000-8000-000000000001",
    slug: "breadboard", name: "Breadboard", labId: DEV_LAB_IDS.vlsi, policyId: DEV_POLICY_IDS.vlsiEssential,
    stockCode: "BREADBOARD", storageLocation: "Cabinet A", unitOfMeasure: "unit", tracking: "quantity", quantity: 20,
  },
  {
    id: "e1000000-0000-4000-8000-000000000002", modelId: "d1000000-0000-4000-8000-000000000002",
    slug: "jumper-kit", name: "Jumper wire kit", labId: DEV_LAB_IDS.vlsi, policyId: DEV_POLICY_IDS.vlsiEssential,
    stockCode: "JUMPER-KIT", storageLocation: "Cabinet A", unitOfMeasure: "kit", tracking: "quantity", quantity: 15,
  },
  {
    id: "e1000000-0000-4000-8000-000000000003", modelId: "d1000000-0000-4000-8000-000000000003",
    slug: "fpga-board", name: "FPGA development board", labId: DEV_LAB_IDS.vlsi, policyId: DEV_POLICY_IDS.vlsiProject,
    stockCode: "FPGA-BOARD", storageLocation: "Cabinet B", unitOfMeasure: "unit", tracking: "individual",
    units: [
      { id: "f1000000-0000-4000-8000-000000000001", assetTag: "DEV-VLSI-0001" },
      { id: "f1000000-0000-4000-8000-000000000002", assetTag: "DEV-VLSI-0002" },
      { id: "f1000000-0000-4000-8000-000000000003", assetTag: "DEV-VLSI-0003" },
    ],
  },
  {
    id: "e1000000-0000-4000-8000-000000000004", modelId: "d1000000-0000-4000-8000-000000000004",
    slug: "oscilloscope", name: "Oscilloscope", labId: DEV_LAB_IDS.vlsi, policyId: DEV_POLICY_IDS.vlsiEssential,
    stockCode: "OSCILLOSCOPE", storageLocation: "Bench 1", unitOfMeasure: "unit", tracking: "individual",
    units: [{ id: "f1000000-0000-4000-8000-000000000004", assetTag: "DEV-VLSI-0004" }],
  },
  {
    id: "e1000000-0000-4000-8000-000000000005", modelId: "d1000000-0000-4000-8000-000000000005",
    slug: "microcontroller-board", name: "Microcontroller board", labId: DEV_LAB_IDS.emb, policyId: DEV_POLICY_IDS.embEssential,
    stockCode: "MCU-BOARD", storageLocation: "Cabinet A", unitOfMeasure: "unit", tracking: "quantity", quantity: 10,
  },
  {
    id: "e1000000-0000-4000-8000-000000000006", modelId: "d1000000-0000-4000-8000-000000000006",
    slug: "sensor", name: "Temperature sensor", labId: DEV_LAB_IDS.emb, policyId: DEV_POLICY_IDS.embEssential,
    stockCode: "SENSOR", storageLocation: "Cabinet A", unitOfMeasure: "unit", tracking: "quantity", quantity: 25,
  },
  {
    id: "e1000000-0000-4000-8000-000000000007", modelId: "d1000000-0000-4000-8000-000000000007",
    slug: "logic-analyser", name: "Logic analyser", labId: DEV_LAB_IDS.emb, policyId: DEV_POLICY_IDS.embEssential,
    stockCode: "LOGIC-ANALYSER", storageLocation: "Bench 1", unitOfMeasure: "unit", tracking: "individual",
    units: [{ id: "f1000000-0000-4000-8000-000000000005", assetTag: "DEV-EMB-0001" }],
  },
];

/**
 * Wipes and recreates the development dataset in one transaction.
 * Deterministic: fixed IDs, no randomness, no clock-dependent values
 * other than defaulted timestamps. Safe to run any number of times.
 * It does not check where `db` points: the CLI refuses non-local URLs first.
 */
export async function seedDevelopmentData(db: Database): Promise<SeedSummary> {
  return db.transaction(async (tx) => {
    // Same statement the existing tests use; cascades to every dependent table.
    await tx.execute(sql`TRUNCATE users, labs, component_models CASCADE`);

    await tx.insert(users).values(DEV_PERSONAS.map((persona) => ({
      id: persona.userId, authProvider: "dev", authSubject: `dev:${persona.key}`, displayName: persona.name,
      email: persona.email, accountType: persona.accountType, isActive: persona.isActive,
    })));
    await tx.insert(labs).values(devLabs);
    await tx.insert(labMemberships).values(devMemberships);
    await tx.insert(stockPolicies).values(devPolicies.map((policy) => ({ ...policy, createdBy: ADMIN_ID })));

    await tx.insert(componentModels).values(devStock.map((stock) => ({
      id: stock.modelId, modelKey: `dev:${stock.slug}`, name: stock.name,
    })));
    await tx.insert(labStock).values(devStock.map((stock) => ({
      id: stock.id, labId: stock.labId, componentModelId: stock.modelId, policyId: stock.policyId,
      stockCode: stock.stockCode, storageLocation: stock.storageLocation, unitOfMeasure: stock.unitOfMeasure,
      trackingMethod: stock.tracking,
    })));

    let balances = 0;
    let units = 0;
    let movements = 0;
    for (const stock of devStock) {
      if (stock.tracking === "quantity") {
        const quantity = String(stock.quantity);
        await tx.insert(quantityBalances).values({ stockId: stock.id, availableQuantity: quantity });
        await tx.insert(inventoryMovements).values({
          stockId: stock.id, movementType: "opening_balance", quantity, toStatus: "available",
          actorUserId: ADMIN_ID, reason: "Development seed", idempotencyKey: `dev-seed:${stock.id}`,
        });
        balances += 1;
        movements += 1;
      } else {
        await tx.insert(physicalUnits).values(stock.units.map((unit) => ({
          id: unit.id, stockId: stock.id, assetTag: unit.assetTag, status: "available" as const,
        })));
        await tx.insert(inventoryMovements).values(stock.units.map((unit) => ({
          stockId: stock.id, physicalUnitId: unit.id, movementType: "opening_balance" as const, quantity: "1",
          toStatus: "available" as const, actorUserId: ADMIN_ID, reason: "Development seed",
          idempotencyKey: `dev-seed:${unit.id}`,
        })));
        units += stock.units.length;
        movements += stock.units.length;
      }
    }

    await tx.insert(auditEvents).values(devStock.map((stock) => ({
      labId: stock.labId, actorUserId: ADMIN_ID, action: "dev.seeded", entityType: "lab_stock",
      entityId: stock.id, correlationId: SEED_CORRELATION_ID,
      afterData: { stockCode: stock.stockCode, tracking: stock.tracking, status: "available" },
    })));

    return {
      users: DEV_PERSONAS.length,
      labs: devLabs.length,
      lab_memberships: devMemberships.length,
      stock_policies: devPolicies.length,
      component_models: devStock.length,
      lab_stock: devStock.length,
      quantity_balances: balances,
      physical_units: units,
      inventory_movements: movements,
      audit_events: devStock.length,
    };
  });
}
