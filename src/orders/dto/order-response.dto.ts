import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus, PackageType } from '@prisma/client';

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  merchantId!: string;

  @ApiProperty()
  pickupAddress!: string;

  @ApiProperty()
  deliveryAddress!: string;

  @ApiProperty({ example: 2.5 })
  packageWeight!: number;

  @ApiProperty({ enum: PackageType })
  packageType!: PackageType;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}
