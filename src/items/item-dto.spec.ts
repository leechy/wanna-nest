import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from './dto/item.dto';

describe('CreateItemDto', () => {
  it('accepts the quantity as a string, like the app sends it', async () => {
    const dto = plainToInstance(CreateItemDto, {
      listId: 'list',
      name: 'Milk',
      quantity: '2',
    });

    expect(await validate(dto)).toEqual([]);
    expect(dto.quantity).toBe(2);
  });
});
