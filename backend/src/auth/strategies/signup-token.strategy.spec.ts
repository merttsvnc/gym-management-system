import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SignupTokenStrategy } from './signup-token.strategy';

describe('SignupTokenStrategy', () => {
  let strategy: SignupTokenStrategy;
  let _configService: ConfigService;

  const mockConfigService = {
    get: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SignupTokenStrategy,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    strategy = module.get<SignupTokenStrategy>(SignupTokenStrategy);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should throw error if JWT_SIGNUP_SECRET is not set', () => {
      // Arrange
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SIGNUP_SECRET') return undefined;
        return undefined;
      });

      // Act & Assert
      expect(() => {
        new SignupTokenStrategy(mockConfigService as any);
      }).toThrow(
        'JWT_SIGNUP_SECRET is required for signup token verification. Please set it in your environment variables.',
      );
    });

    it('should initialize successfully when JWT_SIGNUP_SECRET is set', () => {
      // Arrange
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SIGNUP_SECRET') return 'test-signup-secret';
        return undefined;
      });

      // Act & Assert
      expect(() => {
        new SignupTokenStrategy(mockConfigService as any);
      }).not.toThrow();
    });

    it('should NOT fallback to JWT_ACCESS_SECRET', () => {
      // Arrange
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SIGNUP_SECRET') return undefined;
        if (key === 'JWT_ACCESS_SECRET') return 'access-secret';
        return undefined;
      });

      // Act & Assert
      expect(() => {
        new SignupTokenStrategy(mockConfigService as any);
      }).toThrow();
    });
  });

  describe('validate', () => {
    beforeEach(() => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SIGNUP_SECRET') return 'test-signup-secret';
        return undefined;
      });
    });

    it('should return payload when valid', () => {
      // Arrange
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
      };

      // Act
      const result = strategy.validate(payload);

      // Assert
      expect(result).toEqual(payload);
    });

    it('should throw UnauthorizedException when sub is missing', () => {
      // Arrange
      const payload = {
        email: 'test@example.com',
      } as any;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid signup token payload',
      );
    });

    it('should throw UnauthorizedException when email is missing', () => {
      // Arrange
      const payload = {
        sub: 'user-123',
      } as any;

      // Act & Assert
      expect(() => strategy.validate(payload)).toThrow(
        'Invalid signup token payload',
      );
    });
  });
});
