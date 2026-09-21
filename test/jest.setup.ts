import { Test } from '@nestjs/testing';

const createTestingModule = Test.createTestingModule.bind(Test);

Test.createTestingModule = ((metadata) =>
  createTestingModule(metadata).useMocker(() => ({}))) as typeof Test.createTestingModule;
