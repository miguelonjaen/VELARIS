// Vademécum Náutico - Datos Completos

export interface AcousticSignal {
  id: string;
  label: string;
  description: string;
  pattern: number[];
  type: 'Maniobra' | 'Alerta' | 'Operativa' | 'Emergencia';
  details: string;
}

export interface NauticalFlag {
  char: string;
  meaning: string;
  img: string;
  phonetic: string;
  usage: string;
}

export interface NauticalKnot {
  id: string;
  name: string;
  description: string;
  usage: string;
  steps: string[];
  difficulty: 'Básico' | 'Intermedio' | 'Avanzado';
}

export interface NauticalTerm {
  term: string;
  english: string;
  definition: string;
  context: string;
}

export interface RadioFrequency {
  frequency: string;
  band: string;
  usage: string;
  details: string;
  priority: 'Alta' | 'Media' | 'Baja';
}

export interface MaritimePriority {
  order: number;
  signal: string;
  meaning: string;
  action: string;
  urgency: 'Crítica' | 'Alta' | 'Media' | 'Baja';
}

export interface SeaBeacon {
  type: string;
  color: string;
  meaning: string;
  light?: string;
  frequency?: string;
}

export interface CloudType {
  name: string;
  altitude: string;
  description: string;
  symbol: string;
  weather: string;
}

export const ACOUSTIC_SIGNALS: AcousticSignal[] = [
  {
    id: 's1',
    label: 'Una Pitada Corta',
    description: 'Caigo a Estribor',
    pattern: [1],
    type: 'Maniobra',
    details: 'Señal de maniobra indicando cambio de rumbo hacia la derecha del buque.'
  },
  {
    id: 's2',
    label: 'Dos Pitadas Cortas',
    description: 'Caigo a Babor',
    pattern: [1, 1],
    type: 'Maniobra',
    details: 'Señal de maniobra indicando cambio de rumbo hacia la izquierda del buque.'
  },
  {
    id: 's3',
    label: 'Tres Pitadas Cortas',
    description: 'Dando Atrás',
    pattern: [1, 1, 1],
    type: 'Maniobra',
    details: 'Indicación de marcha atrás o inversión de movimiento del buque.'
  },
  {
    id: 's4',
    label: 'Dos Pitadas Largas',
    description: 'Dejando caer ancla / Fondeando',
    pattern: [2, 2],
    type: 'Maniobra',
    details: 'Señal que indica que el buque está fondeando o soltando ancla.'
  },
  {
    id: 's5',
    label: 'Cinco Pitadas Cortas',
    description: 'Duda / Peligro Inmediato',
    pattern: [1, 1, 1, 1, 1],
    type: 'Alerta',
    details: 'Señal de alerta máxima indicando peligro inminente o dudas sobre maniobra.'
  },
  {
    id: 's6',
    label: 'Pitada Continua',
    description: 'Niebla / Visibilidad Reducida',
    pattern: [3],
    type: 'Alerta',
    details: 'Señal continua emitida en niebla o con visibilidad reducida para advertir presencia del buque.'
  },
  {
    id: 's7',
    label: 'Una Larga + Dos Cortas',
    description: 'Navegación Restringida (Piloto a Bordo)',
    pattern: [2, 1, 1],
    type: 'Alerta',
    details: 'Indica que el buque está bajo control de un práctico o tiene restricciones de movimiento.'
  },
  {
    id: 's8',
    label: 'Una Larga',
    description: 'Salida de Puerto',
    pattern: [2],
    type: 'Operativa',
    details: 'Señal tradicional indicando que el buque está zarpando de puerto.'
  },
  {
    id: 's9',
    label: 'Dos Largas',
    description: 'Llegada a Puerto',
    pattern: [2, 2],
    type: 'Operativa',
    details: 'Señal tradicional indicando que el buque está llegando o ha llegado a puerto.'
  },
  {
    id: 's10',
    label: 'Una Corta + Una Larga',
    description: 'Solicitud de Paso',
    pattern: [1, 2],
    type: 'Operativa',
    details: 'Solicitud respetuosa de paso o autorización para realizar una maniobra.'
  },
  {
    id: 's11',
    label: 'SOS (3-3-3)',
    description: 'Señal de Angustia - Auxilio Inmediato',
    pattern: [1, 1, 1, 2, 2, 2, 1, 1, 1],
    type: 'Emergencia',
    details: 'Señal internacional de máxima emergencia: tres cortas, tres largas, tres cortas. Requiere asistencia inmediata.'
  },
  {
    id: 's12',
    label: 'Pitadas Irregulares',
    description: 'Persona al Agua',
    pattern: [1, 1, 1, 0.5, 1, 1, 1],
    type: 'Emergencia',
    details: 'Patrón irregular de pitadas indicando presencia de persona en el agua que requiere rescate urgente.'
  }
];

