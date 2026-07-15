import { ApiProperty } from '@nestjs/swagger';
import { OrderPhotoType } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UploadOrderPhotoDto {
  @ApiProperty({ enum: OrderPhotoType, example: OrderPhotoType.DEPARTURE })
  @IsEnum(OrderPhotoType)
  type!: OrderPhotoType;
}
