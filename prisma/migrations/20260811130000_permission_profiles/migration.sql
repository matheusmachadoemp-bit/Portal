-- AlterTable
ALTER TABLE "User" ADD COLUMN "permissionProfileId" TEXT;

-- CreateTable
CREATE TABLE "PermissionProfile" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PermissionProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModulePermission" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canCreate" BOOLEAN NOT NULL DEFAULT false,
    "canEdit" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ModulePermission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PermissionProfile_key_key" ON "PermissionProfile"("key");

-- CreateIndex
CREATE UNIQUE INDEX "ModulePermission_profileId_moduleKey_key" ON "ModulePermission"("profileId", "moduleKey");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_permissionProfileId_fkey" FOREIGN KEY ("permissionProfileId") REFERENCES "PermissionProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModulePermission" ADD CONSTRAINT "ModulePermission_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "PermissionProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
