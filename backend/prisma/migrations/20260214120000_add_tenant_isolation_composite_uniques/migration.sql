-- Add composite unique constraints for tenant isolation (PR-1 Security Core)
-- Enables Prisma update/delete with where: { id_tenantId: { id, tenantId } }
-- Since id is already unique (PK), these constraints cannot be violated by existing data.

-- CreateIndex
CREATE UNIQUE INDEX "Branch_id_tenantId_key" ON "Branch"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Member_id_tenantId_key" ON "Member"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MembershipPlan_id_tenantId_key" ON "MembershipPlan"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_id_tenantId_key" ON "Payment"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_tenantId_branchId_key" ON "Product"("id", "tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSale_id_tenantId_branchId_key" ON "ProductSale"("id", "tenantId", "branchId");