export const NAUTICAL_FLAGS: NauticalFlag[] = [
  { char: 'A', phonetic: 'Alfa', meaning: 'Buzo sumergido; manténgase alejado.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Alpha_flag.svg/100px-Alpha_flag.svg.png', usage: 'Operativa' },
  { char: 'B', phonetic: 'Bravo', meaning: 'Carga peligrosa / Materiales inflamables a bordo.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Bravo_flag.svg/100px-Bravo_flag.svg.png', usage: 'Seguridad' },
  { char: 'C', phonetic: 'Charlie', meaning: 'Afirmativo (Sí, entendido correctamente).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Charlie_flag.svg/100px-Charlie_flag.svg.png', usage: 'Comunicaciones' },
  { char: 'D', phonetic: 'Delta', meaning: 'Manténgase alejado; realizo operaciones de buceo.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Delta_flag.svg/100px-Delta_flag.svg.png', usage: 'Operativa' },
  { char: 'E', phonetic: 'Echo', meaning: 'Estoy cambiando de rumbo hacia babor (izquierda).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Echo_flag.svg/100px-Echo_flag.svg.png', usage: 'Maniobra' },
  { char: 'F', phonetic: 'Foxtrot', meaning: 'Deshabilitado; comuníquese conmigo.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Foxtrot_flag.svg/100px-Foxtrot_flag.svg.png', usage: 'Emergencia' },
  { char: 'G', phonetic: 'Golf', meaning: 'Requiero piloto.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Golf_flag.svg/100px-Golf_flag.svg.png', usage: 'Operativa' },
  { char: 'H', phonetic: 'Hotel', meaning: 'Tengo buzo en el agua; manténgase alejado.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Hotel_flag.svg/100px-Hotel_flag.svg.png', usage: 'Seguridad' },
  { char: 'I', phonetic: 'India', meaning: 'Estoy cambiando de rumbo hacia estribor (derecha).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/India_flag.svg/100px-India_flag.svg.png', usage: 'Maniobra' },
  { char: 'J', phonetic: 'Juliett', meaning: 'Fuego a bordo; peligro grave, manténgase alejado.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Juliett_flag.svg/100px-Juliett_flag.svg.png', usage: 'Emergencia' },
  { char: 'K', phonetic: 'Kilo', meaning: 'Deseo comunicarme con usted.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Kilo_flag.svg/100px-Kilo_flag.svg.png', usage: 'Comunicaciones' },
  { char: 'L', phonetic: 'Lima', meaning: 'Deténgase inmediatamente.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Lima_flag.svg/100px-Lima_flag.svg.png', usage: 'Maniobra' },
  { char: 'M', phonetic: 'Mike', meaning: 'Mis redes están trabadas; requiero asistencia.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Mike_flag.svg/100px-Mike_flag.svg.png', usage: 'Emergencia' },
  { char: 'N', phonetic: 'November', meaning: 'Negativo (No, no entendido).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/November_flag.svg/100px-November_flag.svg.png', usage: 'Comunicaciones' },
  { char: 'O', phonetic: 'Oscar', meaning: 'Hombre al agua (Persona en el agua).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Oscar_flag.svg/100px-Oscar_flag.svg.png', usage: 'Emergencia' },
  { char: 'P', phonetic: 'Papa', meaning: 'En puerto - Todos desalojen inmediatamente.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Papa_flag.svg/100px-Papa_flag.svg.png', usage: 'Operativa' },
  { char: 'Q', phonetic: 'Quebec', meaning: 'Mi buque está sano; solicito libre práctica.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Quebec_flag.svg/100px-Quebec_flag.svg.png', usage: 'Operativa' },
  { char: 'R', phonetic: 'Romeo', meaning: 'Requiero asistencia / Solicito ayuda.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Romeo_flag.svg/100px-Romeo_flag.svg.png', usage: 'Emergencia' },
  { char: 'S', phonetic: 'Sierra', meaning: 'Estoy dando marcha atrás.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Sierra_flag.svg/100px-Sierra_flag.svg.png', usage: 'Maniobra' },
  { char: 'T', phonetic: 'Tango', meaning: 'Manténgase alejado; muevo redes de pesca.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Tango_flag.svg/100px-Tango_flag.svg.png', usage: 'Operativa' },
  { char: 'U', phonetic: 'Uniform', meaning: 'Usted navega hacia peligro.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Uniform_flag.svg/100px-Uniform_flag.svg.png', usage: 'Alerta' },
  { char: 'V', phonetic: 'Victor', meaning: 'Requiero asistencia inmediata.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Victor_flag.svg/100px-Victor_flag.svg.png', usage: 'Emergencia' },
  { char: 'W', phonetic: 'Whiskey', meaning: 'Requiero asistencia médica urgente.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Whiskey_flag.svg/100px-Whiskey_flag.svg.png', usage: 'Emergencia' },
  { char: 'X', phonetic: 'Xray', meaning: 'Cese de lo que está haciendo; preste atención.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Xray_flag.svg/100px-Xray_flag.svg.png', usage: 'Maniobra' },
  { char: 'Y', phonetic: 'Yankee', meaning: 'Estoy fondeado.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Yankee_flag.svg/100px-Yankee_flag.svg.png', usage: 'Operativa' },
  { char: 'Z', phonetic: 'Zulu', meaning: 'Estoy fondeando explosivos o en dificultad extrema.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Zulu_flag.svg/100px-Zulu_flag.svg.png', usage: 'Emergencia' }
];

