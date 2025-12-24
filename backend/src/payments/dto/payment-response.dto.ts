import { Payment, PaymentMethod } from '@prisma/client';

export class PaymentResponseDto {
  id: string;
  tenantId: string;
  branchId: string;
  memberId: string;
  amount: string; // Decimal as string for JSON serialization
  paidOn: string; // ISO 8601 date string
  paymentMethod: PaymentMethod;
  note: string | null;
  isCorrection: boolean;
  correctedPaymentId: string | null;
  isCorrected: boolean;
  version: number;
  createdBy: string;
  createdAt: string; // ISO 8601 datetime string
  updatedAt: string; // ISO 8601 datetime string

  // Optional relations (populated when include relations)
  member?: {
    id: string;
    firstName: string;
    lastName: string;
  };
  branch?: {
    id: string;
    name: string;
  };

  static fromPrismaPayment(payment: Payment): PaymentResponseDto {
    return {
      id: payment.id,
      tenantId: payment.tenantId,
      branchId: payment.branchId,
      memberId: payment.memberId,
      amount: payment.amount.toString(),
      paidOn: payment.paidOn.toISOString().split('T')[0], // DATE-ONLY format (YYYY-MM-DD)
      paymentMethod: payment.paymentMethod,
      note: payment.note,
      isCorrection: payment.isCorrection,
      correctedPaymentId: payment.correctedPaymentId,
      isCorrected: payment.isCorrected,
      version: payment.version,
      createdBy: payment.createdBy,
      createdAt: payment.createdAt.toISOString(),
      updatedAt: payment.updatedAt.toISOString(),
    };
  }

  static fromPrismaPaymentWithRelations(
    payment: Payment & {
      member?: { id: string; firstName: string; lastName: string };
      branch?: { id: string; name: string };
    },
  ): PaymentResponseDto {
    const dto = PaymentResponseDto.fromPrismaPayment(payment);
    if (payment.member) {
      dto.member = {
        id: payment.member.id,
        firstName: payment.member.firstName,
        lastName: payment.member.lastName,
      };
    }
    if (payment.branch) {
      dto.branch = {
        id: payment.branch.id,
        name: payment.branch.name,
      };
    }
    return dto;
  }
}

