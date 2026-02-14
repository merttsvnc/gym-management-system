/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/require-await */
import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentMethod } from '@prisma/client';
import { Decimal } from 'decimal.js';

describe('PaymentsService', () => {
  let service: PaymentsService;
  let prismaService: PrismaService;

  const mockPrismaService = {
    member: {
      findFirst: jest.fn(),
    },
    payment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    prismaService = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const tenantId = 'tenant-123';
  const userId = 'user-123';
  const memberId = 'member-123';
  const branchId = 'branch-123';
  const paymentId = 'payment-123';

  const mockMember = {
    id: memberId,
    tenantId,
    branchId,
    firstName: 'John',
    lastName: 'Doe',
    branch: {
      id: branchId,
      name: 'Main Branch',
      tenantId,
    },
  };

  const mockPayment = {
    id: paymentId,
    tenantId,
    branchId,
    memberId,
    amount: new Decimal('100.00'),
    paidOn: new Date('2024-01-15T00:00:00Z'),
    paymentMethod: PaymentMethod.CASH,
    note: 'Test payment',
    isCorrection: false,
    correctedPaymentId: null,
    isCorrected: false,
    version: 0,
    createdBy: userId,
    createdAt: new Date('2024-01-15T10:00:00Z'),
    updatedAt: new Date('2024-01-15T10:00:00Z'),
    member: mockMember,
    branch: mockMember.branch,
  };

  describe('createPayment', () => {
    const createInput = {
      memberId,
      amount: 100.0,
      paidOn: new Date('2024-01-15'),
      paymentMethod: PaymentMethod.CASH,
      note: 'Test payment',
    };

    it('should create payment successfully', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      const result = await service.createPayment(tenantId, userId, createInput);

      expect(result).toEqual(mockPayment);
      expect(prismaService.member.findFirst).toHaveBeenCalledWith({
        where: { id: memberId, tenantId },
        include: { branch: true },
      });
      expect(prismaService.payment.create).toHaveBeenCalled();
    });

    // T071: Test createPayment() validates member belongs to tenant
    it('should throw NotFoundException when member does not exist', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(
        service.createPayment(tenantId, userId, createInput),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.createPayment(tenantId, userId, createInput),
      ).rejects.toThrow('Üye bulunamadı');
    });

    it('should throw NotFoundException when member belongs to different tenant', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(
        service.createPayment(tenantId, userId, createInput),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.createPayment(tenantId, userId, createInput),
      ).rejects.toThrow('Üye bulunamadı');
    });

    // T072: Test createPayment() validates amount is positive
    it('should throw BadRequestException when amount is zero', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);

      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          amount: 0,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          amount: 0,
        }),
      ).rejects.toThrow('Ödeme tutarı pozitif olmalıdır');
    });

    it('should throw BadRequestException when amount is negative', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);

      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          amount: -10,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when amount exceeds maximum', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);

      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          amount: 1000000.0,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          amount: 1000000.0,
        }),
      ).rejects.toThrow('maksimum 999999.99');
    });

    it('should throw BadRequestException when amount has more than 2 decimal places', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);

      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          amount: 100.123,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          amount: 100.123,
        }),
      ).rejects.toThrow('2 ondalık basamak');
    });

    it('should accept valid amount with 2 decimal places', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.createPayment(tenantId, userId, {
        ...createInput,
        amount: 100.99,
      });

      expect(prismaService.payment.create).toHaveBeenCalled();
    });

    // T073: Test createPayment() validates paidOn date is not in future
    it('should throw BadRequestException when paidOn is in future', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          paidOn: futureDate,
        }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createPayment(tenantId, userId, {
          ...createInput,
          paidOn: futureDate,
        }),
      ).rejects.toThrow('gelecekte olamaz');
    });

    it('should accept paidOn date for today', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);
      const today = new Date();

      await service.createPayment(tenantId, userId, {
        ...createInput,
        paidOn: today,
      });

      expect(prismaService.payment.create).toHaveBeenCalled();
    });

    it('should accept paidOn date in the past', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);
      const pastDate = new Date('2020-01-01');

      await service.createPayment(tenantId, userId, {
        ...createInput,
        paidOn: pastDate,
      });

      expect(prismaService.payment.create).toHaveBeenCalled();
    });

    // T074: Test createPayment() truncates paidOn to start-of-day UTC
    it('should truncate paidOn to start-of-day UTC', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);
      const dateWithTime = new Date('2024-01-15T14:30:00Z');

      await service.createPayment(tenantId, userId, {
        ...createInput,
        paidOn: dateWithTime,
      });

      const createCall = mockPrismaService.payment.create.mock.calls[0][0];
      const paidOnValue = createCall.data.paidOn;
      expect(paidOnValue.getUTCHours()).toBe(0);
      expect(paidOnValue.getUTCMinutes()).toBe(0);
      expect(paidOnValue.getUTCSeconds()).toBe(0);
      expect(paidOnValue.getUTCMilliseconds()).toBe(0);
    });

    // T075: Test createPayment() sets branchId from member's branch
    it('should set branchId from member branch', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.createPayment(tenantId, userId, createInput);

      const createCall = mockPrismaService.payment.create.mock.calls[0][0];
      expect(createCall.data.branchId).toBe(branchId);
      expect(createCall.data.branchId).toBe(mockMember.branchId);
    });

    it('should handle idempotency key correctly', async () => {
      const idempotencyKey = 'test-key-123';
      const mockIdempotencyKey = {
        id: 'idempotency-123',
        key: idempotencyKey,
        tenantId,
        userId,
        response: {
          id: paymentId,
          tenantId,
          branchId,
          memberId,
          amount: { toString: () => '100.00' },
          paidOn: mockPayment.paidOn.toISOString(),
          paymentMethod: PaymentMethod.CASH,
          note: 'Test payment',
          isCorrection: false,
          correctedPaymentId: null,
          isCorrected: false,
          version: 0,
          createdBy: userId,
          createdAt: mockPayment.createdAt.toISOString(),
          updatedAt: mockPayment.updatedAt.toISOString(),
          member: {
            id: memberId,
            firstName: 'John',
            lastName: 'Doe',
          },
          branch: {
            id: branchId,
            name: 'Main Branch',
          },
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      };

      mockPrismaService.idempotencyKey.findUnique.mockResolvedValue(
        mockIdempotencyKey,
      );
      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);

      const result = await service.createPayment(
        tenantId,
        userId,
        createInput,
        idempotencyKey,
      );

      expect(result).toEqual(mockPayment);
      expect(prismaService.idempotencyKey.findUnique).toHaveBeenCalledWith({
        where: { key: idempotencyKey },
      });
      expect(prismaService.payment.create).not.toHaveBeenCalled();
    });
  });

  describe('correctPayment', () => {
    const correctInput = {
      amount: 150.0,
      paidOn: new Date('2024-01-16'),
      paymentMethod: PaymentMethod.CREDIT_CARD,
      note: 'Corrected payment',
      correctionReason: 'Wrong amount',
      version: 0,
    };

    const correctedPayment = {
      ...mockPayment,
      id: 'corrected-payment-123',
      amount: new Decimal('150.00'),
      paidOn: new Date('2024-01-16T00:00:00Z'),
      paymentMethod: PaymentMethod.CREDIT_CARD,
      note: 'Corrected payment',
      isCorrection: true,
      correctedPaymentId: paymentId,
      version: 0,
    };

    // T076: Test correctPayment() validates original payment belongs to tenant
    it('should throw NotFoundException when payment does not exist', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(
        service.correctPayment(tenantId, userId, paymentId, correctInput),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.correctPayment(tenantId, userId, paymentId, correctInput),
      ).rejects.toThrow('Ödeme bulunamadı');
    });

    it('should throw NotFoundException when payment belongs to different tenant', async () => {
      const otherTenantPayment = {
        ...mockPayment,
        tenantId: 'other-tenant',
      };
      mockPrismaService.payment.findFirst.mockResolvedValue(
        otherTenantPayment,
      );

      await expect(
        service.correctPayment(tenantId, userId, paymentId, correctInput),
      ).rejects.toThrow(NotFoundException);
    });

    // T077: Test correctPayment() allows multiple corrections (audit trail)
    it('should allow multiple corrections for the same payment (audit trail)', async () => {
      const alreadyCorrectedPayment = {
        ...mockPayment,
        isCorrected: true,
      };
      mockPrismaService.payment.findFirst.mockResolvedValue(
        alreadyCorrectedPayment,
      );

      const mockCorrectedPayment = {
        id: 'corrected-payment-456',
        ...alreadyCorrectedPayment,
        amount: new Decimal(75),
        isCorrection: true,
        correctedPaymentId: alreadyCorrectedPayment.id,
      };

      mockTx.payment.create.mockResolvedValue(mockCorrectedPayment);
      mockTx.payment.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.correctPayment(
        tenantId,
        userId,
        paymentId,
        correctInput,
      );

      expect(result).toEqual(mockCorrectedPayment);
      expect(mockTx.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            isCorrection: true,
            correctedPaymentId: alreadyCorrectedPayment.id,
          }),
        }),
      );
    });

    // T078: Test correctPayment() validates version matches (optimistic locking)
    // T079: Test correctPayment() throws ConflictException on version mismatch
    it('should throw ConflictException when version does not match', async () => {
      const paymentWithDifferentVersion = {
        ...mockPayment,
        version: 1,
      };
      mockPrismaService.payment.findFirst.mockResolvedValue(
        paymentWithDifferentVersion,
      );

      await expect(
        service.correctPayment(tenantId, userId, paymentId, correctInput),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.correctPayment(tenantId, userId, paymentId, correctInput),
      ).rejects.toThrow('başka bir kullanıcı tarafından güncellenmiş');
    });

    // T080: Test correctPayment() creates new payment record with corrected values
    // T081: Test correctPayment() marks original payment as corrected and increments version
    it('should create corrected payment and update original atomically', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          payment: {
            create: jest.fn().mockResolvedValue(correctedPayment),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx);
      });

      const result = await service.correctPayment(
        tenantId,
        userId,
        paymentId,
        correctInput,
      );

      expect(result).toEqual(correctedPayment);
      expect(prismaService.$transaction).toHaveBeenCalled();

      const transactionCallback =
        mockPrismaService.$transaction.mock.calls[0][0];
      const mockTx = {
        payment: {
          create: jest.fn().mockResolvedValue(correctedPayment),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      await transactionCallback(mockTx);

      expect(mockTx.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: mockPayment.tenantId,
          branchId: mockPayment.branchId,
          memberId: mockPayment.memberId,
          amount: expect.any(Decimal),
          paidOn: expect.any(Date),
          paymentMethod: PaymentMethod.CREDIT_CARD,
          note: 'Corrected payment',
          isCorrection: true,
          correctedPaymentId: paymentId,
          createdBy: userId,
        }),
        include: {
          member: true,
          branch: true,
        },
      });

      expect(mockTx.payment.updateMany).toHaveBeenCalledWith({
        where: {
          id: paymentId,
          version: mockPayment.version,
        },
        data: {
          isCorrected: true,
          version: { increment: 1 },
        },
      });
    });

    it('should throw ConflictException when updateMany returns count 0', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          payment: {
            create: jest.fn().mockResolvedValue(correctedPayment),
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
          },
        };
        return callback(tx);
      });

      await expect(
        service.correctPayment(tenantId, userId, paymentId, correctInput),
      ).rejects.toThrow(ConflictException);
    });

    it('should use original values when correction input is partial', async () => {
      const partialCorrectInput = {
        amount: 150.0,
        version: 0,
      };
      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          payment: {
            create: jest.fn().mockResolvedValue(correctedPayment),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx);
      });

      await service.correctPayment(
        tenantId,
        userId,
        paymentId,
        partialCorrectInput,
      );

      const transactionCallback =
        mockPrismaService.$transaction.mock.calls[0][0];
      const mockTx = {
        payment: {
          create: jest.fn().mockResolvedValue(correctedPayment),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
      };
      await transactionCallback(mockTx);

      const createCall = mockTx.payment.create.mock.calls[0][0];
      expect(createCall.data.paymentMethod).toBe(mockPayment.paymentMethod);
      expect(createCall.data.note).toBe(mockPayment.note);
    });
  });

  describe('getPaymentById', () => {
    it('should return payment when found and belongs to tenant', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);

      const result = await service.getPaymentById(tenantId, paymentId);

      expect(result).toEqual(mockPayment);
      expect(prismaService.payment.findFirst).toHaveBeenCalledWith({
        where: { id: paymentId, tenantId },
        include: {
          member: true,
          branch: true,
          correctedPayment: true,
          correctingPayments: true,
        },
      });
    });

    it('should throw NotFoundException when payment not found', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(service.getPaymentById(tenantId, paymentId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when payment belongs to different tenant', async () => {
      mockPrismaService.payment.findFirst.mockResolvedValue(null);

      await expect(service.getPaymentById(tenantId, paymentId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listPayments', () => {
    it('should return paginated payments filtered by tenant', async () => {
      const mockPayments = [mockPayment];
      mockPrismaService.payment.findMany.mockResolvedValue(mockPayments);
      mockPrismaService.payment.count.mockResolvedValue(1);

      const result = await service.listPayments(tenantId);

      expect(result.data).toEqual(mockPayments);
      expect(result.pagination.total).toBe(1);
      expect(prismaService.payment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId }),
        }),
      );
    });

    it('should exclude corrected original payments by default', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);
      mockPrismaService.payment.count.mockResolvedValue(0);

      await service.listPayments(tenantId);

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toEqual([
        { isCorrection: true },
        { isCorrected: false },
      ]);
    });

    it('should include corrected original payments when includeCorrections is true', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);
      mockPrismaService.payment.count.mockResolvedValue(0);

      await service.listPayments(tenantId, { includeCorrections: true });

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.OR).toBeUndefined();
    });

    it('should filter by memberId when provided', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);
      mockPrismaService.payment.count.mockResolvedValue(0);

      await service.listPayments(tenantId, { memberId });

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.memberId).toBe(memberId);
    });

    it('should filter by branchId when provided', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);
      mockPrismaService.payment.count.mockResolvedValue(0);

      await service.listPayments(tenantId, { branchId });

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.branchId).toBe(branchId);
    });

    it('should filter by paymentMethod when provided', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);
      mockPrismaService.payment.count.mockResolvedValue(0);

      await service.listPayments(tenantId, {
        paymentMethod: PaymentMethod.CASH,
      });

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.paymentMethod).toBe(PaymentMethod.CASH);
    });

    it('should filter by date range when provided', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);
      mockPrismaService.payment.count.mockResolvedValue(0);
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await service.listPayments(tenantId, { startDate, endDate });

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.paidOn).toBeDefined();
      expect(findManyCall.where.paidOn.gte).toBeDefined();
      expect(findManyCall.where.paidOn.lt).toBeDefined();
    });
  });

  describe('getMemberPayments', () => {
    it('should return member payments filtered by tenant', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.findMany.mockResolvedValue([mockPayment]);
      mockPrismaService.payment.count.mockResolvedValue(1);

      const result = await service.getMemberPayments(tenantId, memberId);

      expect(result.data).toEqual([mockPayment]);
      expect(prismaService.member.findFirst).toHaveBeenCalledWith({
        where: { id: memberId, tenantId },
      });
    });

    it('should throw NotFoundException when member does not exist', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(
        service.getMemberPayments(tenantId, memberId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when member belongs to different tenant', async () => {
      mockPrismaService.member.findFirst.mockResolvedValue(null);

      await expect(
        service.getMemberPayments(tenantId, memberId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRevenueReport', () => {
    const revenueFilters = {
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
      groupBy: 'day' as const,
    };

    // T082: Test getRevenueReport() excludes corrected original payments
    // T083: Test getRevenueReport() includes corrected payment amounts
    // T084: Test getRevenueReport() filters by tenant automatically
    it('should exclude corrected original payments and include corrected amounts', async () => {
      const correctedPayment = {
        ...mockPayment,
        id: 'corrected-123',
        isCorrection: true,
        isCorrected: false,
        correctedPaymentId: 'original-123',
        amount: new Decimal('150.00'),
      };
      const regularPayment = {
        ...mockPayment,
        id: 'regular-123',
        isCorrection: false,
        isCorrected: false,
        amount: new Decimal('200.00'),
      };

      mockPrismaService.payment.findMany.mockResolvedValue([
        correctedPayment,
        regularPayment,
      ]);

      const result = await service.getRevenueReport(tenantId, revenueFilters);

      expect(result.totalRevenue).toBe(350.0); // 150 + 200 (excludes 100 from corrected original)
      expect(prismaService.payment.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          tenantId,
          OR: [{ isCorrection: true }, { isCorrected: false }],
        }),
        select: {
          amount: true,
          paidOn: true,
          paymentMethod: true,
          branchId: true,
        },
      });
    });

    it('should filter by branchId when provided', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      await service.getRevenueReport(tenantId, {
        ...revenueFilters,
        branchId,
      });

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.branchId).toBe(branchId);
    });

    it('should filter by paymentMethod when provided', async () => {
      mockPrismaService.payment.findMany.mockResolvedValue([]);

      await service.getRevenueReport(tenantId, {
        ...revenueFilters,
        paymentMethod: PaymentMethod.CASH,
      });

      const findManyCall = mockPrismaService.payment.findMany.mock.calls[0][0];
      expect(findManyCall.where.paymentMethod).toBe(PaymentMethod.CASH);
    });

    it('should group payments by day', async () => {
      const payments = [
        {
          amount: new Decimal('100.00'),
          paidOn: new Date('2024-01-15T00:00:00Z'),
          paymentMethod: PaymentMethod.CASH,
          branchId,
        },
        {
          amount: new Decimal('200.00'),
          paidOn: new Date('2024-01-15T00:00:00Z'),
          paymentMethod: PaymentMethod.CASH,
          branchId,
        },
        {
          amount: new Decimal('150.00'),
          paidOn: new Date('2024-01-16T00:00:00Z'),
          paymentMethod: PaymentMethod.CASH,
          branchId,
        },
      ];
      mockPrismaService.payment.findMany.mockResolvedValue(payments);

      const result = await service.getRevenueReport(tenantId, {
        ...revenueFilters,
        groupBy: 'day',
      });

      expect(result.breakdown).toHaveLength(2);
      expect(result.breakdown[0].period).toBe('2024-01-15');
      expect(result.breakdown[0].revenue).toBe(300.0);
      expect(result.breakdown[0].count).toBe(2);
      expect(result.breakdown[1].period).toBe('2024-01-16');
      expect(result.breakdown[1].revenue).toBe(150.0);
      expect(result.breakdown[1].count).toBe(1);
    });

    it('should group payments by week', async () => {
      const payments = [
        {
          amount: new Decimal('100.00'),
          paidOn: new Date('2024-01-15T00:00:00Z'), // Monday
          paymentMethod: PaymentMethod.CASH,
          branchId,
        },
        {
          amount: new Decimal('200.00'),
          paidOn: new Date('2024-01-16T00:00:00Z'), // Tuesday
          paymentMethod: PaymentMethod.CASH,
          branchId,
        },
      ];
      mockPrismaService.payment.findMany.mockResolvedValue(payments);

      const result = await service.getRevenueReport(tenantId, {
        ...revenueFilters,
        groupBy: 'week',
      });

      expect(result.breakdown.length).toBeGreaterThan(0);
      expect(result.breakdown[0].revenue).toBe(300.0);
    });

    it('should group payments by month', async () => {
      const payments = [
        {
          amount: new Decimal('100.00'),
          paidOn: new Date('2024-01-15T00:00:00Z'),
          paymentMethod: PaymentMethod.CASH,
          branchId,
        },
        {
          amount: new Decimal('200.00'),
          paidOn: new Date('2024-02-15T00:00:00Z'),
          paymentMethod: PaymentMethod.CASH,
          branchId,
        },
      ];
      mockPrismaService.payment.findMany.mockResolvedValue(payments);

      const result = await service.getRevenueReport(tenantId, {
        ...revenueFilters,
        groupBy: 'month',
      });

      expect(result.breakdown.length).toBe(2);
      expect(result.breakdown[0].period).toMatch(/2024-01/);
      expect(result.breakdown[1].period).toMatch(/2024-02/);
    });
  });

  // T085: Test structured logging excludes amounts and notes
  describe('structured logging', () => {
    it('should log payment.created event without amount and note', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');
      mockPrismaService.member.findFirst.mockResolvedValue(mockMember);
      mockPrismaService.payment.create.mockResolvedValue(mockPayment);

      await service.createPayment(tenantId, userId, {
        memberId,
        amount: 100.0,
        paidOn: new Date('2024-01-15'),
        paymentMethod: PaymentMethod.CASH,
        note: 'Test note',
      });

      expect(loggerSpy).toHaveBeenCalled();
      const logCall = loggerSpy.mock.calls[0][0];
      const logData = JSON.parse(logCall as string);

      expect(logData.event).toBe('payment.created');
      expect(logData.paymentId).toBeDefined();
      expect(logData.tenantId).toBe(tenantId);
      expect(logData.branchId).toBe(branchId);
      expect(logData.memberId).toBe(memberId);
      expect(logData.paymentMethod).toBe(PaymentMethod.CASH);
      expect(logData.actorUserId).toBe(userId);
      expect(logData.result).toBe('success');
      expect(logData.correlationId).toBeDefined();
      expect(logData.timestamp).toBeDefined();

      // Verify amount and note are NOT in log
      expect(logData.amount).toBeUndefined();
      expect(logData.note).toBeUndefined();
    });

    it('should log payment.corrected event without amount and note', async () => {
      const loggerSpy = jest.spyOn(service['logger'], 'log');
      mockPrismaService.payment.findFirst.mockResolvedValue(mockPayment);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        const tx = {
          payment: {
            create: jest.fn().mockResolvedValue({
              ...mockPayment,
              id: 'corrected-123',
              amount: new Decimal('150.00'),
              note: 'Corrected note',
            }),
            updateMany: jest.fn().mockResolvedValue({ count: 1 }),
          },
        };
        return callback(tx);
      });

      await service.correctPayment(tenantId, userId, paymentId, {
        amount: 150.0,
        version: 0,
      });

      expect(loggerSpy).toHaveBeenCalled();
      const logCall = loggerSpy.mock.calls[0][0];
      const logData = JSON.parse(logCall as string);

      expect(logData.event).toBe('payment.corrected');
      expect(logData.originalPaymentId).toBe(paymentId);
      expect(logData.correctedPaymentId).toBeDefined();
      expect(logData.tenantId).toBe(tenantId);
      expect(logData.branchId).toBe(branchId);
      expect(logData.memberId).toBe(memberId);
      expect(logData.paymentMethod).toBeDefined();
      expect(logData.actorUserId).toBe(userId);
      expect(logData.result).toBe('success');
      expect(logData.correlationId).toBeDefined();
      expect(logData.timestamp).toBeDefined();

      // Verify amount and note are NOT in log
      expect(logData.amount).toBeUndefined();
      expect(logData.note).toBeUndefined();
    });
  });
});
