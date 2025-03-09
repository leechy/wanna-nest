-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ListItem" (
    "listItemId" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'task',
    "units" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 1.0,
    "deadline" DATETIME,
    "ongoing" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("itemId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("listId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("uid") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ListItem" ("assigneeId", "completed", "createdAt", "deadline", "deleted", "itemId", "listId", "listItemId", "name", "ongoing", "quantity", "sortOrder", "type", "units", "updatedAt") SELECT "assigneeId", "completed", "createdAt", "deadline", "deleted", "itemId", "listId", "listItemId", "name", "ongoing", "quantity", "sortOrder", "type", "units", "updatedAt" FROM "ListItem";
DROP TABLE "ListItem";
ALTER TABLE "new_ListItem" RENAME TO "ListItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
