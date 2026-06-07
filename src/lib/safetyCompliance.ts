import { InventoryItem } from '../shared/types';

export interface ComplianceIssue {
  item: string;
  status: 'missing' | 'insufficient' | 'expired';
  required: number;
  actual: number;
}

export interface ComplianceReport {
  isCompliant: boolean;
  issues: ComplianceIssue[];
  zoneLabel: string;
}

const ZONE_REQUIREMENTS: Record<string, { name: string; min: number; category: string }[]> = {
  '1': [
    { name: 'Balsa salvavidas', min: 1, category: 'Seguridad' },
    { name: 'Radiobaliza (EPIRB)', min: 1, category: 'Seguridad' },
    { name: 'VHF con DSC', min: 1, category: 'Seguridad' },
    { name: 'Bengala', min: 6, category: 'Seguridad' },
    { name: 'Cohete', min: 6, category: 'Seguridad' },
    { name: 'Señal fumígena', min: 2, category: 'Seguridad' },
    { name: 'Chaleco salvavidas', min: 1, category: 'Seguridad' },
  ],
  '2': [
    { name: 'Balsa salvavidas', min: 1, category: 'Seguridad' },
    { name: 'VHF fijo con DSC', min: 1, category: 'Seguridad' },
    { name: 'Bengala', min: 6, category: 'Seguridad' },
    { name: 'Cohete', min: 6, category: 'Seguridad' },
    { name: 'Señal fumígena', min: 1, category: 'Seguridad' },
    { name: 'Chaleco salvavidas', min: 1, category: 'Seguridad' },
  ],
  '4': [
    { name: 'VHF fijo', min: 1, category: 'Seguridad' },
    { name: 'Bengala', min: 3, category: 'Seguridad' },
    { name: 'Cohete', min: 3, category: 'Seguridad' },
    { name: 'Señal fumígena', min: 1, category: 'Seguridad' },
    { name: 'Chaleco salvavidas', min: 1, category: 'Seguridad' },
  ],
  '5': [
    { name: 'Espejo de señales', min: 1, category: 'Seguridad' },
    { name: 'Bocina de niebla', min: 1, category: 'Seguridad' },
    { name: 'Extintor', min: 1, category: 'Seguridad' },
    { name: 'Chaleco salvavidas', min: 1, category: 'Seguridad' },
  ]
};

/**
 * Verifica si el inventario cumple con los requisitos de la zona de navegación.
 */
export const checkSafetyCompliance = (
  inventory: InventoryItem[],
  zone: number,
  crewCount: number = 1
): ComplianceReport => {
  // Mapeo de zonas simplificado según el manual
  const lookupKey = zone === 1 ? '1' : zone <= 3 ? '2' : zone === 4 ? '4' : '5';
  const requirements = ZONE_REQUIREMENTS[lookupKey] || [];
  const issues: ComplianceIssue[] = [];
  const now = new Date();

  requirements.forEach(req => {
    const items = inventory.filter(i => 
      i.nombre.toLowerCase().includes(req.name.toLowerCase())
    );

    const actualQty = items.reduce((sum, i) => sum + i.cantidad_actual, 0);
    const requiredQty = req.name.includes('Chaleco') ? crewCount : req.min;

    if (items.length === 0) {
      issues.push({ item: req.name, status: 'missing', required: requiredQty, actual: 0 });
    } else {
      if (actualQty < requiredQty) {
        issues.push({ item: req.name, status: 'insufficient', required: requiredQty, actual: actualQty });
      }
      
      items.forEach(i => {
        if (i.fecha_caducidad && new Date(i.fecha_caducidad) < now) {
          issues.push({ item: i.nombre, status: 'expired', required: requiredQty, actual: i.cantidad_actual });
        }
      });
    }
  });

  const zoneLabels: Record<number, string> = { 1: 'Zona 1 (Oceánica)', 2: 'Zona 2 (60mn)', 4: 'Zona 4 (12mn)', 5: 'Zona 5-7 (Local)' };

  return {
    isCompliant: issues.length === 0,
    issues,
    zoneLabel: zoneLabels[zone as keyof typeof zoneLabels] || `Zona ${zone}`
  };
};
