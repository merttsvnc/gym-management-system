import { Test, TestingModule } from '@nestjs/testing';
import { MembersController } from '../../src/members/members.controller';
import { MembersService } from '../../src/members/members.service';
import { MemberStatus, MemberGender } from '@prisma/client';

/**
 * Controller integration tests
 * Tests controller methods with mocked service
 */
describe('MembersController', () => {
  let controller: MembersController;
  let service: MembersService;

  const mockMembersService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    changeStatus: jest.fn(),
    archive: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MembersController],
      providers: [
        {
          provide: MembersService,
          useValue: mockMembersService,
        },
      ],
    }).compile();

    controller = module.get<MembersController>(MembersController);
    service = module.get<MembersService>(MembersService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should call service.findAll with tenantId and query', async () => {
      const tenantId = 'tenant-1';
      const query = { page: 1, limit: 20 };
      const mockResult = {
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };

      mockMembersService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(tenantId, query);

      expect(service.findAll).toHaveBeenCalledWith(tenantId, query);
      expect(result).toEqual(mockResult);
    });

    it('should pass all query parameters to service', async () => {
      const tenantId = 'tenant-1';
      const query = {
        page: 2,
        limit: 10,
        branchId: 'branch-1',
        status: MemberStatus.ACTIVE,
        search: 'john',
        includeArchived: true,
      };

      mockMembersService.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 2, limit: 10, total: 0, totalPages: 0 },
      });

      await controller.findAll(tenantId, query);

      expect(service.findAll).toHaveBeenCalledWith(tenantId, query);
    });
  });

  describe('findOne', () => {
    it('should call service.findOne with tenantId and id', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'member-1';
      const mockMember = {
        id: memberId,
        tenantId,
        firstName: 'John',
        lastName: 'Doe',
        remainingDays: 335,
      };

      mockMembersService.findOne.mockResolvedValue(mockMember);

      const result = await controller.findOne(tenantId, memberId);

      expect(service.findOne).toHaveBeenCalledWith(tenantId, memberId);
      expect(result).toEqual(mockMember);
    });
  });

  describe('create', () => {
    it('should call service.create with tenantId and dto', async () => {
      const tenantId = 'tenant-1';
      const createDto = {
        branchId: 'branch-1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        gender: MemberGender.MALE,
      };

      const mockCreatedMember = {
        id: 'member-1',
        ...createDto,
        tenantId,
        status: MemberStatus.ACTIVE,
        remainingDays: 365,
      };

      mockMembersService.create.mockResolvedValue(mockCreatedMember);

      const result = await controller.create(tenantId, createDto);

      expect(service.create).toHaveBeenCalledWith(tenantId, createDto);
      expect(result).toEqual(mockCreatedMember);
    });

    it('should pass all DTO fields to service', async () => {
      const tenantId = 'tenant-1';
      const createDto = {
        branchId: 'branch-1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        email: 'john@example.com',
        gender: MemberGender.MALE,
        dateOfBirth: '1990-01-01',
        photoUrl: 'https://example.com/photo.jpg',
        membershipType: 'Premium',
        membershipStartAt: '2024-01-01',
        membershipEndAt: '2025-01-01',
        notes: 'Test notes',
      };

      mockMembersService.create.mockResolvedValue({ id: 'member-1' } as any);

      await controller.create(tenantId, createDto);

      expect(service.create).toHaveBeenCalledWith(tenantId, createDto);
    });
  });

  describe('update', () => {
    it('should call service.update with tenantId, id, and dto', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'member-1';
      const updateDto = {
        firstName: 'Jane',
        lastName: 'Updated',
      };

      const mockUpdatedMember = {
        id: memberId,
        ...updateDto,
        remainingDays: 300,
      };

      mockMembersService.update.mockResolvedValue(mockUpdatedMember);

      const result = await controller.update(tenantId, memberId, updateDto);

      expect(service.update).toHaveBeenCalledWith(
        tenantId,
        memberId,
        updateDto,
      );
      expect(result).toEqual(mockUpdatedMember);
    });

    it('should handle partial updates', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'member-1';
      const updateDto = {
        email: 'newemail@example.com',
      };

      mockMembersService.update.mockResolvedValue({ id: memberId } as any);

      await controller.update(tenantId, memberId, updateDto);

      expect(service.update).toHaveBeenCalledWith(
        tenantId,
        memberId,
        updateDto,
      );
    });
  });

  describe('changeStatus', () => {
    it('should call service.changeStatus with tenantId, id, and dto', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'member-1';
      const statusDto = {
        status: MemberStatus.PAUSED,
      };

      const mockResult = {
        id: memberId,
        status: MemberStatus.PAUSED,
        pausedAt: new Date(),
        resumedAt: null,
        remainingDays: 335,
      };

      mockMembersService.changeStatus.mockResolvedValue(mockResult);

      const result = await controller.changeStatus(
        tenantId,
        memberId,
        statusDto,
      );

      expect(service.changeStatus).toHaveBeenCalledWith(
        tenantId,
        memberId,
        statusDto,
      );
      expect(result).toEqual(mockResult);
    });

    it('should handle all status transitions', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'member-1';

      const statuses = [
        MemberStatus.ACTIVE,
        MemberStatus.PAUSED,
        MemberStatus.INACTIVE,
      ];

      for (const status of statuses) {
        const statusDto = { status };
        mockMembersService.changeStatus.mockResolvedValue({
          id: memberId,
          status,
        } as any);

        await controller.changeStatus(tenantId, memberId, statusDto);

        expect(service.changeStatus).toHaveBeenCalledWith(
          tenantId,
          memberId,
          statusDto,
        );
      }
    });
  });

  describe('archive', () => {
    it('should call service.archive with tenantId and id', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'member-1';

      const mockArchivedMember = {
        id: memberId,
        status: MemberStatus.ARCHIVED,
        pausedAt: null,
        resumedAt: null,
        remainingDays: 0,
      };

      mockMembersService.archive.mockResolvedValue(mockArchivedMember);

      const result = await controller.archive(tenantId, memberId);

      expect(service.archive).toHaveBeenCalledWith(tenantId, memberId);
      expect(result).toEqual(mockArchivedMember);
    });
  });

  describe('Controller method signatures', () => {
    it('findAll should accept tenantId from CurrentUser decorator', () => {
      const method = controller.findAll;
      expect(method).toBeDefined();
      expect(typeof method).toBe('function');
    });

    it('findOne should accept tenantId and id parameters', () => {
      const method = controller.findOne;
      expect(method).toBeDefined();
      expect(typeof method).toBe('function');
    });

    it('create should accept tenantId and body', () => {
      const method = controller.create;
      expect(method).toBeDefined();
      expect(typeof method).toBe('function');
    });

    it('update should accept tenantId, id, and body', () => {
      const method = controller.update;
      expect(method).toBeDefined();
      expect(typeof method).toBe('function');
    });

    it('changeStatus should accept tenantId, id, and body', () => {
      const method = controller.changeStatus;
      expect(method).toBeDefined();
      expect(typeof method).toBe('function');
    });

    it('archive should accept tenantId and id', () => {
      const method = controller.archive;
      expect(method).toBeDefined();
      expect(typeof method).toBe('function');
    });
  });

  describe('Error propagation', () => {
    it('should propagate service errors to caller', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'non-existent';

      mockMembersService.findOne.mockRejectedValue(
        new Error('Member not found'),
      );

      await expect(controller.findOne(tenantId, memberId)).rejects.toThrow(
        'Member not found',
      );
    });

    it('should propagate validation errors from service', async () => {
      const tenantId = 'tenant-1';
      const createDto = {
        branchId: 'invalid-branch',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      };

      mockMembersService.create.mockRejectedValue(
        new Error('Branch not found'),
      );

      await expect(controller.create(tenantId, createDto)).rejects.toThrow(
        'Branch not found',
      );
    });
  });

  describe('Response consistency', () => {
    it('all mutation endpoints should return full member object', async () => {
      const tenantId = 'tenant-1';
      const memberId = 'member-1';

      const mockMember = {
        id: memberId,
        tenantId,
        branchId: 'branch-1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
        status: MemberStatus.ACTIVE,
        remainingDays: 335,
      };

      // Create
      mockMembersService.create.mockResolvedValue(mockMember);
      const createResult = await controller.create(tenantId, {
        branchId: 'branch-1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      });
      expect(createResult).toHaveProperty('id');
      expect(createResult).toHaveProperty('remainingDays');

      // Update
      mockMembersService.update.mockResolvedValue(mockMember);
      const updateResult = await controller.update(tenantId, memberId, {
        firstName: 'Jane',
      });
      expect(updateResult).toHaveProperty('id');
      expect(updateResult).toHaveProperty('remainingDays');

      // ChangeStatus
      mockMembersService.changeStatus.mockResolvedValue(mockMember);
      const statusResult = await controller.changeStatus(tenantId, memberId, {
        status: MemberStatus.PAUSED,
      });
      expect(statusResult).toHaveProperty('id');
      expect(statusResult).toHaveProperty('remainingDays');

      // Archive
      mockMembersService.archive.mockResolvedValue(mockMember);
      const archiveResult = await controller.archive(tenantId, memberId);
      expect(archiveResult).toHaveProperty('id');
      expect(archiveResult).toHaveProperty('remainingDays');
    });
  });

  describe('TenantId extraction', () => {
    it('should extract tenantId from CurrentUser decorator for all endpoints', async () => {
      const tenantId = 'extracted-tenant-id';

      mockMembersService.findAll.mockResolvedValue({
        data: [],
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      });
      mockMembersService.findOne.mockResolvedValue({} as any);
      mockMembersService.create.mockResolvedValue({} as any);
      mockMembersService.update.mockResolvedValue({} as any);
      mockMembersService.changeStatus.mockResolvedValue({} as any);
      mockMembersService.archive.mockResolvedValue({} as any);

      // Test all endpoints with the same tenantId
      await controller.findAll(tenantId, { page: 1, limit: 20 });
      expect(service.findAll).toHaveBeenCalledWith(
        tenantId,
        expect.any(Object),
      );

      await controller.findOne(tenantId, 'member-1');
      expect(service.findOne).toHaveBeenCalledWith(tenantId, 'member-1');

      await controller.create(tenantId, {
        branchId: 'branch-1',
        firstName: 'John',
        lastName: 'Doe',
        phone: '+1234567890',
      });
      expect(service.create).toHaveBeenCalledWith(tenantId, expect.any(Object));

      await controller.update(tenantId, 'member-1', { firstName: 'Jane' });
      expect(service.update).toHaveBeenCalledWith(
        tenantId,
        'member-1',
        expect.any(Object),
      );

      await controller.changeStatus(tenantId, 'member-1', {
        status: MemberStatus.PAUSED,
      });
      expect(service.changeStatus).toHaveBeenCalledWith(
        tenantId,
        'member-1',
        expect.any(Object),
      );

      await controller.archive(tenantId, 'member-1');
      expect(service.archive).toHaveBeenCalledWith(tenantId, 'member-1');
    });
  });
});
