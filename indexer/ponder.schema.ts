import { onchainTable, index, relations } from "ponder";

// --- State tables (one record per entity, updated) ---

export const sla = onchainTable(
  "sla",
  (t) => ({
    id: t.text().primaryKey(),
    slaId: t.bigint().notNull(),
    provider: t.hex().notNull(),
    tenant: t.hex().notNull(),
    serviceName: t.text().notNull(),
    bondAmount: t.text().notNull(),
    responseTimeHrs: t.bigint().notNull(),
    minUptimeBps: t.bigint().notNull(),
    penaltyBps: t.bigint().notNull(),
    active: t.boolean().notNull().default(true),
    breachCount: t.integer().notNull().default(0),
    totalSlashed: t.text().notNull().default("0"),
    latestRiskScore: t.integer(),
    latestVerdict: t.text(),
    createdAt: t.timestamp().notNull(),
    lastUpdated: t.timestamp().notNull(),
    blockNumber: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    slaIdIndex: index().on(table.slaId),
    providerIndex: index().on(table.provider),
    tenantIndex: index().on(table.tenant),
    activeIndex: index().on(table.active),
  })
);

export const provider = onchainTable(
  "provider",
  (t) => ({
    id: t.hex().primaryKey(), // address
    verified: t.boolean().notNull().default(false),
    compliant: t.boolean().notNull().default(false),
    complianceStatus: t.integer().notNull().default(0), // 0=NONE, 1=APPROVED, 2=REJECTED
    registeredAt: t.timestamp().notNull(),
    blockNumber: t.bigint().notNull(),
  }),
  (table) => ({
    verifiedIndex: index().on(table.verified),
  })
);

// --- History tables (append-only event log) ---

export const breach = onchainTable(
  "breach",
  (t) => ({
    id: t.text().primaryKey(), // txHash-logIndex
    slaId: t.bigint().notNull(),
    provider: t.hex().notNull(),
    uptimeBps: t.bigint().notNull(),
    penaltyAmount: t.text().notNull(),
    timestamp: t.timestamp().notNull(),
    blockNumber: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    slaIdIndex: index().on(table.slaId),
    providerIndex: index().on(table.provider),
    timestampIndex: index().on(table.timestamp),
  })
);

export const breachWarning = onchainTable(
  "breach_warning",
  (t) => ({
    id: t.text().primaryKey(), // txHash-logIndex
    slaId: t.bigint().notNull(),
    riskScore: t.integer().notNull(),
    prediction: t.text().notNull(),
    tally: t.text(),      // parsed: "3-0 BREACH"
    summary: t.text(),    // parsed: agent reasoning
    penalized: t.boolean().notNull().default(false), // cross-ref with breach events
    timestamp: t.timestamp().notNull(),
    blockNumber: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    slaIdIndex: index().on(table.slaId),
    timestampIndex: index().on(table.timestamp),
    penalizedIndex: index().on(table.penalized),
  })
);

export const claim = onchainTable(
  "claim",
  (t) => ({
    id: t.text().primaryKey(), // txHash-logIndex
    claimId: t.bigint().notNull(),
    slaId: t.bigint().notNull(),
    tenant: t.hex().notNull(),
    timestamp: t.timestamp().notNull(),
    blockNumber: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    slaIdIndex: index().on(table.slaId),
    tenantIndex: index().on(table.tenant),
  })
);

export const arbitration = onchainTable(
  "arbitration",
  (t) => ({
    id: t.text().primaryKey(),
    slaId: t.bigint().notNull(),
    arbitrator: t.hex().notNull(),
    upheld: t.boolean().notNull(),
    timestamp: t.timestamp().notNull(),
    blockNumber: t.bigint().notNull(),
    transactionHash: t.hex().notNull(),
  }),
  (table) => ({
    slaIdIndex: index().on(table.slaId),
  })
);

// --- Relations ---

export const slaRelations = relations(sla, ({ many }) => ({
  breaches: many(breach),
  warnings: many(breachWarning),
  claims: many(claim),
}));

export const breachRelations = relations(breach, ({ one }) => ({
  sla: one(sla, { fields: [breach.slaId], references: [sla.slaId] }),
}));

export const breachWarningRelations = relations(breachWarning, ({ one }) => ({
  sla: one(sla, { fields: [breachWarning.slaId], references: [sla.slaId] }),
}));

export const claimRelations = relations(claim, ({ one }) => ({
  sla: one(sla, { fields: [claim.slaId], references: [sla.slaId] }),
}));
