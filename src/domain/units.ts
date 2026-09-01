import { AppPreferences } from './preferences';

const KG_TO_LB = 2.2046226218;
const CM_TO_IN = 0.3937007874;

export function displayWeight(valueKg: number, unit: AppPreferences['weightUnit']) { return unit === 'lb' ? valueKg * KG_TO_LB : valueKg; }
export function weightToKg(value: number, unit: AppPreferences['weightUnit']) { return unit === 'lb' ? value / KG_TO_LB : value; }
export function displayBodyLength(valueCm: number, unit: AppPreferences['bodyUnit']) { return unit === 'in' ? valueCm * CM_TO_IN : valueCm; }
export function bodyLengthToCm(value: number, unit: AppPreferences['bodyUnit']) { return unit === 'in' ? value / CM_TO_IN : value; }
export function formatDecimal(value: number, digits = 1) { return Number(value.toFixed(digits)).toString(); }
