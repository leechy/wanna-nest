-- CreateTable
CREATE TABLE "User" (
    "uid" TEXT NOT NULL PRIMARY KEY,
    "names" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "expo_push_token" TEXT,
    "device_push_token" TEXT,
    "notifyOnListShared" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnListItemsUpdate" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnItemStateUpdate" BOOLEAN NOT NULL DEFAULT true,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "List" (
    "listId" TEXT NOT NULL PRIMARY KEY,
    "shareId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'project',
    "cartMode" TEXT NOT NULL DEFAULT 'cart',
    "deadline" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "hideCompleted" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "itemId" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'task',
    "units" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "public" BOOLEAN NOT NULL DEFAULT false,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "UserList" (
    "uid" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "sortOrder" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnListShared" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnListItemsUpdate" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnItemStateUpdate" BOOLEAN NOT NULL DEFAULT true,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("uid", "listId"),
    CONSTRAINT "UserList_uid_fkey" FOREIGN KEY ("uid") REFERENCES "User" ("uid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserList_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("listId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ListItem" (
    "listItemId" TEXT NOT NULL PRIMARY KEY,
    "itemId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'task',
    "units" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 1.0,
    "deadline" DATETIME,
    "addedById" TEXT,
    "ongoing" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "unavailable" BOOLEAN NOT NULL DEFAULT false,
    "unavailableNote" TEXT,
    "unavailableReply" TEXT,
    "sessionId" TEXT,
    "sortOrder" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("itemId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("listId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListItem_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User" ("uid") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ListItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("uid") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ListItem_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShoppingSession" ("sessionId") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ShoppingSession" (
    "sessionId" TEXT NOT NULL PRIMARY KEY,
    "listId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "endReason" TEXT,
    "latitude" REAL,
    "longitude" REAL,
    CONSTRAINT "ShoppingSession_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("listId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SessionShopper" (
    "sessionId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("sessionId", "uid"),
    CONSTRAINT "SessionShopper_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ShoppingSession" ("sessionId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SessionShopper_uid_fkey" FOREIGN KEY ("uid") REFERENCES "User" ("uid") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_auth_key" ON "User"("auth");

-- CreateIndex
CREATE UNIQUE INDEX "List_shareId_key" ON "List"("shareId");

-- CreateIndex
CREATE INDEX "ListItem_listId_idx" ON "ListItem"("listId");

-- CreateIndex
CREATE INDEX "ShoppingSession_listId_endedAt_idx" ON "ShoppingSession"("listId", "endedAt");
