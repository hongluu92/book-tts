import { applyDecorators, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OwnershipGuard } from './ownership.guard';

export function RequireOwnership() {
  return applyDecorators(UseGuards(JwtAuthGuard, OwnershipGuard));
}
