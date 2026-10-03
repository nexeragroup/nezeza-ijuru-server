import { IsString } from 'class-validator';
import { BulkCreatePipe } from './bulk-create.pipe';

class BulkItemDto {
  @IsString()
  name!: string;
}

describe('BulkCreatePipe', () => {
  const pipe = new BulkCreatePipe(BulkItemDto);

  it('rejects a non-array body', async () => {
    await expect(pipe.transform({ name: 'Nexera' })).rejects.toThrow(
      'Expected an array of items',
    );
  });

  it('validates every bulk item', async () => {
    await expect(
      pipe.transform([{ name: 'Nexera' }, { name: 42 }]),
    ).rejects.toThrow('Bulk item 2 is invalid');
  });
});
