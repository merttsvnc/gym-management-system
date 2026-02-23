-- CreateEnum
CREATE TYPE "MaritalStatus" AS ENUM ('SINGLE', 'MARRIED', 'DIVORCED', 'WIDOWED', 'OTHER');

-- CreateEnum
CREATE TYPE "BloodType" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG', 'UNKNOWN');

-- AlterTable
ALTER TABLE "Member" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bloodType" "BloodType",
ADD COLUMN     "district" TEXT,
ADD COLUMN     "emergencyContactName" TEXT,
ADD COLUMN     "emergencyContactPhone" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "maritalStatus" "MaritalStatus",
ADD COLUMN     "nationalId" TEXT,
ADD COLUMN     "occupation" TEXT;

-- CreateIndex
CREATE INDEX "Member_tenantId_nationalId_idx" ON "Member"("tenantId", "nationalId");

-- CreateIndex
CREATE INDEX "Member_tenantId_emergencyContactPhone_idx" ON "Member"("tenantId", "emergencyContactPhone");
