-- CreateIndex
CREATE UNIQUE INDEX "Member_tenantId_phone_key" ON "Member"("tenantId", "phone");
