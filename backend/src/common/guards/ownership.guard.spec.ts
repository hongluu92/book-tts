import { ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import { OwnershipGuard } from './ownership.guard';
import { PrismaService } from '../../prisma/prisma.service';

describe('OwnershipGuard', () => {
  let guard: OwnershipGuard;
  let prisma: PrismaService;

  const mockPrismaService = {
    book: {
      findUnique: jest.fn(),
    },
  };

  const createMockContext = (user: any, bookId?: string) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          user,
          params: { bookId },
        }),
      }),
    } as ExecutionContext;
  };

  beforeEach(() => {
    guard = new OwnershipGuard(mockPrismaService as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should allow access if no bookId in params', async () => {
    const context = createMockContext({ sub: 'user-id' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should allow access if user owns the book', async () => {
    const userId = 'user-id';
    const bookId = 'book-id';
    const context = createMockContext({ sub: userId }, bookId);

    (mockPrismaService.book.findUnique as jest.Mock).mockResolvedValue({
      ownerUserId: userId,
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
  });

  it('should throw NotFoundException if book not found', async () => {
    const bookId = 'non-existent-id';
    const context = createMockContext({ sub: 'user-id' }, bookId);

    (mockPrismaService.book.findUnique as jest.Mock).mockResolvedValue(null);

    await expect(guard.canActivate(context)).rejects.toThrow(NotFoundException);
  });

  it('should throw ForbiddenException if user does not own the book', async () => {
    const userId = 'user-id';
    const otherUserId = 'other-user-id';
    const bookId = 'book-id';
    const context = createMockContext({ sub: userId }, bookId);

    (mockPrismaService.book.findUnique as jest.Mock).mockResolvedValue({
      ownerUserId: otherUserId,
    });

    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
  });
});
