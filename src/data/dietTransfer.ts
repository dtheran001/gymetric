import { Diet } from '../domain/types';

export const DIET_TRANSFER_FORMAT = 'gymetric-diets';

export function buildDietTransferFile(diets: Diet[]) {
  return { format: DIET_TRANSFER_FORMAT, schemaVersion: 1, exportedAt: new Date().toISOString(), diets };
}

export function parseDietTransferFile(raw: string): Diet[] {
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.format !== DIET_TRANSFER_FORMAT || value.schemaVersion !== 1 || !Array.isArray(value.diets)) {
    throw new Error('El archivo no tiene un formato de dietas compatible con Gymetric.');
  }
  if (!value.diets.length || !value.diets.every(isDiet)) {
    throw new Error('El archivo no contiene dietas válidas.');
  }
  const now = Date.now();
  return value.diets.map((diet, index) => ({
    ...diet,
    id: `diet-import-${now}-${index}`,
    isCurrent: false,
    createdAt: new Date().toISOString(),
    days: diet.days.map((day, dayIndex) => ({
      ...day,
      id: `diet-day-import-${now}-${index}-${dayIndex}`,
      meals: day.meals.map((meal, mealIndex) => ({
        ...meal,
        id: `diet-meal-import-${now}-${index}-${dayIndex}-${mealIndex}`,
        items: meal.items?.map((item, itemIndex) => ({
          ...item,
          id: `diet-item-import-${now}-${index}-${dayIndex}-${mealIndex}-${itemIndex}`,
        })),
        entries: meal.entries?.map((entry, entryIndex) =>
          entry.type === 'item'
            ? { ...entry, id: `diet-entry-import-${now}-${index}-${dayIndex}-${mealIndex}-${entryIndex}`, item: { ...entry.item, id: `diet-entry-item-import-${now}-${index}-${dayIndex}-${mealIndex}-${entryIndex}` } }
            : {
                ...entry,
                id: `diet-entry-import-${now}-${index}-${dayIndex}-${mealIndex}-${entryIndex}`,
                options: entry.options.map((option, optionIndex) => ({
                  ...option,
                  id: `diet-option-import-${now}-${index}-${dayIndex}-${mealIndex}-${entryIndex}-${optionIndex}`,
                  items: option.items.map((item, itemIndex) => ({ ...item, id: `diet-option-item-import-${now}-${index}-${dayIndex}-${mealIndex}-${entryIndex}-${optionIndex}-${itemIndex}` })),
                })),
              },
        ),
      })),
    })),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isDiet(value: unknown): value is Diet {
  return isRecord(value) && typeof value.name === 'string' && Array.isArray(value.days) && value.days.every(
    (day) => isRecord(day) && typeof day.name === 'string' && Array.isArray(day.meals) && day.meals.every(
      (meal) => isRecord(meal) && typeof meal.name === 'string' &&
        (!('items' in meal) || (Array.isArray(meal.items) && meal.items.every((item) => isRecord(item) && typeof item.name === 'string'))) &&
        (!('entries' in meal) || (Array.isArray(meal.entries) && meal.entries.every(isDietEntry))),
    ),
  );
}

function isDietEntry(value: unknown) {
  if (!isRecord(value) || typeof value.id !== 'string') return false;
  if (value.type === 'item') return isRecord(value.item) && typeof value.item.name === 'string';
  return value.type === 'choice' && Array.isArray(value.options) && value.options.every(
    (option) => isRecord(option) && Array.isArray(option.items) && option.items.every(
      (item) => isRecord(item) && typeof item.name === 'string',
    ),
  );
}
