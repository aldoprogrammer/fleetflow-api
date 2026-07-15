import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class TripAdvanceDto {
  @ApiPropertyOptional({
    description:
      'Required for operations users when advancing a trip without proof photos.',
    example: 'Customer unavailable at drop-off; manual completion approved.',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  overrideReason?: string;
}
