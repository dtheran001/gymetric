import { BodyMeasurement, BodyProfile } from './types';

export type RangeStatus = 'low' | 'healthy' | 'high' | 'very_high' | 'unknown';
type BodySex = NonNullable<BodyProfile['sex']>;

export type BodyMetricSummary = {
  label: string;
  status: RangeStatus;
  description: string;
};

export function calculateBmi(profile?: BodyProfile | null, measurement?: BodyMeasurement | null) {
  if (!profile?.heightCm || !measurement?.weightKg) {
    return null;
  }

  const heightM = profile.heightCm / 100;
  return measurement.weightKg / (heightM * heightM);
}

export function getBmiSummary(bmi: number | null): BodyMetricSummary {
  if (!bmi) {
    return { label: 'Sin datos', status: 'unknown', description: 'Añade altura y peso para calcularlo.' };
  }

  if (bmi < 18.5) {
    return { label: 'Peso bajo', status: 'low', description: 'Por debajo del rango saludable general.' };
  }
  if (bmi < 25) {
    return { label: 'Saludable', status: 'healthy', description: 'Dentro del rango saludable general.' };
  }
  if (bmi < 30) {
    return { label: 'Sobrepeso', status: 'high', description: 'Por encima del rango saludable general.' };
  }

  return { label: 'Obesidad', status: 'very_high', description: 'Muy por encima del rango saludable general.' };
}

export function getBodyFatSummary(value?: number, sex: BodySex = 'male'): BodyMetricSummary {
  if (!value) {
    return { label: 'Sin datos', status: 'unknown', description: 'Registra el porcentaje de grasa.' };
  }

  const ranges = sex === 'female'
    ? { low: 14, healthyMax: 31, highMax: 39 }
    : { low: 6, healthyMax: 24, highMax: 30 };

  if (value < ranges.low) {
    return { label: 'Bajo', status: 'low', description: 'Nivel bajo de grasa corporal.' };
  }
  if (value <= ranges.healthyMax) {
    return { label: 'Saludable', status: 'healthy', description: `Rango saludable orientativo para ${sex === 'female' ? 'mujer' : 'hombre'}.` };
  }
  if (value <= ranges.highMax) {
    return { label: 'Elevado', status: 'high', description: 'Algo por encima del rango objetivo.' };
  }
  return { label: 'Muy elevado', status: 'very_high', description: 'Conviene vigilar la tendencia.' };
}

export function getWaterSummary(value?: number, sex: BodySex = 'male'): BodyMetricSummary {
  if (!value) {
    return { label: 'Sin datos', status: 'unknown', description: 'Registra el porcentaje de agua.' };
  }

  const min = sex === 'female' ? 45 : 50;
  const max = sex === 'female' ? 60 : 65;

  if (value < min) {
    return { label: 'Bajo', status: 'low', description: 'Hidratacion corporal baja orientativa.' };
  }
  if (value <= max) {
    return { label: 'Saludable', status: 'healthy', description: 'Rango habitual saludable.' };
  }
  return { label: 'Alto', status: 'high', description: 'Por encima del rango habitual.' };
}

export function getMuscleSummary(value?: number, sex: BodySex = 'male'): BodyMetricSummary {
  if (!value) {
    return { label: 'Sin datos', status: 'unknown', description: 'Registra el porcentaje muscular.' };
  }

  const min = sex === 'female' ? 60 : 70;
  const high = sex === 'female' ? 78 : 85;

  if (value < min) {
    return { label: 'Mejorable', status: 'low', description: 'Masa muscular baja orientativa.' };
  }
  if (value <= high) {
    return { label: 'Saludable', status: 'healthy', description: 'Buen rango muscular orientativo.' };
  }
  return { label: 'Alto', status: 'high', description: 'Masa muscular alta orientativa.' };
}

export function getBoneSummary(value?: number, sex: BodySex = 'male'): BodyMetricSummary {
  if (!value) {
    return { label: 'Sin datos', status: 'unknown', description: 'Registra el porcentaje oseo.' };
  }

  const min = sex === 'female' ? 2.4 : 3;
  const max = sex === 'female' ? 4.2 : 5;

  if (value < min) {
    return { label: 'Bajo', status: 'low', description: 'Masa osea baja orientativa.' };
  }
  if (value <= max) {
    return { label: 'Saludable', status: 'healthy', description: 'Rango oseo habitual.' };
  }
  return { label: 'Alto', status: 'high', description: 'Por encima del rango habitual.' };
}

export function estimateHeightForBmi(weightKg: number, targetBmi: number) {
  if (!weightKg || !targetBmi) {
    return null;
  }

  return Math.sqrt(weightKg / targetBmi) * 100;
}

export function getLatestMeasurement(measurements: BodyMeasurement[]) {
  return [...measurements].sort((a, b) => Date.parse(b.measuredAt) - Date.parse(a.measuredAt))[0] ?? null;
}

export function formatMeasurementDate(value: string) {
  return new Intl.DateTimeFormat('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}
