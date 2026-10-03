import { Test, TestingModule } from '@nestjs/testing';
import { InviteesController } from './invitees.controller';
import { InviteesService } from './invitees.service';

describe('InviteesController', () => {
  let controller: InviteesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InviteesController],
      providers: [InviteesService],
    }).compile();

    controller = module.get<InviteesController>(InviteesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
