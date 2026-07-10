import { ApiProperty } from '@nestjs/swagger';
import { PackageType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({
    description: 'Merchant identifier that owns the dispatch order',
    example: '550e8400-e29b-41d4-a716-446655440001',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'merchantId must be a valid UUID v4' })
  merchantId!: string;

  @ApiProperty({
    description: 'Full pickup street address',
    example: 'Jl. Thamrin No. 1, Jakarta Pusat',
    minLength: 8,
    maxLength: 240,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(240)
  pickupAddress!: string;

  @ApiProperty({
    description: 'Full delivery street address',
    example: 'Jl. Sudirman No. 52, Jakarta Selatan',
    minLength: 8,
    maxLength: 240,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(240)
  deliveryAddress!: string;

  @ApiProperty({
    description: 'Package weight in kilograms',
    example: 2.5,
    minimum: 0.1,
    maximum: 1000,
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(1000)
  packageWeight!: number;

  @ApiProperty({
    description: 'Type of package being dispatched',
    enum: PackageType,
    example: PackageType.PARCEL,
  })
  @IsEnum(PackageType, {
    message: `packageType must be one of: ${Object.values(PackageType).join(', ')}`,
  })
  packageType!: PackageType;
}
