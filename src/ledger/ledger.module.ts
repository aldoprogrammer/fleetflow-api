import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerController } from './ledger.controller';

@Module({
  imports: [AuthModule],
  controllers: [LedgerController],
})
export class LedgerModule {}
