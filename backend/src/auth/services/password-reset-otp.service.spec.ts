import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { PasswordResetOtpService } from './password-reset-otp.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('PasswordResetOtpService', () => {
  let service: PasswordResetOtpService;
  let _prismaService: PrismaService;
  let _emailService: EmailService;
  let _configService: ConfigService;

  const mockPrismaService = {
    passwordResetOtp: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockEmailService = {
    sendPasswordResetOtpEmail: jest.fn(),
    isEnabled: jest.fn(),
    getDevFixedCode: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_EMAIL_VERIFICATION_ENABLED') return 'true';
      if (key === 'AUTH_OTP_DEV_FIXED_CODE') return null;
      if (key === 'NODE_ENV') return 'development';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PasswordResetOtpService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PasswordResetOtpService>(PasswordResetOtpService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  describe('createAndSendOtp', () => {
    it('should create and send OTP successfully', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const mockOtpHash = 'hashed_otp';
      const mockDate = new Date('2024-01-01T00:00:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      (bcrypt.hash as jest.Mock).mockResolvedValue(mockOtpHash);
      mockPrismaService.passwordResetOtp.findFirst.mockResolvedValue(null);
      mockPrismaService.passwordResetOtp.deleteMany.mockResolvedValue({
        count: 0,
      });
      mockPrismaService.passwordResetOtp.create.mockResolvedValue({
        id: '1',
        userId,
        otpHash: mockOtpHash,
      });
      mockEmailService.sendPasswordResetOtpEmail.mockResolvedValue(undefined);

      await service.createAndSendOtp(userId, email);

      expect(mockPrismaService.passwordResetOtp.deleteMany).toHaveBeenCalled();
      expect(mockPrismaService.passwordResetOtp.create).toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetOtpEmail).toHaveBeenCalled();
    });

    it('should enforce daily cap', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const mockDate = new Date('2024-01-01T12:00:00Z');
      const startOfDay = new Date('2024-01-01T00:00:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      mockPrismaService.passwordResetOtp.findFirst.mockResolvedValue({
        dailySentCount: 10, // At cap
        dailySentAt: startOfDay,
        createdAt: startOfDay,
      });

      await service.createAndSendOtp(userId, email);

      // Should not create new OTP or send email
      expect(mockPrismaService.passwordResetOtp.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetOtpEmail).not.toHaveBeenCalled();
    });

    it('should enforce resend cooldown', async () => {
      const userId = 'user-123';
      const email = 'test@example.com';
      const now = new Date('2024-01-01T12:00:00Z');
      const recentTime = new Date('2024-01-01T11:59:30Z'); // 30 seconds ago

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      mockPrismaService.passwordResetOtp.findFirst
        .mockResolvedValueOnce(null) // Daily count check
        .mockResolvedValueOnce({
          lastSentAt: recentTime,
        }); // Cooldown check

      await service.createAndSendOtp(userId, email);

      // Should not create new OTP or send email
      expect(mockPrismaService.passwordResetOtp.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtpCode', () => {
    it('should verify OTP successfully and delete record', async () => {
      const userId = 'user-123';
      const code = '123456';
      const mockOtpHash = 'hashed_otp';
      const now = new Date('2024-01-01T12:00:00Z');
      const expiresAt = new Date('2024-01-01T12:10:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      mockPrismaService.passwordResetOtp.findFirst.mockResolvedValue({
        id: '1',
        userId,
        otpHash: mockOtpHash,
        attemptCount: 0,
        expiresAt,
      });

      mockPrismaService.passwordResetOtp.delete.mockResolvedValue({
        id: '1',
      });

      const result = await service.verifyOtpCode(userId, code);

      expect(result).toBe(true);
      expect(mockPrismaService.passwordResetOtp.delete).toHaveBeenCalledWith({
        where: { id: '1' },
      });
    });

    it('should return false for invalid OTP and increment attemptCount', async () => {
      const userId = 'user-123';
      const code = 'wrong';
      const mockOtpHash = 'hashed_otp';
      const now = new Date('2024-01-01T12:00:00Z');
      const expiresAt = new Date('2024-01-01T12:10:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      mockPrismaService.passwordResetOtp.findFirst.mockResolvedValue({
        id: '1',
        userId,
        otpHash: mockOtpHash,
        attemptCount: 2,
        expiresAt,
      });

      mockPrismaService.passwordResetOtp.update.mockResolvedValue({
        id: '1',
        attemptCount: 3,
      });

      const result = await service.verifyOtpCode(userId, code);

      expect(result).toBe(false);
      expect(mockPrismaService.passwordResetOtp.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { attemptCount: 3 },
      });
    });

    it('should return false if OTP is locked (max attempts exceeded)', async () => {
      const userId = 'user-123';
      const code = '123456';
      const now = new Date('2024-01-01T12:00:00Z');
      const expiresAt = new Date('2024-01-01T12:10:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);

      mockPrismaService.passwordResetOtp.findFirst.mockResolvedValue({
        id: '1',
        userId,
        attemptCount: 5, // Max attempts
        expiresAt,
      });

      const result = await service.verifyOtpCode(userId, code);

      expect(result).toBe(false);
      expect(mockPrismaService.passwordResetOtp.update).not.toHaveBeenCalled();
    });

    it('should return false if no active OTP found (anti-enumeration)', async () => {
      const userId = 'user-123';
      const code = '123456';
      const now = new Date('2024-01-01T12:00:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      mockPrismaService.passwordResetOtp.findFirst.mockResolvedValue(null);

      const result = await service.verifyOtpCode(userId, code);

      expect(result).toBe(false);
      expect(mockPrismaService.passwordResetOtp.update).not.toHaveBeenCalled();
    });

    describe('dev mode (AUTH_EMAIL_VERIFICATION_ENABLED=false)', () => {
      let devService: PasswordResetOtpService;
      const devMockConfigService = {
        get: jest.fn((key: string) => {
          if (key === 'AUTH_EMAIL_VERIFICATION_ENABLED') return 'false';
          if (key === 'AUTH_OTP_DEV_FIXED_CODE') return '123456';
          if (key === 'NODE_ENV') return 'development';
          return null;
        }),
      };

      beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
          providers: [
            PasswordResetOtpService,
            {
              provide: PrismaService,
              useValue: mockPrismaService,
            },
            {
              provide: EmailService,
              useValue: mockEmailService,
            },
            {
              provide: ConfigService,
              useValue: devMockConfigService,
            },
          ],
        }).compile();

        devService = module.get<PasswordResetOtpService>(
          PasswordResetOtpService,
        );
        jest.clearAllMocks();
      });

      it('should accept fixed dev code without database lookup', async () => {
        const userId = 'user-123';
        const code = '123456'; // Matches AUTH_OTP_DEV_FIXED_CODE

        const result = await devService.verifyOtpCode(userId, code);

        expect(result).toBe(true);
        // Should not query database in dev mode
        expect(
          mockPrismaService.passwordResetOtp.findFirst,
        ).not.toHaveBeenCalled();
        expect(
          mockPrismaService.passwordResetOtp.delete,
        ).not.toHaveBeenCalled();
      });

      it('should reject incorrect code in dev mode', async () => {
        const userId = 'user-123';
        const code = '000000'; // Wrong code

        const result = await devService.verifyOtpCode(userId, code);

        expect(result).toBe(false);
        expect(
          mockPrismaService.passwordResetOtp.findFirst,
        ).not.toHaveBeenCalled();
      });

      it('should use default 000000 if AUTH_OTP_DEV_FIXED_CODE not set', async () => {
        const defaultMockConfigService = {
          get: jest.fn((key: string) => {
            if (key === 'AUTH_EMAIL_VERIFICATION_ENABLED') return 'false';
            if (key === 'AUTH_OTP_DEV_FIXED_CODE') return null;
            if (key === 'NODE_ENV') return 'development';
            return null;
          }),
        };

        const module: TestingModule = await Test.createTestingModule({
          providers: [
            PasswordResetOtpService,
            {
              provide: PrismaService,
              useValue: mockPrismaService,
            },
            {
              provide: EmailService,
              useValue: mockEmailService,
            },
            {
              provide: ConfigService,
              useValue: defaultMockConfigService,
            },
          ],
        }).compile();

        const defaultDevService = module.get<PasswordResetOtpService>(
          PasswordResetOtpService,
        );

        const result = await defaultDevService.verifyOtpCode(
          'user-123',
          '000000',
        );

        expect(result).toBe(true);
      });
    });
  });

  describe('clearOtpsForUser', () => {
    it('should delete all OTPs for a user', async () => {
      const userId = 'user-123';

      mockPrismaService.passwordResetOtp.deleteMany.mockResolvedValue({
        count: 3,
      });

      await service.clearOtpsForUser(userId);

      expect(
        mockPrismaService.passwordResetOtp.deleteMany,
      ).toHaveBeenCalledWith({
        where: { userId },
      });
    });
  });
});
