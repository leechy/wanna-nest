-- CreateTable
CREATE TABLE "ListInvitation" (
    "listId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "invitedById" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("uid", "listId"),
    CONSTRAINT "ListInvitation_listId_fkey" FOREIGN KEY ("listId") REFERENCES "List" ("listId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListInvitation_uid_fkey" FOREIGN KEY ("uid") REFERENCES "User" ("uid") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ListInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User" ("uid") ON DELETE RESTRICT ON UPDATE CASCADE
);