export const NAUTICAL_KNOTS: NauticalKnot[] = [
  {
    id: 'k1',
    name: 'Nudo de Vuelta y Media',
    description: 'Nudo básico para amarrar una cuerda a un poste o argolla.',
    usage: 'Amarre temporal rápido. Muy utilizado en puertos para fondeo.',
    steps: ['1. Rodea la argolla con la cuerda', '2. Pasa el cabo por debajo', '3. Cruza el cabo sobre sí mismo', '4. Pasa por dentro del bucle', '5. Aprieta firmemente'],
    difficulty: 'Básico'
  },
  {
    id: 'k2',
    name: 'Nudo de Pescador',
    description: 'Une dos cuerdas de diferente grosor de forma segura.',
    usage: 'Unión de dos cabos. Ideal cuando hay diferencia de diámetro.',
    steps: ['1. Cruza los dos cabos', '2. Haz un nudo simple con el primer cabo alrededor del segundo', '3. Repite con el otro cabo', '4. Aprieta ambos nudos juntos'],
    difficulty: 'Básico'
  },
  {
    id: 'k3',
    name: 'Ballestrinque',
    description: 'Nudo versátil y rápido para amarre temporal.',
    usage: 'Amarre temporal en operaciones rápidas. Fácil de soltar.',
    steps: ['1. Rodea el poste con el cabo', '2. Cruza el cabo formando una X', '3. Pasa por debajo', '4. Cruza nuevamente', '5. Ajusta tirando del extremo'],
    difficulty: 'Básico'
  },
  {
    id: 'k4',
    name: 'Nudo de Ocho',
    description: 'Nudo de tope que impide que una cuerda se deslice.',
    usage: 'Asegurar extremos de cabo. Prevenir desgarrones.',
    steps: ['1. Forma un bucle con el cabo', '2. Pasa el extremo por debajo', '3. Rodea el bucle principal', '4. Pasa por el bucle original', '5. Aprieta'],
    difficulty: 'Básico'
  },
  {
    id: 'k5',
    name: 'Nudo de Rizos',
    description: 'Une dos cabos del mismo grosor de forma segura.',
    usage: 'Unión de dos cabos similares. Muy resistente.',
    steps: ['1. Cruza los dos cabos', '2. Haz un nudo simple derecha-sobre-izquierda', '3. Repite izquierda-sobre-derecha', '4. Aprieta ambos extremos', '5. Verifica la simetría'],
    difficulty: 'Intermedio'
  },
  {
    id: 'k6',
    name: 'As de Guía',
    description: 'Forma un bucle fijo que no se desliza.',
    usage: 'Crear punto de amarre móvil. Muy versátil.',
    steps: ['1. Forma un bucle con el cabo', '2. Pasa el extremo por dentro del bucle', '3. Rodea la parte principal del cabo', '4. Vuelve a pasar por el bucle', '5. Aprieta'],
    difficulty: 'Intermedio'
  },
  {
    id: 'k7',
    name: 'Nudo de Cordonero',
    description: 'Nudo muy resistente para unir cabos permanentemente.',
    usage: 'Empalme permanente. Muy seguro pero difícil de soltar.',
    steps: ['1. Deshilacha los extremos de ambos cabos', '2. Entrelaza las fibras', '3. Aprieta fuertemente', '4. Cubre con cinta de empalme', '5. Verifica la resistencia'],
    difficulty: 'Avanzado'
  },
  {
    id: 'k8',
    name: 'Nudo de Margarita',
    description: 'Nudo decorativo y funcional de múltiples vueltas.',
    usage: 'Estética y seguridad. Elementos decorativos.',
    steps: ['1. Forma bucles sucesivos', '2. Deja que cada bucle atraviese el siguiente', '3. Crea un patrón de flor', '4. Aprieta desde el centro hacia afuera'],
    difficulty: 'Avanzado'
  }
];

