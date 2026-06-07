export const VADEMECUM_SIGNALS = [
  // SEÑALES ACÚSTICAS DE MANIOBRA (RIPA)
  { id: 's1', label: 'Una Pitada Corta', description: 'Caigo a Estribor', pattern: [1], type: 'Maniobra' },
  { id: 's2', label: 'Dos Pitadas Cortas', description: 'Caigo a Babor', pattern: [1, 1], type: 'Maniobra' },
  { id: 's3', label: 'Tres Pitadas Cortas', description: 'Dando Atrás (Marcha Atrás)', pattern: [1, 1, 1], type: 'Maniobra' },
  { id: 's4', label: 'Dos Pitadas Largas', description: 'Dejando caer ancla / Fondeando', pattern: [2, 2], type: 'Maniobra' },
  
  // SEÑALES DE ALERTA Y PELIGRO
  { id: 's5', label: 'Cinco Pitadas Cortas', description: 'Duda / Peligro Inmediato', pattern: [1, 1, 1, 1, 1], type: 'Alerta' },
  { id: 's6', label: 'Pitada Continua', description: 'Niebla / Visibilidad Reducida', pattern: [3], type: 'Alerta' },
  { id: 's7', label: 'Una Larga + Dos Cortas', description: 'Navegación Restringida (Piloto a Bordo)', pattern: [2, 1, 1], type: 'Alerta' },
  
  // SEÑALES DE PUERTO Y OPERATIVAS
  { id: 's8', label: 'Una Larga', description: 'Salida de Puerto', pattern: [2], type: 'Operativa' },
  { id: 's9', label: 'Dos Largas', description: 'Llegada a Puerto', pattern: [2, 2], type: 'Operativa' },
  { id: 's10', label: 'Una Corta + Una Larga', description: 'Solicitud de Paso', pattern: [1, 2], type: 'Operativa' },
  
  // SEÑALES DE EMERGENCIA
  { id: 's11', label: 'SOS (3 Cortas + 3 Largas + 3 Cortas)', description: 'Señal de Angustia - Auxilio Inmediato', pattern: [1, 1, 1, 2, 2, 2, 1, 1, 1], type: 'Emergencia' },
  { id: 's12', label: 'Pitadas Irregulares', description: 'Persona al Agua', pattern: [1, 1, 1, 0.5, 1, 1, 1], type: 'Emergencia' }
];

export const FLAGS = [
  // CÓDIGO INTERNACIONAL DE SEÑALES - LETRAS
  { char: 'A', meaning: 'Alfa: Buzo sumergido; manténgase alejado y reduce velocidad.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/Alpha_flag.svg/100px-Alpha_flag.svg.png' },
  { char: 'B', meaning: 'Bravo: Transporto materiales peligrosos / Carga peligrosa.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/10/Bravo_flag.svg/100px-Bravo_flag.svg.png' },
  { char: 'C', meaning: 'Charlie: Afirmativo (Sí, entendido).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d3/Charlie_flag.svg/100px-Charlie_flag.svg.png' },
  { char: 'D', meaning: 'Delta: Manténgase alejado; estoy realizando operaciones de buceo.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Delta_flag.svg/100px-Delta_flag.svg.png' },
  { char: 'E', meaning: 'Eco: Estoy cambiando de rumbo hacia babor.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/af/Echo_flag.svg/100px-Echo_flag.svg.png' },
  { char: 'F', meaning: 'Foxtrot: Estoy deshabilitado; comuníquese conmigo.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2e/Foxtrot_flag.svg/100px-Foxtrot_flag.svg.png' },
  { char: 'G', meaning: 'Golf: Requiero piloto.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Golf_flag.svg/100px-Golf_flag.svg.png' },
  { char: 'H', meaning: 'Hotel: Estoy navegando con dificultad.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/17/Hotel_flag.svg/100px-Hotel_flag.svg.png' },
  { char: 'I', meaning: 'India: Estoy cambiando de rumbo hacia estribor.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/India_flag.svg/100px-India_flag.svg.png' },
  { char: 'J', meaning: 'Juliett: Fuego a bordo; alejarse.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Juliett_flag.svg/100px-Juliett_flag.svg.png' },
  { char: 'K', meaning: 'Kilo: Deseo comunicarme con usted.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0b/Kilo_flag.svg/100px-Kilo_flag.svg.png' },
  { char: 'L', meaning: 'Lima: Deténgase inmediatamente.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/16/Lima_flag.svg/100px-Lima_flag.svg.png' },
  { char: 'M', meaning: 'Mike: Mis redes de pesca están trabadas en un objeto.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Mike_flag.svg/100px-Mike_flag.svg.png' },
  { char: 'N', meaning: 'November: Negativo (No, no entendido).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/November_flag.svg/100px-November_flag.svg.png' },
  { char: 'O', meaning: 'Oscar: Hombre al agua (Persona en el agua).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Oscar_flag.svg/100px-Oscar_flag.svg.png' },
  { char: 'P', meaning: 'Papa: En puerto - Todos los puertos deben desalojar.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2d/Papa_flag.svg/100px-Papa_flag.svg.png' },
  { char: 'Q', meaning: 'Quebec: Mi buque es sano; solicito libre práctica.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f8/Quebec_flag.svg/100px-Quebec_flag.svg.png' },
  { char: 'R', meaning: 'Romeo: Auxilio requerido (solicitando ayuda).', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Romeo_flag.svg/100px-Romeo_flag.svg.png' },
  { char: 'S', meaning: 'Sierra: Estoy dando marcha atrás.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Sierra_flag.svg/100px-Sierra_flag.svg.png' },
  { char: 'T', meaning: 'Tango: Manténgase alejado; estoy moviendo redes de pesca.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Tango_flag.svg/100px-Tango_flag.svg.png' },
  { char: 'U', meaning: 'Uniform: Usted se dirije hacia peligro.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/dc/Uniform_flag.svg/100px-Uniform_flag.svg.png' },
  { char: 'V', meaning: 'Victor: Requiero asistencia.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d8/Victor_flag.svg/100px-Victor_flag.svg.png' },
  { char: 'W', meaning: 'Whiskey: Requiero asistencia médica.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Whiskey_flag.svg/100px-Whiskey_flag.svg.png' },
  { char: 'X', meaning: 'Xray: Deje de infringir lo que estoy comunicando.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/86/Xray_flag.svg/100px-Xray_flag.svg.png' },
  { char: 'Y', meaning: 'Yankee: Estoy fondeado.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8e/Yankee_flag.svg/100px-Yankee_flag.svg.png' },
  { char: 'Z', meaning: 'Zulu: Estoy fondeando explosivos o maniobrando con dificultad.', img: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Zulu_flag.svg/100px-Zulu_flag.svg.png' }
];
