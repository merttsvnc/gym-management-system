import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingStatusGuard } from './billing-status.guard';
import { PrismaService } from '../../prisma/prisma.service';
import { BillingStatus } from '@prisma/client';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../../common/constants/billing-messages';
import { SKIP_BILLING_STATUS_CHECK_KEY } from '../decorators/skip-billing-status-check.decorator';

describe('BillingStatusGuard', () => {
  let guard: BillingStatusGuard;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
    },
  };

  const mockReflector = {
    getAllAndOverride: jest.fn(),
  };

  const createMockExecutionContext = (
    user: { tenantId?: string } | null,
    method: string = 'GET',
    url: string = '/api/v1/test',
    skipCheck: boolean = false,
  ): ExecutionContext => {
    const request = {
      user,
      method,
      url,
    };

    mockReflector.getAllAndOverride.mockReturnValue(skipCheck);

    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingStatusGuard,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<BillingStatusGuard>(BillingStatusGuard);
    prismaService = module.get<PrismaService>(PrismaService);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('T042: Guard allows ACTIVE tenant requests', () => {
    it('should allow GET request for ACTIVE tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'GET',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.ACTIVE,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(mockPrismaService.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
        select: { billingStatus: true },
      });
    });

    it('should allow POST request for ACTIVE tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'POST',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.ACTIVE,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow PATCH request for ACTIVE tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'PATCH',
        '/api/v1/members/123',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.ACTIVE,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow DELETE request for ACTIVE tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'DELETE',
        '/api/v1/members/123',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.ACTIVE,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('T043: Guard allows TRIAL tenant requests', () => {
    it('should allow GET request for TRIAL tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'GET',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.TRIAL,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow POST request for TRIAL tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'POST',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.TRIAL,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('T044: Guard blocks PAST_DUE tenant POST/PATCH/DELETE requests', () => {
    it('should block POST request for PAST_DUE tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'POST',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION,
        });
      }
    });

    it('should block PATCH request for PAST_DUE tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'PATCH',
        '/api/v1/members/123',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION,
        });
      }
    });

    it('should block DELETE request for PAST_DUE tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'DELETE',
        '/api/v1/members/123',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.PAST_DUE_MUTATION,
        });
      }
    });

    it('should block PUT request for PAST_DUE tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'PUT',
        '/api/v1/members/123',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('T045: Guard allows PAST_DUE tenant GET requests', () => {
    it('should allow GET request for PAST_DUE tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'GET',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow HEAD request for PAST_DUE tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'HEAD',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow OPTIONS request for PAST_DUE tenant', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'OPTIONS',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });
  });

  describe('T046: Guard blocks SUSPENDED tenant all requests', () => {
    it('should block GET request for SUSPENDED tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'GET',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.SUSPENDED,
      });

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
        });
      }
    });

    it('should block POST request for SUSPENDED tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'POST',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.SUSPENDED,
      });

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
        });
      }
    });

    it('should block PATCH request for SUSPENDED tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'PATCH',
        '/api/v1/members/123',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.SUSPENDED,
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should block DELETE request for SUSPENDED tenant with 403', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'DELETE',
        '/api/v1/members/123',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.SUSPENDED,
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('T047: Guard extracts tenantId from JWT correctly', () => {
    it('should extract tenantId from request.user.tenantId', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'GET',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        billingStatus: BillingStatus.ACTIVE,
      });

      // Act
      await guard.canActivate(context);

      // Assert
      expect(mockPrismaService.tenant.findUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
        select: { billingStatus: true },
      });
    });
  });

  describe('T048: Guard handles missing tenantId gracefully', () => {
    it('should return 403 when tenantId is missing', async () => {
      // Arrange
      const context = createMockExecutionContext(
        null,
        'GET',
        '/api/v1/members',
      );

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe(
          'Tenant context not found',
        );
        expect(mockPrismaService.tenant.findUnique).not.toHaveBeenCalled();
      }
    });

    it('should return 403 when user exists but tenantId is undefined', async () => {
      // Arrange
      const context = createMockExecutionContext(
        { tenantId: undefined },
        'GET',
        '/api/v1/members',
      );

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe(
          'Tenant context not found',
        );
      }
    });

    it('should return 403 when tenant not found in database', async () => {
      // Arrange
      const tenantId = 'non-existent-tenant';
      const context = createMockExecutionContext(
        { tenantId },
        'GET',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe('Tenant not found');
      }
    });
  });

  describe('Guard skips check when route is marked', () => {
    it('should skip billing status check when SkipBillingStatusCheck decorator is used', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'POST',
        '/api/v1/auth/login',
        true, // skipCheck = true
      );

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(mockPrismaService.tenant.findUnique).not.toHaveBeenCalled();
      expect(mockReflector.getAllAndOverride).toHaveBeenCalledWith(
        SKIP_BILLING_STATUS_CHECK_KEY,
        [context.getHandler(), context.getClass()],
      );
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      // Arrange
      const tenantId = 'tenant-123';
      const context = createMockExecutionContext(
        { tenantId },
        'GET',
        '/api/v1/members',
      );

      mockPrismaService.tenant.findUnique.mockRejectedValue(
        new Error('Database connection error'),
      );

      // Act & Assert
      try {
        await guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe('Access denied');
      }
    });
  });
});