export const RADIO_FREQUENCIES: RadioFrequency[] = [
  {
    frequency: '156.800 MHz',
    band: 'VHF - Canal 16',
    usage: 'Emergencias y contacto inicial',
    details: 'Frecuencia internacional de llamada. Obligatoria monitoreación 24/7 en navegación',
    priority: 'Alta'
  },
  {
    frequency: '121.500 MHz',
    band: 'Aviación',
    usage: 'Emergencias aeronáuticas y marítimas',
    details: 'Frecuencia internacional de emergencia para aviación',
    priority: 'Alta'
  },
  {
    frequency: '500 kHz',
    band: 'Onda Media',
    usage: 'Emergencias y navegación',
    details: 'Frecuencia histórica de emergencia SOS',
    priority: 'Alta'
  },
  {
    frequency: '156.300 MHz',
    band: 'VHF - Canal 1',
    usage: 'Navegación costera',
    details: 'Comunicación entre buques a corta distancia',
    priority: 'Media'
  },
  {
    frequency: '2182 kHz',
    band: 'Onda Media',
    usage: 'Llamada de emergencia',
    details: 'Frecuencia internacional de emergencia marítima',
    priority: 'Alta'
  },
  {
    frequency: '156.65 MHz',
    band: 'VHF - Canal 13',
    usage: 'Tráfico puertos y escluses',
    details: 'Navegación en canales y puertos',
    priority: 'Media'
  }
];

export const MARITIME_PRIORITIES: MaritimePriority[] = [
  {
    order: 1,
    signal: 'MAYDAY MAYDAY MAYDAY',
    meaning: 'Emergencia extrema - vida en peligro',
    action: 'Responder inmediatamente con recursos de rescate',
    urgency: 'Crítica'
  },
  {
    order: 2,
    signal: 'PAN PAN PAN',
    meaning: 'Urgencia - situación grave pero controlada',
    action: 'Responder y ofrecer asistencia',
    urgency: 'Alta'
  },
  {
    order: 3,
    signal: 'SECURITÉ SECURITÉ SECURITÉ',
    meaning: 'Aviso de seguridad importante',
    action: 'Prestar atención a la información',
    urgency: 'Media'
  },
  {
    order: 4,
    signal: 'Llamada de rutina en Canal 16',
    meaning: 'Comunicación normal entre buques',
    action: 'Cambiar a canal de trabajo',
    urgency: 'Baja'
  }
];

