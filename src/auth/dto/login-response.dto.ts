import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';

export class AuthUserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserRole })
  role!: UserRole;

  @ApiProperty()
  displayName!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  merchantId?: string | null;

  @ApiPropertyOptional({ format: 'uuid' })
  driverId?: string | null;

  @ApiProperty({ type: [String] })
  permissions!: string[];
}

export class LoginResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ example: 604800 })
  expiresIn!: number;

  @ApiProperty({ example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}
