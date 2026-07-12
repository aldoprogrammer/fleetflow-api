import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'merchant.admin@acme-commerce.id' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'FleetFlow!2026' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserRole, example: UserRole.MERCHANT_ADMIN })
  @IsEnum(UserRole)
  role!: UserRole;
}
