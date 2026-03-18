-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OpsRoundtableSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "title" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "participants" TEXT NOT NULL,
    "transcript" TEXT,
    "status" TEXT NOT NULL DEFAULT 'running',
    "totalRounds" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_OpsRoundtableSession" ("createdAt", "format", "id", "participants", "title", "transcript") SELECT "createdAt", "format", "id", "participants", "title", "transcript" FROM "OpsRoundtableSession";
DROP TABLE "OpsRoundtableSession";
ALTER TABLE "new_OpsRoundtableSession" RENAME TO "OpsRoundtableSession";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
