export function filterModelProperties<T extends object>(
  data: T,
  modelType: 'Item' | 'ListItem',
): Partial<T> {
  const itemProperties = new Set([
    'itemId',
    'name',
    'type',
    'units',
    'public',
    'active',
  ]);

  const listItemProperties = new Set([
    'listItemId',
    'itemId',
    'listId',
    'name',
    'type',
    'units',
    'quantity',
    'ongoing',
    'assigneeId',
    'active',
    'completed',
    'deadline',
    'public',
    'deleted',
  ]);

  const allowedProperties =
    modelType === 'Item' ? itemProperties : listItemProperties;

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => allowedProperties.has(key)),
  ) as Partial<T>;
}
