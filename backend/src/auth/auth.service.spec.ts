import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UsersRepository } from '../users/users.repository';
import { PrismaService } from '../prisma/prisma.service';
import { User, BillingStatus } from '@prisma/client';
import {
  BILLING_ERROR_CODES,
  BILLING_ERROR_MESSAGES,
} from '../common/constants/billing-messages';

describe('AuthService', () => {
  let service: AuthService;

  const mockUsersRepository = {
    findByEmail: jest.fn(),
    findById: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn(),
  };

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersRepository,
          useValue: mockUsersRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    usersRepository = module.get<UsersRepository>(UsersRepository);
    jwtService = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Setup default config values
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test-access-secret';
      if (key === 'JWT_REFRESH_SECRET') return 'test-refresh-secret';
      if (key === 'JWT_ACCESS_EXPIRES_IN') return '900s';
      if (key === 'JWT_REFRESH_EXPIRES_IN') return '30d';
      return undefined;
    });

    mockJwtService.sign.mockImplementation(() => 'mock-jwt-token');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      // Arrange
      const email = 'test@example.com';
      const password = 'password123';
      const mockUser = {
        id: 'user-123',
        email,
        passwordHash: 'hashed-password',
        tenantId: 'tenant-123',
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockUsersRepository.findByEmail.mockResolvedValue(mockUser);
      const bcrypt = await import('bcrypt');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);

      // Act
      const result = await service.validateUser(email, password);

      // Assert
      expect(result).toEqual(mockUser);
      expect(mockUsersRepository.findByEmail).toHaveBeenCalledWith(email);
    });

    it('should return null when user not found', async () => {
      // Arrange
      mockUsersRepository.findByEmail.mockResolvedValue(null);

      // Act
      const result = await service.validateUser(
        'nonexistent@example.com',
        'password',
      );

      // Assert
      expect(result).toBeNull();
    });

    it('should return null when password is invalid', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        passwordHash: 'hashed-password',
        tenantId: 'tenant-123',
        firstName: 'Test',
        lastName: 'User',
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockUsersRepository.findByEmail.mockResolvedValue(mockUser);
      const bcrypt = await import('bcrypt');
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      // Act
      const result = await service.validateUser(
        'test@example.com',
        'wrong-password',
      );

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('T050: login() rejects SUSPENDED tenant', () => {
    it('should reject SUSPENDED tenant login with 403 and error code', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'tenant-123',
        name: 'Test Gym',
        billingStatus: BillingStatus.SUSPENDED,
      });

      // Act & Assert
      await expect(service.login(mockUser)).rejects.toThrow(ForbiddenException);

      try {
        await service.login(mockUser);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.SUSPENDED_LOGIN,
        });
        expect(mockPrismaService.tenant.findUnique).toHaveBeenCalledWith({
          where: { id: mockUser.tenantId },
          select: {
            id: true,
            name: true,
            billingStatus: true,
          },
        });
        expect(mockJwtService.sign).not.toHaveBeenCalled();
      }
    });
  });

  describe('T051: login() allows PAST_DUE tenant', () => {
    it('should allow PAST_DUE tenant login and return billing status', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'tenant-123',
        name: 'Test Gym',
        billingStatus: BillingStatus.PAST_DUE,
      });

      // Act
      const result = await service.login(mockUser);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).toEqual({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        tenantId: mockUser.tenantId,
      });
      expect(result.tenant).toEqual({
        id: 'tenant-123',
        name: 'Test Gym',
        billingStatus: BillingStatus.PAST_DUE,
      });
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2); // accessToken and refreshToken
    });
  });

  describe('T052: login() allows ACTIVE/TRIAL tenant normally', () => {
    it('should allow ACTIVE tenant login normally', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'tenant-123',
        name: 'Test Gym',
        billingStatus: BillingStatus.ACTIVE,
      });

      // Act
      const result = await service.login(mockUser);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.tenant.billingStatus).toBe(BillingStatus.ACTIVE);
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });

    it('should allow TRIAL tenant login normally', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: 'tenant-123',
        name: 'Test Gym',
        billingStatus: BillingStatus.TRIAL,
      });

      // Act
      const result = await service.login(mockUser);

      // Assert
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.tenant.billingStatus).toBe(BillingStatus.TRIAL);
      expect(mockJwtService.sign).toHaveBeenCalledTimes(2);
    });
  });

  describe('login() error handling', () => {
    it('should throw ForbiddenException when tenant not found', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      // Act & Assert
      await expect(service.login(mockUser)).rejects.toThrow(ForbiddenException);

      try {
        await service.login(mockUser);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).message).toBe('Tenant not found');
      }
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user with billing status for ACTIVE tenant', async () => {
      // Arrange
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        tenantId,
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockUsersRepository.findById.mockResolvedValue(mockUser);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Gym',
        billingStatus: BillingStatus.ACTIVE,
        billingStatusUpdatedAt: new Date('2025-01-01'),
      });

      // Act
      const result = await service.getCurrentUser(userId, tenantId);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.user).toEqual({
        id: userId,
        email: mockUser.email,
        firstName: mockUser.firstName,
        lastName: mockUser.lastName,
        role: mockUser.role,
        tenantId,
      });
      expect(result?.tenant).toEqual({
        id: tenantId,
        name: 'Test Gym',
        billingStatus: BillingStatus.ACTIVE,
        billingStatusUpdatedAt: new Date('2025-01-01'),
      });
    });

    it('should return null when user not found', async () => {
      // Arrange
      mockUsersRepository.findById.mockResolvedValue(null);

      // Act
      const result = await service.getCurrentUser('non-existent', 'tenant-123');

      // Assert
      expect(result).toBeNull();
      expect(mockPrismaService.tenant.findUnique).not.toHaveBeenCalled();
    });

    it('should return null when tenant not found', async () => {
      // Arrange
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
        tenantId: 'tenant-123',
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockUsersRepository.findById.mockResolvedValue(mockUser);
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      // Act
      const result = await service.getCurrentUser('user-123', 'tenant-123');

      // Assert
      expect(result).toBeNull();
    });

    it('should throw ForbiddenException when tenant is SUSPENDED', async () => {
      // Arrange
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        tenantId,
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockUsersRepository.findById.mockResolvedValue(mockUser);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Gym',
        billingStatus: BillingStatus.SUSPENDED,
        billingStatusUpdatedAt: new Date('2025-01-01'),
      });

      // Act & Assert
      await expect(service.getCurrentUser(userId, tenantId)).rejects.toThrow(
        ForbiddenException,
      );

      try {
        await service.getCurrentUser(userId, tenantId);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect((error as ForbiddenException).getResponse()).toEqual({
          code: BILLING_ERROR_CODES.TENANT_BILLING_LOCKED,
          message: BILLING_ERROR_MESSAGES.SUSPENDED_ACCESS,
        });
      }
    });

    it('should allow PAST_DUE tenant to get current user', async () => {
      // Arrange
      const userId = 'user-123';
      const tenantId = 'tenant-123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        tenantId,
        role: 'ADMIN',
        firstName: 'Test',
        lastName: 'User',
        passwordHash: 'hashed',
        createdAt: new Date(),
        updatedAt: new Date(),
      } as User;

      mockUsersRepository.findById.mockResolvedValue(mockUser);
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Gym',
        billingStatus: BillingStatus.PAST_DUE,
        billingStatusUpdatedAt: new Date('2025-01-01'),
      });

      // Act
      const result = await service.getCurrentUser(userId, tenantId);

      // Assert
      expect(result).not.toBeNull();
      expect(result?.tenant.billingStatus).toBe(BillingStatus.PAST_DUE);
    });
  });
});
