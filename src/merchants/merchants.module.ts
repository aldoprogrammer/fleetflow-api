import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MerchantsController } from './merchants.controller';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [MerchantsController],
})
export class MerchantsModule {}
