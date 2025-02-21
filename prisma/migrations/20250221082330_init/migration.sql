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
    "deadline" DATETIME,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" DATETIME,
    "hideCompleted" BOOLEAN NOT NULL DEFAULT false,
    "notifyOnListShared" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnListItemsUpdate" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnItemStateUpdate" BOOLEAN NOT NULL DEFAULT true,
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
    "ongoing" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" TEXT,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ListItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("itemId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListItem_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("listId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListItem_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "User" ("uid") ON DELETE SET NULL ON UPDATE CASCADE
);
