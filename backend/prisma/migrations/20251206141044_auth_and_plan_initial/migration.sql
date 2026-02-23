-- CreateEnum
CREATE TYPE "PlanKey" AS ENUM ('SINGLE');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "planKey" "PlanKey" NOT NULL DEFAULT 'SINGLE';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;
