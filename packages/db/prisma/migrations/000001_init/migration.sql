-- Initial Mortem database schema generated from packages/db/prisma/schema.prisma.
-- It creates users, agents, trace records, trace events, and analysis output tables.
-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "primaryWallet" TEXT,
    "userPda" TEXT,
    "pdaFunded" BOOLEAN NOT NULL DEFAULT false,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "agentWallet" TEXT,
    "displayName" TEXT NOT NULL,
    "apiKeyHash" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "privateMode" BOOLEAN NOT NULL DEFAULT false,
    "retentionDays" INTEGER NOT NULL DEFAULT 30,
    "registryPda" TEXT,
    "userPda" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentOwner" (
    "userId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "AgentOwner_pkey" PRIMARY KEY ("userId","agentId")
);

-- CreateTable
CREATE TABLE "Trace" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputSummary" TEXT NOT NULL,
    "outputSummary" TEXT,
    "errorMessage" TEXT,
    "eventCount" INTEGER NOT NULL DEFAULT 0,
    "totalTokens" INTEGER NOT NULL DEFAULT 0,
    "totalCostUsd" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "totalLamports" BIGINT NOT NULL DEFAULT 0,
    "solanaTxCount" INTEGER NOT NULL DEFAULT 0,
    "toolsCalled" TEXT[],
    "anchorSignature" TEXT,
    "anchorSlot" BIGINT,
    "merkleProof" TEXT,
    "traceHash" TEXT,
    "shareToken" TEXT,
    "tags" TEXT[],

    CONSTRAINT "Trace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceEvent" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "parentEventId" TEXT,
    "sequence" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "payload" JSONB NOT NULL,
    "payloadEncrypted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "errorMessage" TEXT,

    CONSTRAINT "TraceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TraceAnalysis" (
    "id" TEXT NOT NULL,
    "traceId" TEXT NOT NULL,
    "failureType" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "whatAgentSaw" TEXT NOT NULL,
    "whatAgentMissed" TEXT NOT NULL,
    "counterfactuals" JSONB NOT NULL,
    "suggestedFix" TEXT NOT NULL,
    "analyzedAt" TIMESTAMP(3) NOT NULL,
    "modelUsed" TEXT NOT NULL,
    "llmProvider" TEXT NOT NULL,

    CONSTRAINT "TraceAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Agent_apiKeyHash_key" ON "Agent"("apiKeyHash");

-- CreateIndex
CREATE UNIQUE INDEX "Trace_shareToken_key" ON "Trace"("shareToken");

-- CreateIndex
CREATE INDEX "Trace_agentId_startedAt_idx" ON "Trace"("agentId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "Trace_shareToken_idx" ON "Trace"("shareToken");

-- CreateIndex
CREATE INDEX "TraceEvent_traceId_sequence_idx" ON "TraceEvent"("traceId", "sequence");

-- CreateIndex
CREATE INDEX "TraceEvent_type_idx" ON "TraceEvent"("type");

-- CreateIndex
CREATE UNIQUE INDEX "TraceAnalysis_traceId_key" ON "TraceAnalysis"("traceId");

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOwner" ADD CONSTRAINT "AgentOwner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentOwner" ADD CONSTRAINT "AgentOwner_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trace" ADD CONSTRAINT "Trace_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceEvent" ADD CONSTRAINT "TraceEvent_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TraceAnalysis" ADD CONSTRAINT "TraceAnalysis_traceId_fkey" FOREIGN KEY ("traceId") REFERENCES "Trace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
