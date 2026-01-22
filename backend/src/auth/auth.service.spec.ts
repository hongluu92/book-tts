import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import * as argon2 from 'argon2';

// Mock argon2
jest.mock('argon2');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;
  let jwtService: JwtService;

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const hashedPassword = 'hashed_password';
      const user = {
        id: 'user-id',
        email: dto.email,
        createdAt: new Date(),
      };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(null);
      (argon2.hash as jest.Mock).mockResolvedValue(hashedPassword);
      (mockPrismaService.user.create as jest.Mock).mockResolvedValue(user);
      (mockJwtService.signAsync as jest.Mock).mockResolvedValue('token');

      const result = await service.register(dto);

      expect(result.user).toEqual(user);
      expect(result.accessToken).toBeDefined();
      expect(mockPrismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: dto.email,
          passwordHash: hashedPassword,
        },
        select: {
          id: true,
          email: true,
          createdAt: true,
        },
      });
    });

    it('should throw ConflictException if email already exists', async () => {
      const dto = { email: 'existing@example.com', password: 'password123' };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue({
        id: 'existing-id',
        email: dto.email,
      });

      await expect(service.register(dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('should login successfully with valid credentials', async () => {
      const dto = { email: 'test@example.com', password: 'password123' };
      const user = {
        id: 'user-id',
        email: dto.email,
        passwordHash: 'hashed_password',
        createdAt: new Date(),
      };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(true);
      (mockJwtService.signAsync as jest.Mock).mockResolvedValue('token');

      const result = await service.login(dto);

      expect(result.user.email).toBe(dto.email);
      expect(result.accessToken).toBeDefined();
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const dto = { email: 'notfound@example.com', password: 'password123' };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const dto = { email: 'test@example.com', password: 'wrongpassword' };
      const user = {
        id: 'user-id',
        email: dto.email,
        passwordHash: 'hashed_password',
        createdAt: new Date(),
      };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(user);
      (argon2.verify as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('validateUser', () => {
    it('should return user if found', async () => {
      const userId = 'user-id';
      const user = {
        id: userId,
        email: 'test@example.com',
        createdAt: new Date(),
      };

      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(user);

      const result = await service.validateUser(userId);

      expect(result).toEqual(user);
    });

    it('should return null if user not found', async () => {
      (mockPrismaService.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await service.validateUser('non-existent-id');

      expect(result).toBeNull();
    });
  });
});