export const SEA_BEACONS: SeaBeacon[] = [
  {
    type: 'Boya Lateral Babor',
    color: 'Roja',
    meaning: 'Mantener a la izquierda al entrar a puerto',
    light: 'Luz roja (intermitente)',
    frequency: 'Según proximidad'
  },
  {
    type: 'Boya Lateral Estribor',
    color: 'Verde/Blanca',
    meaning: 'Mantener a la derecha al entrar a puerto',
    light: 'Luz verde (destellos)',
    frequency: 'Según proximidad'
  },
  {
    type: 'Boya de Peligro Aislado',
    color: 'Negro/Rojo',
    meaning: 'Peligro aislado - rodear ampliamente',
    light: 'Luz blanca (destellos dobles)',
    frequency: 'Según proximidad'
  },
  {
    type: 'Boya de Aguas Seguras',
    color: 'Rojo/Blanca',
    meaning: 'Aguas seguras - centro del canal',
    light: 'Luz blanca (ocultaciones)',
    frequency: 'Según proximidad'
  },
  {
    type: 'Boya Especial',
    color: 'Amarilla',
    meaning: 'Propósito especial - zona de control',
    light: 'Luz amarilla',
    frequency: 'Según proximidad'
  },
  {
    type: 'Luz de Navegación - Fijo',
    color: 'Blanco',
    meaning: 'Punto de referencia fijo en costa',
    light: 'Luz fija blanca',
    frequency: 'Permanente'
  },
  {
    type: 'Faro Direccional',
    color: 'Blanco/Rojo',
    meaning: 'Marca entrada segura a puerto',
    light: 'Luz verde/blanca/roja sectorial',
    frequency: 'Permanente'
  }
];

export const CLOUD_TYPES: CloudType[] = [
  {
    name: 'Cirros',
    altitude: '6.000-12.000 m',
    description: 'Nubes altas, delgadas, cristalinas. Hielo.',
    symbol: 'Ci',
    weather: 'Tiempo bueno, pero cambio en 24h'
  },
  {
    name: 'Cirrócúmulo',
    altitude: '6.000-12.000 m',
    description: 'Pequeños copos blancos, aspecto ondulado.',
    symbol: 'Cc',
    weather: 'Cambio de tiempo próximo'
  },
  {
    name: 'Cirroestrato',
    altitude: '6.000-12.000 m',
    description: 'Velo transparente, se ve el sol/luna.',
    symbol: 'Cs',
    weather: 'Precipitación en 12-24 horas'
  },
  {
    name: 'Altocúmulo',
    altitude: '2.000-6.000 m',
    description: 'Copos blancos con sombras, aspecto de trama.',
    symbol: 'Ac',
    weather: 'Posible tormenta por la tarde'
  },
  {
    name: 'Altoestrato',
    altitude: '2.000-6.000 m',
    description: 'Velo gris-blanco, se adivina el sol.',
    symbol: 'As',
    weather: 'Lluvia o nieve próxima'
  },
  {
    name: 'Estratocúmulo',
    altitude: '600-2.000 m',
    description: 'Capas con huecos, aspecto de adoquines.',
    symbol: 'Sc',
    weather: 'Tiempo nublado, sin precipitación'
  },
  {
    name: 'Estrato',
    altitude: '0-600 m',
    description: 'Capa uniforme gris, sin textura.',
    symbol: 'St',
    weather: 'Niebla o llovizna'
  },
  {
    name: 'Nimboestrato',
    altitude: '0-2.000 m',
    description: 'Capa oscura y uniforme.',
    symbol: 'Ns',
    weather: 'Lluvia o nieve continua'
  },
  {
    name: 'Cúmulo',
    altitude: '1.000-2.000 m',
    description: 'Copos blancos con base oscura, desarrollo vertical.',
    symbol: 'Cu',
    weather: 'Buen tiempo, posibles chubascos'
  },
  {
    name: 'Cumulonimbo',
    altitude: '500-16.000 m',
    description: 'Torre de desarrollo vertical masivo, base oscura.',
    symbol: 'Cb',
    weather: 'Tormentas, granizo, vientos fuertes'
  },
  {
    name: 'Estratonimbo',
    altitude: '0-3.000 m',
    description: 'Capa oscura con precipitación continua.',
    symbol: 'Sn',
    weather: 'Lluvia/nieve permanente, baja visibilidad'
  }
];


