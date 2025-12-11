/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { Test, TestingModule } from '@nestjs/testing';
import { MembersService } from '../../src/members/members.service';
import { PrismaService } from '../../src/prisma/prisma.service';
import { MembershipPlansService } from '../../src/membership-plans/membership-plans.service';
import { BadRequestException, ConflictException } from '@nestjs/common';

/**
 * Tests for input validation and data sanitization
 * Covers DTO validation, date validation, phone normalization, etc.
 */
describe('MembersService - Validation', () => {
  let service: MembersService;
  let prisma: PrismaService;

  const mockPrismaService = {
    member: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    branch: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: MembershipPlansService,
          useValue: {
            getPlanByIdForTenant: jest.fn().mockResolvedValue({
              id: 'plan-1',
              name: 'Basic Plan',
              durationType: 'MONTHS',
              durationValue: 1,
              price: 100,
              currency: 'USD',
              status: 'ACTIVE',
              tenantId: 'tenant-1',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<MembersService>(MembersService);
    prisma = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('Phone Number Validation and Normalization', () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    beforeEach(() => {
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: branchId,
        tenantId,
      });
      mockPrismaService.member.findFirst.mockResolvedValue(null);
    });

    it('should trim whitespace from phone number', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '  +1234567890  ',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        phone: '+1234567890',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      // Verify phone was trimmed when checking uniqueness
      expect(mockPrismaService.member.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          phone: '+1234567890',
        },
      });

      // Verify phone was trimmed when creating
      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            phone: '+1234567890',
          }),
        }),
      );
    });

    it('should enforce phone uniqueness within tenant (case-sensitive)', async () => {
      const existingPhone = '+1234567890';

      mockPrismaService.member.findFirst.mockResolvedValue({
        id: 'existing-member',
        phone: existingPhone,
        tenantId,
      });

      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: existingPhone,
      };

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        ConflictException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Bu telefon numarası zaten kullanılıyor',
      );
    });

    it('should allow same phone number in different tenants', async () => {
      const phone = '+1234567890';
      const tenant1 = 'tenant-1';
      const tenant2 = 'tenant-2';

      // Phone exists in tenant2
      mockPrismaService.member.findFirst.mockResolvedValue({
        id: 'member-in-tenant2',
        phone,
        tenantId: tenant2,
      });

      // But when querying for tenant1, findFirst returns null
      mockPrismaService.member.findFirst.mockImplementation(({ where }) => {
        if (where.tenantId === tenant1) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: 'member-in-tenant2',
          phone,
          tenantId: tenant2,
        });
      });

      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone,
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-in-tenant1',
        phone,
        tenantId: tenant1,
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      // Should not throw error
      await service.create(tenant1, createDto);
    });

    it('should exclude current member when checking phone uniqueness on update', async () => {
      const memberId = 'member-1';
      const oldPhone = '+1111111111';
      const newPhone = '+1234567890';
      const existingMember = {
        id: memberId,
        tenantId,
        branchId,
        phone: oldPhone,
        firstName: 'John',
        lastName: 'Doe',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.update.mockResolvedValue({
        ...existingMember,
        phone: newPhone,
      });

      // Updating to a different phone should check uniqueness excluding current member
      await service.update(tenantId, memberId, { phone: newPhone });

      expect(mockPrismaService.member.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId,
          phone: newPhone,
          id: { not: memberId },
        },
      });
    });
  });

  describe('String Field Trimming', () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    beforeEach(() => {
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: branchId,
        tenantId,
      });
      mockPrismaService.member.findFirst.mockResolvedValue(null);
    });

    it('should trim firstName and lastName on create', async () => {
      const createDto = {
        branchId,
        firstName: '  John  ',
        lastName: '  Doe  ',
        phone: '+1234567890',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        firstName: 'John',
        lastName: 'Doe',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'John',
            lastName: 'Doe',
          }),
        }),
      );
    });

    it('should trim email on create', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        email: '  john@example.com  ',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        email: 'john@example.com',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'john@example.com',
          }),
        }),
      );
    });

    it('should trim notes on create', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        notes: '  Important notes here  ',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        notes: 'Important notes here',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: 'Important notes here',
          }),
        }),
      );
    });

    it('should trim string fields on update', async () => {
      const memberId = 'member-1';
      const existingMember = {
        id: memberId,
        tenantId,
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);
      mockPrismaService.member.findFirst.mockResolvedValue(null);
      mockPrismaService.member.update.mockResolvedValue({
        ...existingMember,
        firstName: 'Jane',
      });

      const updateDto = {
        firstName: '  Jane  ',
        lastName: '  Smith  ',
        email: '  jane@example.com  ',
      };

      await service.update(tenantId, memberId, updateDto);

      expect(mockPrismaService.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firstName: 'Jane',
            lastName: 'Smith',
            email: 'jane@example.com',
          }),
        }),
      );
    });
  });

  describe('Membership Date Validation', () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    beforeEach(() => {
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: branchId,
        tenantId,
      });
      mockPrismaService.member.findFirst.mockResolvedValue(null);
    });

    it('should reject membership where end date is before start date on create', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: '2024-12-31',
        membershipEndAt: '2024-01-01',
      };

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        'Üyelik bitiş tarihi başlangıç tarihinden sonra olmalıdır',
      );
    });

    it('should reject membership where end date equals start date on create', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: '2024-06-15',
        membershipEndAt: '2024-06-15',
      };

      await expect(service.create(tenantId, createDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid date updates', async () => {
      const memberId = 'member-1';
      const existingMember = {
        id: memberId,
        tenantId,
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: new Date('2024-01-01'),
        membershipEndAt: new Date('2025-01-01'),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);

      const updateDto = {
        membershipStartAt: '2024-12-31',
        membershipEndAt: '2024-01-01',
      };

      await expect(
        service.update(tenantId, memberId, updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should accept valid membership dates', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: '2024-01-01',
        membershipEndAt: '2025-01-01',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        membershipStartAt: new Date('2024-01-01'),
        membershipEndAt: new Date('2025-01-01'),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      const result = await service.create(tenantId, createDto);

      expect(result).toBeDefined();
      expect(mockPrismaService.member.create).toHaveBeenCalled();
    });

    it('should validate dates when updating only membershipEndAt', async () => {
      const memberId = 'member-1';
      const existingMember = {
        id: memberId,
        tenantId,
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: new Date('2024-06-01'),
        membershipEndAt: new Date('2025-06-01'),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);

      // Try to set end date before existing start date
      const updateDto = {
        membershipEndAt: '2024-01-01',
      };

      await expect(
        service.update(tenantId, memberId, updateDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate dates when updating only membershipStartAt', async () => {
      const memberId = 'member-1';
      const existingMember = {
        id: memberId,
        tenantId,
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipStartAt: new Date('2024-01-01'),
        membershipEndAt: new Date('2024-06-01'),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);

      // Try to set start date after existing end date
      const updateDto = {
        membershipStartAt: '2024-12-01',
      };

      await expect(
        service.update(tenantId, memberId, updateDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Default Values', () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    beforeEach(() => {
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: branchId,
        tenantId,
      });
      mockPrismaService.member.findFirst.mockResolvedValue(null);
    });

    it('should set default membershipType to "Basic" if not provided', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        membershipType: 'Basic',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            membershipType: 'Basic',
          }),
        }),
      );
    });

    it('should use provided membershipType if specified', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        membershipType: 'Premium',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        membershipType: 'Premium',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            membershipType: 'Premium',
          }),
        }),
      );
    });

    it('should set default membershipStartAt to current date if not provided', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      mockPrismaService.member.create.mockImplementation(({ data }) => {
        const now = new Date();
        const startAt = data.membershipStartAt;
        const diffInSeconds =
          Math.abs(now.getTime() - startAt.getTime()) / 1000;

        // Start date should be very close to now (within 5 seconds)
        expect(diffInSeconds).toBeLessThan(5);

        return Promise.resolve({
          id: 'member-1',
          membershipStartAt: startAt,
          membershipEndAt: data.membershipEndAt,
          status: 'ACTIVE',
          pausedAt: null,
          resumedAt: null,
        } as any);
      });

      await service.create(tenantId, createDto);
    });

    it('should set default membershipEndAt to 1 year from start if not provided', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      mockPrismaService.member.create.mockImplementation(({ data }) => {
        const startAt = data.membershipStartAt;
        const endAt = data.membershipEndAt;
        const diffInDays =
          (endAt.getTime() - startAt.getTime()) / (1000 * 60 * 60 * 24);

        // Should be approximately 365 days
        expect(diffInDays).toBeCloseTo(365, 0);

        return Promise.resolve({
          id: 'member-1',
          membershipStartAt: startAt,
          membershipEndAt: endAt,
          status: 'ACTIVE',
          pausedAt: null,
          resumedAt: null,
        } as any);
      });

      await service.create(tenantId, createDto);
    });

    it('should set status to ACTIVE by default on create', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        status: 'ACTIVE',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'ACTIVE',
          }),
        }),
      );
    });
  });

  describe('Optional Field Handling', () => {
    const tenantId = 'tenant-1';
    const branchId = 'branch-1';

    beforeEach(() => {
      mockPrismaService.branch.findUnique.mockResolvedValue({
        id: branchId,
        tenantId,
      });
      mockPrismaService.member.findFirst.mockResolvedValue(null);
    });

    it('should handle optional email field', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        // email is optional
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        email: null,
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalled();
    });

    it('should handle optional gender field', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        // gender is optional
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        gender: null,
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalled();
    });

    it('should handle optional dateOfBirth field', async () => {
      const createDto = {
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        // dateOfBirth is optional
      };

      mockPrismaService.member.create.mockResolvedValue({
        id: 'member-1',
        dateOfBirth: null,
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      } as any);

      await service.create(tenantId, createDto);

      expect(mockPrismaService.member.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            dateOfBirth: null,
          }),
        }),
      );
    });

    it('should convert empty string email to null on update', async () => {
      const memberId = 'member-1';
      const existingMember = {
        id: memberId,
        tenantId,
        branchId,
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        email: 'old@example.com',
        membershipStartAt: new Date(),
        membershipEndAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        status: 'ACTIVE',
        pausedAt: null,
        resumedAt: null,
      };

      mockPrismaService.member.findUnique.mockResolvedValue(existingMember);
      mockPrismaService.member.update.mockResolvedValue({
        ...existingMember,
        email: null,
      });

      const updateDto = {
        email: '',
      };

      await service.update(tenantId, memberId, updateDto);

      // Empty string should be converted to null
      expect(mockPrismaService.member.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: null,
          }),
        }),
      );
    });
  });
});
