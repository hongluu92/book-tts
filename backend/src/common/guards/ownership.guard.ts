import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OwnershipGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const bookId = request.params.bookId;

    if (!bookId) {
      // If no bookId in params, allow (will be checked in controller)
      return true;
    }

    // Find book and check ownership
    const book = await this.prisma.book.findUnique({
      where: { id: bookId },
      select: { ownerUserId: true },
    });

    if (!book) {
      throw new NotFoundException('Book not found');
    }

    if (book.ownerUserId !== user.sub) {
      throw new ForbiddenException('You do not have access to this book');
    }

    return true;
  }
}
