import { Global, Module } from '@nestjs/common';
import { CommonModule } from '../../common/common.module';
import { GatewayCryptoService } from './crypto.service';
import { GatewayReplayProtectionService } from './gateway-replay-protection.service';

@Global()
@Module({
  imports: [CommonModule],
  providers: [GatewayCryptoService, GatewayReplayProtectionService],
  exports: [GatewayCryptoService],
})
export class CryptoModule {}
