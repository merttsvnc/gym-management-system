import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { OtpService } from './otp.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt');

describe('OtpService', () => {
  let service: OtpService;
  let prismaService: PrismaService;
  let emailService: EmailService;
  let configService: ConfigService;

  const mockPrismaService = {
    emailOtp: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockEmailService = {
    sendOtpEmail: jest.fn(),
    isEnabled: jest.fn(),
    getDevFixedCode: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'AUTH_EMAIL_VERIFICATION_ENABLED') return 'true';
      if (key === 'AUTH_OTP_DEV_FIXED_CODE') return null;
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
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

    service = module.get<OtpService>(OtpService);
    prismaService = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
    configService = module.get<ConfigService>(ConfigService);

    jest.clearAllMocks();
  });

  describe('createAndSendOtp', () => {
    it('should create and send OTP successfully', async () => {
      const email = 'test@example.com';
      const mockOtpHash = 'hashed_otp';
      const mockDate = new Date('2024-01-01T00:00:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      (bcrypt.hash as jest.Mock).mockResolvedValue(mockOtpHash);
      mockPrismaService.emailOtp.findFirst.mockResolvedValue(null);
      mockPrismaService.emailOtp.updateMany.mockResolvedValue({ count: 0 });
      mockPrismaService.emailOtp.create.mockResolvedValue({
        id: '1',
        email,
        otpHash: mockOtpHash,
      });
      mockEmailService.sendOtpEmail.mockResolvedValue(undefined);

      await service.createAndSendOtp(email);

      expect(mockPrismaService.emailOtp.updateMany).toHaveBeenCalled();
      expect(mockPrismaService.emailOtp.create).toHaveBeenCalled();
      expect(mockEmailService.sendOtpEmail).toHaveBeenCalled();
    });

    it('should enforce daily cap', async () => {
      const email = 'test@example.com';
      const mockDate = new Date('2024-01-01T12:00:00Z');
      const startOfDay = new Date('2024-01-01T00:00:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);
      mockPrismaService.emailOtp.findFirst.mockResolvedValue({
        dailySentCount: 10, // At cap
        dailySentAt: startOfDay,
        createdAt: startOfDay,
      });

      await service.createAndSendOtp(email);

      // Should not create new OTP or send email
      expect(mockPrismaService.emailOtp.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendOtpEmail).not.toHaveBeenCalled();
    });

    it('should enforce resend cooldown', async () => {
      const email = 'test@example.com';
      const now = new Date('2024-01-01T12:00:00Z');
      const recentTime = new Date('2024-01-01T11:59:30Z'); // 30 seconds ago

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      mockPrismaService.emailOtp.findFirst
        .mockResolvedValueOnce(null) // Daily count check
        .mockResolvedValueOnce({
          lastSentAt: recentTime,
        }); // Cooldown check

      await service.createAndSendOtp(email);

      // Should not create new OTP or send email
      expect(mockPrismaService.emailOtp.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendOtpEmail).not.toHaveBeenCalled();
    });
  });

  describe('verifyOtpCode', () => {
    it('should verify OTP successfully and mark as consumed', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const mockOtpHash = 'hashed_otp';
      const now = new Date('2024-01-01T12:00:00Z');
      const expiresAt = new Date('2024-01-01T12:10:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      mockPrismaService.emailOtp.findFirst.mockResolvedValue({
        id: '1',
        email,
        otpHash: mockOtpHash,
        attemptCount: 0,
        expiresAt,
        consumedAt: null,
      });

      mockPrismaService.emailOtp.update.mockResolvedValue({
        id: '1',
        consumedAt: now,
      });

      const result = await service.verifyOtpCode(email, code);

      expect(result).toBe(true);
      expect(mockPrismaService.emailOtp.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { consumedAt: now },
      });
    });

    it('should return false for invalid OTP and increment attemptCount', async () => {
      const email = 'test@example.com';
      const code = 'wrong';
      const mockOtpHash = 'hashed_otp';
      const now = new Date('2024-01-01T12:00:00Z');
      const expiresAt = new Date('2024-01-01T12:10:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      mockPrismaService.emailOtp.findFirst.mockResolvedValue({
        id: '1',
        email,
        otpHash: mockOtpHash,
        attemptCount: 2,
        expiresAt,
        consumedAt: null,
      });

      mockPrismaService.emailOtp.update.mockResolvedValue({
        id: '1',
        attemptCount: 3,
      });

      const result = await service.verifyOtpCode(email, code);

      expect(result).toBe(false);
      expect(mockPrismaService.emailOtp.update).toHaveBeenCalledWith({
        where: { id: '1' },
        data: { attemptCount: 3 },
      });
    });

    it('should return false if OTP is locked (max attempts exceeded)', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const now = new Date('2024-01-01T12:00:00Z');
      const expiresAt = new Date('2024-01-01T12:10:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);

      mockPrismaService.emailOtp.findFirst.mockResolvedValue({
        id: '1',
        email,
        attemptCount: 5, // Max attempts
        expiresAt,
        consumedAt: null,
      });

      const result = await service.verifyOtpCode(email, code);

      expect(result).toBe(false);
      expect(mockPrismaService.emailOtp.update).not.toHaveBeenCalled();
    });

    it('should return false if no active OTP found (anti-enumeration)', async () => {
      const email = 'test@example.com';
      const code = '123456';
      const now = new Date('2024-01-01T12:00:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      mockPrismaService.emailOtp.findFirst.mockResolvedValue(null);

      const result = await service.verifyOtpCode(email, code);

      expect(result).toBe(false);
      expect(mockPrismaService.emailOtp.update).not.toHaveBeenCalled();
    });

    describe('dev mode (AUTH_EMAIL_VERIFICATION_ENABLED=false)', () => {
      let devService: OtpService;
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
            OtpService,
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

        devService = module.get<OtpService>(OtpService);
        jest.clearAllMocks();
      });

      it('should accept fixed dev code without database lookup', async () => {
        const email = 'test@example.com';
        const code = '123456'; // Matches AUTH_OTP_DEV_FIXED_CODE

        const result = await devService.verifyOtpCode(email, code);

        expect(result).toBe(true);
        // Should not query database in dev mode
        expect(mockPrismaService.emailOtp.findFirst).not.toHaveBeenCalled();
        expect(mockPrismaService.emailOtp.update).not.toHaveBeenCalled();
      });

      it('should reject incorrect code in dev mode', async () => {
        const email = 'test@example.com';
        const code = '000000'; // Wrong code

        const result = await devService.verifyOtpCode(email, code);

        expect(result).toBe(false);
        expect(mockPrismaService.emailOtp.findFirst).not.toHaveBeenCalled();
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
            OtpService,
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

        const defaultDevService = module.get<OtpService>(OtpService);

        const result = await defaultDevService.verifyOtpCode(
          'test@example.com',
          '000000',
        );

        expect(result).toBe(true);
      });
    });
  });

  describe('hasActiveOtp', () => {
    it('should return true if active OTP exists', async () => {
      const email = 'test@example.com';
      const now = new Date('2024-01-01T12:00:00Z');
      const expiresAt = new Date('2024-01-01T12:10:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);

      mockPrismaService.emailOtp.findFirst.mockResolvedValue({
        id: '1',
        email,
        attemptCount: 2,
        expiresAt,
        consumedAt: null,
      });

      const result = await service.hasActiveOtp(email);

      expect(result).toBe(true);
    });

    it('should return false if no active OTP exists', async () => {
      const email = 'test@example.com';
      const now = new Date('2024-01-01T12:00:00Z');

      jest.spyOn(global, 'Date').mockImplementation(() => now as any);
      mockPrismaService.emailOtp.findFirst.mockResolvedValue(null);

      const result = await service.hasActiveOtp(email);

      expect(result).toBe(false);
    });
  });
});
