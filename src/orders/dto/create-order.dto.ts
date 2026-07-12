import { ApiProperty } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ enum: VehicleType, example: VehicleType.CAR })
  @IsEnum(VehicleType)
  vehicleTypeRequired!: VehicleType;

  @ApiProperty({ example: 'Jl. Thamrin No. 1, Jakarta Pusat' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(240)
  pickupAddress!: string;

  @ApiProperty({ example: 'Jl. Sudirman No. 52, Jakarta Selatan' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(240)
  deliveryAddress!: string;

  @ApiProperty({ example: -6.2 })
  @Type(() => Number)
  @IsLatitude()
  pickupLat!: number;

  @ApiProperty({ example: 106.816666 })
  @Type(() => Number)
  @IsLongitude()
  pickupLng!: number;

  @ApiProperty({ example: -6.17511 })
  @Type(() => Number)
  @IsLatitude()
  deliveryLat!: number;

  @ApiProperty({ example: 106.865036 })
  @Type(() => Number)
  @IsLongitude()
  deliveryLng!: number;

  @ApiProperty({
    required: false,
    description:
      'Required for platform roles without a linked merchant (e.g. Super Admin).',
  })
  @IsOptional()
  @IsUUID('4')
  merchantId?: string;

  @ApiProperty({
    required: false,
    example: '2 boxes electronics — fragile, handle with care',
    description: 'Optional parcel summary for dispatch and driver briefing.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  packageDescription?: string;

  @ApiProperty({
    required: false,
    example: 4.5,
    description: 'Optional parcel weight in kilograms.',
  })
  @IsOptional()
  @Type(() => Number)
  packageWeightKg?: number;
}
