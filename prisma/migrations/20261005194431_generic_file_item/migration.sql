-- CreateTable
CREATE TABLE "GenericFileItem" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "isFolder" BOOLEAN NOT NULL DEFAULT false,
    "fileUrl" TEXT,
    "mimeType" TEXT,
    "sizeBytes" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenericFileItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GenericFileItem_categoryId_idx" ON "GenericFileItem"("categoryId");

-- CreateIndex
CREATE INDEX "GenericFileItem_subcategoryId_idx" ON "GenericFileItem"("subcategoryId");

-- AddForeignKey
ALTER TABLE "GenericFileItem" ADD CONSTRAINT "GenericFileItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenericFileItem" ADD CONSTRAINT "GenericFileItem_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenericFileItem" ADD CONSTRAINT "GenericFileItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GenericFileItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenericFileItem" ADD CONSTRAINT "GenericFileItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
