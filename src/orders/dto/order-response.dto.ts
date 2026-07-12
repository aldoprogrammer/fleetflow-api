import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus, UserRole, VehicleType } from '@prisma/client';

export class OrderTimelineItemDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty()
  note!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class AssignedDriverDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  fullName!: string;

  @ApiProperty()
  phone!: string;

  @ApiProperty({ enum: VehicleType })
  vehicleType!: VehicleType;
}

export class OrderMerchantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  companyName!: string;

  @ApiProperty()
  email!: string;
}

export class OrderPartyDto {
  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;
}

export class OrderResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '#BEC1E19' })
  referenceCode!: string;

  @ApiProperty({ example: 'Dispatch to Jl. Sudirman No. 52' })
  displayTitle!: string;

  @ApiProperty({ format: 'uuid' })
  merchantId!: string;

  @ApiProperty({ type: OrderMerchantDto })
  merchant!: OrderMerchantDto;

  @ApiPropertyOptional({ type: OrderPartyDto })
  merchantContact?: OrderPartyDto | null;

  @ApiPropertyOptional({ type: OrderPartyDto })
  createdBy?: OrderPartyDto | null;

  @ApiProperty({ enum: VehicleType })
  vehicleTypeRequired!: VehicleType;

  @ApiPropertyOptional()
  packageDescription?: string | null;

  @ApiPropertyOptional()
  packageWeightKg?: number | null;

  @ApiProperty()
  pickupAddress!: string;

  @ApiProperty()
  deliveryAddress!: string;

  @ApiProperty()
  pickupLat!: number;

  @ApiProperty()
  pickupLng!: number;

  @ApiProperty()
  deliveryLat!: number;

  @ApiProperty()
  deliveryLng!: number;

  @ApiProperty()
  distanceKm!: number;

  @ApiProperty({ enum: OrderStatus })
  status!: OrderStatus;

  @ApiProperty({ enum: ['PAID', 'UNPAID', 'NOT_CHARGED'] })
  paymentStatus!: 'PAID' | 'UNPAID' | 'NOT_CHARGED';

  @ApiProperty()
  price!: number;

  @ApiPropertyOptional()
  matchDistanceKm?: number | null;

  @ApiPropertyOptional({ type: AssignedDriverDto })
  assignedDriver?: AssignedDriverDto | null;

  @ApiProperty({ type: [OrderTimelineItemDto] })
  timeline!: OrderTimelineItemDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}
