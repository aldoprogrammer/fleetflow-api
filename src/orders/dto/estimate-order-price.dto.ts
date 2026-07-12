import { ApiProperty } from '@nestjs/swagger';
import { VehicleType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsLatitude, IsLongitude } from 'class-validator';

export class EstimateOrderPriceDto {
  @ApiProperty({ enum: VehicleType, example: VehicleType.BIKE })
  @IsEnum(VehicleType)
  vehicleTypeRequired!: VehicleType;

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
}
