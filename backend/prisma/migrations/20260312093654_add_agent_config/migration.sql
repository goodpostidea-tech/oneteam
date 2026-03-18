-- CreateTable
CREATE TABLE "OpsAgentConfig" (
    "agentId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "role" TEXT,
    "style" TEXT,
    "catchphrase" TEXT,
    "perspective" TEXT,
    "customSystemPrompt" TEXT,
    "updatedAt" DATETIME NOT NULL
);
