/* eslint-disable @typescript-eslint/unbound-method */
import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { BILLING_ERROR_MESSAGES } from '../common/constants/billing-messages';
import { BillingStatus } from '@prisma/client';

describe('TenantsService', () => {
  let service: TenantsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<TenantsService>(TenantsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentTenant', () => {
    const tenantId = 'tenant-123';
    const mockTenant = {
      id: tenantId,
      name: 'Test Gym',
      slug: 'test-gym',
      defaultCurrency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('should return tenant when found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      const result = await service.getCurrentTenant(tenantId);

      expect(result).toEqual(mockTenant);
      expect(prismaService.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
      });
    });

    it('should throw NotFoundException when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentTenant(tenantId)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getCurrentTenant(tenantId)).rejects.toThrow(
        'Tenant not found',
      );
    });

    it('should enforce tenant isolation by requiring tenantId', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      await service.getCurrentTenant(tenantId);

      expect(prismaService.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
      });
    });
  });

  describe('updateCurrentTenant', () => {
    const tenantId = 'tenant-123';
    const mockTenant = {
      id: tenantId,
      name: 'Test Gym',
      slug: 'test-gym',
      defaultCurrency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const updateDto: UpdateTenantDto = {
      name: 'Updated Gym Name',
      defaultCurrency: 'EUR',
    };

    it('should update tenant successfully', async () => {
      const updatedTenant = { ...mockTenant, ...updateDto };
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.tenant.update.mockResolvedValue(updatedTenant);

      const result = await service.updateCurrentTenant(tenantId, updateDto);

      expect(result).toEqual(updatedTenant);
      expect(prismaService.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
      });
      expect(prismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: updateDto,
      });
    });

    it('should throw NotFoundException if tenant does not exist', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.updateCurrentTenant(tenantId, updateDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should enforce tenant isolation by requiring tenantId', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.tenant.update.mockResolvedValue({
        ...mockTenant,
        ...updateDto,
      });

      await service.updateCurrentTenant(tenantId, updateDto);

      expect(prismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: updateDto,
      });
    });

    it('should allow partial updates', async () => {
      const partialDto: UpdateTenantDto = { name: 'New Name' };
      const updatedTenant = { ...mockTenant, name: 'New Name' };
      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.tenant.update.mockResolvedValue(updatedTenant);

      const result = await service.updateCurrentTenant(tenantId, partialDto);

      expect(result.name).toBe('New Name');
      expect(prismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: partialDto,
      });
    });
  });

  describe('T055-T056: updateCurrentTenant rejects billingStatus field', () => {
    const tenantId = 'tenant-123';
    const mockTenant = {
      id: tenantId,
      name: 'Test Gym',
      slug: 'test-gym',
      defaultCurrency: 'USD',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('T055: should reject billingStatus field in update data', async () => {
      // Arrange
      const updateDtoWithBillingStatus = {
        name: 'Updated Name',
        billingStatus: BillingStatus.ACTIVE,
      } as unknown as UpdateTenantDto;

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      // Act & Assert
      await expect(
        service.updateCurrentTenant(tenantId, updateDtoWithBillingStatus),
      ).rejects.toThrow(ForbiddenException);

      try {
        await service.updateCurrentTenant(tenantId, updateDtoWithBillingStatus);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe(
          BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN,
        );
        expect(prismaService.tenant.update).not.toHaveBeenCalled();
      }
    });

    it('T056: should throw 403 Forbidden if billingStatus included', async () => {
      // Arrange
      const updateDtoWithBillingStatus = {
        billingStatus: BillingStatus.SUSPENDED,
      } as unknown as UpdateTenantDto;

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      // Act & Assert
      try {
        await service.updateCurrentTenant(tenantId, updateDtoWithBillingStatus);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        const response = (error as ForbiddenException).getResponse();
        expect(response).toHaveProperty('message', BILLING_ERROR_MESSAGES.BILLING_STATUS_UPDATE_FORBIDDEN);
        expect(response).toHaveProperty('statusCode', 403);
      }
    });

    it('T057: should allow name and defaultCurrency updates normally', async () => {
      // Arrange
      const validUpdateDto: UpdateTenantDto = {
        name: 'Updated Gym Name',
        defaultCurrency: 'EUR',
      };
      const updatedTenant = { ...mockTenant, ...validUpdateDto };

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);
      mockPrismaService.tenant.update.mockResolvedValue(updatedTenant);

      // Act
      const result = await service.updateCurrentTenant(tenantId, validUpdateDto);

      // Assert
      expect(result).toEqual(updatedTenant);
      expect(prismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: tenantId },
        data: validUpdateDto,
      });
    });

    it('should reject billingStatus even when combined with valid fields', async () => {
      // Arrange
      const updateDtoWithBillingStatus = {
        name: 'Updated Name',
        defaultCurrency: 'EUR',
        billingStatus: BillingStatus.ACTIVE,
      } as unknown as UpdateTenantDto;

      mockPrismaService.tenant.findUnique.mockResolvedValue(mockTenant);

      // Act & Assert
      await expect(
        service.updateCurrentTenant(tenantId, updateDtoWithBillingStatus),
      ).rejects.toThrow(ForbiddenException);
      expect(prismaService.tenant.update).not.toHaveBeenCalled();
    });
  });
});
