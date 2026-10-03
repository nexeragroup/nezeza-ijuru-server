import { Injectable } from '@nestjs/common';
@Injectable()
export class BackupsService {
  status() {
    return {
      prepared: false,
      verified: false,
      message:
        'Backup scripts are available; no backup or restore has been verified by this endpoint',
      execution: 'operator-controlled',
      restoreRequiresExplicitApproval: true,
    };
  }
}