export const NAUTICAL_TERMS: NauticalTerm[] = [
  {
    term: 'Proa',
    english: 'Bow',
    definition: 'Parte delantera de una embarcación.',
    context: 'La proa corta las olas durante la navegación.'
  },
  {
    term: 'Popa',
    english: 'Stern',
    definition: 'Parte trasera de una embarcación.',
    context: 'La popa es el punto de sujeción del timón.'
  },
  {
    term: 'Estribor',
    english: 'Starboard',
    definition: 'Lado derecho de la embarcación mirando hacia proa.',
    context: 'Giro a estribor significa cambio hacia la derecha.'
  },
  {
    term: 'Babor',
    english: 'Port',
    definition: 'Lado izquierdo de la embarcación mirando hacia proa.',
    context: 'Las luces de navegación de babor son rojas.'
  },
  {
    term: 'Amura',
    english: 'Beam',
    definition: 'Banda lateral de la embarcación, perpendicular a la quilla.',
    context: 'El viento por la amura afecta la estabilidad.'
  },
  {
    term: 'Quilla',
    english: 'Keel',
    definition: 'Estructura principal que corre bajo el casco del buque.',
    context: 'La quilla proporciona estabilidad lateral.'
  },
  {
    term: 'Eslora',
    english: 'Length',
    definition: 'Longitud total del buque de proa a popa.',
    context: 'La eslora determina la clase del buque.'
  },
  {
    term: 'Manga',
    english: 'Beam',
    definition: 'Ancho máximo del buque.',
    context: 'La relación eslora/manga afecta la estabilidad.'
  },
  {
    term: 'Calado',
    english: 'Draft',
    definition: 'Profundidad de inmersión del buque en el agua.',
    context: 'El calado aumenta con la carga del buque.'
  },
  {
    term: 'Francobordo',
    english: 'Freeboard',
    definition: 'Distancia entre la flotación y la cubierta superior.',
    context: 'Un francobordo bajo reduce la seguridad en mal tiempo.'
  },
  {
    term: 'Rumbo',
    english: 'Course',
    definition: 'Dirección en que navega la embarcación.',
    context: 'El rumbo se mide en grados desde el norte magnético.'
  },
  {
    term: 'Derrota',
    english: 'Track',
    definition: 'Trayectoria real del buque en el agua.',
    context: 'La derrota difiere del rumbo por corrientes y viento.'
  },
  {
    term: 'Deriva',
    english: 'Leeway',
    definition: 'Ángulo entre el rumbo de proa y la derrota real.',
    context: 'El viento causa deriva lateral en los buques de vela.'
  },
  {
    term: 'Abatimiento',
    english: 'Drift',
    definition: 'Movimiento lateral de la embarcación por viento o corriente.',
    context: 'El abatimiento debe compensarse en la navegación.'
  },
  {
    term: 'Fondear',
    english: 'Anchor',
    definition: 'Detener la embarcación dejando caer ancla.',
    context: 'Se fondea en aguas protegidas o puertos.'
  }
];

export const WIND_BEAUFORT = [
  { scale: 0, name: 'Calma', speed: '0', seaState: 'Espejo', description: 'Sin viento' },
  { scale: 1, name: 'Ventolina', speed: '1-3', seaState: 'Rizada', description: 'Viento muy débil' },
  { scale: 2, name: 'Bonanza', speed: '4-6', seaState: 'Rizada', description: 'Viento débil' },
  { scale: 3, name: 'Brisa Débil', speed: '7-10', seaState: 'Ligera', description: 'Viento ligero' },
  { scale: 4, name: 'Brisa Moderada', speed: '11-16', seaState: 'Pequeña', description: 'Viento moderado' },
  { scale: 5, name: 'Brisa Fresca', speed: '17-21', seaState: 'Mediana', description: 'Viento fresco' },
  { scale: 6, name: 'Fresco', speed: '22-27', seaState: 'Gruesa', description: 'Viento moderadamente fuerte' },
  { scale: 7, name: 'Fuerte', speed: '28-33', seaState: 'Muy Gruesa', description: 'Viento fuerte' },
  { scale: 8, name: 'Muy Fuerte', speed: '34-40', seaState: 'Alta', description: 'Viento muy fuerte' },
  { scale: 9, name: 'Temporal Fuerte', speed: '41-47', seaState: 'Muy Alta', description: 'Temporal fuerte' },
  { scale: 10, name: 'Temporal', speed: '48-55', seaState: 'Enorme', description: 'Temporal severo' },
  { scale: 11, name: 'Temporal Violento', speed: '56-63', seaState: 'Enorme', description: 'Temporal muy violento' },
  { scale: 12, name: 'Huracán', speed: '64+', seaState: 'Fenomenal', description: 'Viento huracanado' }
];
