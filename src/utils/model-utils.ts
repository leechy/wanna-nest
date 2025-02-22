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
    'deleted',
  ]);

  const listItemProperties = new Set([
    'itemId',
    'listId',
    'name',
    'type',
    'units',
    'assigneeId',
    'active',
    'completed',
    'deadline',
    'deleted',
  ]);

  const allowedProperties =
    modelType === 'Item' ? itemProperties : listItemProperties;

  return Object.fromEntries(
    Object.entries(data).filter(([key]) => allowedProperties.has(key)),
  ) as Partial<T>;
}
