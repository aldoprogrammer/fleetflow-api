import { ApiProperty } from '@nestjs/swagger';
import { OrderPhotoType } from '@prisma/client';

export class OrderPhotoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderPhotoType })
  type!: OrderPhotoType;

  @ApiProperty()
  url!: string;

  @ApiProperty({ format: 'uuid' })
  uploadedBy!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
