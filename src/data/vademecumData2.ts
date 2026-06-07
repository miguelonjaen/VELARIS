export interface VademecumItem {
  id: string;
  title: string;
  description: string;
  symbol?: string;
  color?: string;
  category: string;
  protocol?: string;
  // Extended fields
  morse?: string;
  medical?: string;
  visual?: string;
  steps?: string[];
  velocity?: string;
  utility?: string;
  properties?: string;
  lights?: string;
  marks?: string;
  maneuver?: string;
  buoyColor?: string;
  topMark?: string;
  lightRitmo?: string;
  isSpherical?: boolean; // Nueva bandera para la forma
  isStriped?: boolean; // Nueva bandera para franjas verticales
  colorTop?: string;
  colorMiddle?: string;
  colorBottom?: string;
  imageUrl?: string; // URL de imagen real (Wikimedia, local, etc.)
  altitude?: string; // Rango de altura (ej: "6.000 – 10.000 m")
  cloudFamily?: string; // Familia: "Alta" | "Media" | "Baja" | "Vertical"
  precipitation?: string; // Info sobre precipitaciones asociadas
  soundPattern?: Array<{
    type: "short" | "long" | "bell" | "gong";
    gap?: number;
  }>;
}

export const VADEMECUM_DATA: Record<string, VademecumItem[]> = {
  banderas: [
    {
      id: "alfa",
      title: "Alfa",
      category: "banderas",
      description:
        "Tengo buzo sumergido; manténgase alejado de mí y a poca velocidad.",
      morse: "• —",
      color: "bg-gradient-to-r from-blue-600 via-blue-600 to-white to-50%",
      visual:
        "Dividida verticalmente: Azul a la izquierda, Blanco a la derecha con corte en V.",
    },
    {
      id: "bravo",
      title: "Bravo",
      category: "banderas",
      description:
        "Estoy cargando, descargando o transportando mercancías peligrosas.",
      morse: "— • • •",
      color: "bg-red-600",
      visual: "Bandera totalmente Roja con corte de cola de golondrina (en V).",
    },
    {
      id: "charlie",
      title: "Charlie",
      category: "banderas",
      description: "Sí. Afirmativo.",
      morse: "— • — •",
      color:
        "bg-gradient-to-b from-blue-600 via-white via-red-600 via-white to-blue-600",
      visual:
        "Cinco franjas horizontales simétricas: Azul, Blanco, Rojo, Blanco, Azul.",
    },
    {
      id: "delta",
      title: "Delta",
      category: "banderas",
      description: "Manténgase alejado; maniobro con dificultad.",
      morse: "— • •",
      color: "bg-gradient-to-b from-yellow-400 via-blue-600 to-yellow-400",
      visual:
        "Tres franjas horizontales: Amarillo, Azul grueso central, Amarillo.",
    },
    {
      id: "echo",
      title: "Echo",
      category: "banderas",
      description: "Caigo a estribor.",
      morse: "•",
      color: "bg-gradient-to-b from-blue-600 to-red-600 to-50%",
      visual: "Dos franjas horizontales iguales: Azul arriba, Rojo abajo.",
    },
    {
      id: "foxtrot",
      title: "Foxtrot",
      category: "banderas",
      description: "Tengo avería; comuníquese conmigo.",
      morse: "• • — •",
      color: "bg-white border-4 border-red-500",
      visual: "Fondo Blanco con un rombo Rojo central que toca los extremos.",
    },
    {
      id: "golf",
      title: "Golf",
      category: "banderas",
      description: "Necesito práctico. (Pesqueros: Estoy cobrando redes).",
      morse: "— — •",
      color:
        "bg-gradient-to-r from-yellow-400 via-blue-600 via-yellow-400 via-blue-600 to-yellow-400",
      visual: "Seis franjas verticales alternas de color Amarillo y Azul.",
    },
    {
      id: "hotel",
      title: "Hotel",
      category: "banderas",
      description: "Tengo práctico a bordo.",
      morse: "• • • •",
      color: "bg-gradient-to-r from-white via-white to-red-600 to-50%",
      visual:
        "Dividida verticalmente: Blanco a la izquierda, Rojo a la derecha.",
    },
    {
      id: "india",
      title: "India",
      category: "banderas",
      description: "Caigo a babor.",
      morse: "• •",
      color:
        "bg-yellow-400 relative after:absolute after:w-4 after:h-4 after:bg-black after:rounded-full after:top-1/2 after:left-1/2 after:-translate-x-1/2 after:-translate-y-1/2",
      visual: "Fondo Amarillo con un disco circular Negro en el centro.",
    },
    {
      id: "juliett",
      title: "Juliett",
      category: "banderas",
      description:
        "Tengo un incendio a bordo y llevo mercancías peligrosas; manténgase alejado.",
      morse: "• — — —",
      color: "bg-gradient-to-b from-blue-600 via-white to-blue-600",
      visual: "Tres franjas horizontales: Azul, Blanco, Azul.",
    },
    {
      id: "kilo",
      title: "Kilo",
      category: "banderas",
      description: "Deseo comunicarme con usted.",
      morse: "— • —",
      color:
        "bg-gradient-to-r from-yellow-400 via-yellow-400 to-blue-600 to-50%",
      visual:
        "Dividida verticalmente: Amarillo a la izquierda, Azul a la derecha.",
    },
    {
      id: "lima",
      title: "Lima",
      category: "banderas",
      description: "Pare su buque inmediatamente.",
      morse: "• — • •",
      color:
        "bg-slate-950 grid grid-cols-2 gap-0.5 p-0.5 after:bg-yellow-400 before:bg-yellow-400",
      visual:
        "Cuartelada en cruz: Dos cuadros Amarillos y dos Negros alternados.",
    },
    {
      id: "mike",
      title: "Mike",
      category: "banderas",
      description: "Mi buque está parado y sin arrancada.",
      morse: "— —",
      color:
        "bg-blue-600 relative after:absolute after:inset-1 after:border-2 after:border-white after:rotate-45",
      visual: "Fondo Azul con una cruz de San Andrés Blanca (aspas).",
    },
    {
      id: "november",
      title: "November",
      category: "banderas",
      description: "No. Negativo.",
      morse: "— •",
      color: "bg-white grid grid-cols-4 grid-rows-4 gap-0.5 p-0.5",
      visual: "Tablero de ajedrez con 16 escaques alternados Azules y Blancos.",
    },
    {
      id: "oscar",
      title: "Oscar",
      category: "banderas",
      description: "¡Hombre al agua!",
      morse: "— — —",
      color:
        "bg-gradient-to-br from-yellow-400 via-yellow-400 to-red-600 to-50%",
      visual:
        "Dividida diagonalmente en dos triángulos: Amarillo arriba/izquierda, Rojo abajo/derecha.",
    },
    {
      id: "papa",
      title: "Papa",
      category: "banderas",
      description:
        "En puerto: Todo el personal a bordo, el buque va a salir. En la mar: Mis redes se han enganchado.",
      morse: "• — — •",
      color:
        "bg-blue-600 p-2.5 flex items-center justify-center after:w-full after:h-full after:bg-white",
      visual: "Fondo Azul con un cuadro Blanco más pequeño en el centro.",
    },
    {
      id: "quebec",
      title: "Quebec",
      category: "banderas",
      description:
        "Mi buque está sano y pido libre plática (despacho de aduana).",
      morse: "— — • —",
      color: "bg-yellow-400",
      visual: "Bandera totalmente Amarilla.",
    },
    {
      id: "romeo",
      title: "Romeo",
      category: "banderas",
      description: "Sin significado asignado de forma aislada.",
      morse: "• — •",
      color:
        "bg-red-600 relative after:absolute after:w-full after:h-2 after:bg-yellow-400 after:top-1/2 after:-translate-y-1/2 before:absolute before:w-2 before:h-full before:bg-yellow-400 before:left-1/2 before:-translate-x-1/2",
      visual: "Fondo Rojo con una cruz amarilla horizontal y vertical.",
    },
    {
      id: "sierra",
      title: "Sierra",
      category: "banderas",
      description: "Estoy dando atrás a toda fuerza.",
      morse: "• • •",
      color:
        "bg-white p-2.5 flex items-center justify-center after:w-full after:h-full after:bg-blue-600",
      visual: "Fondo Blanco con un cuadro Azul en el centro.",
    },
    {
      id: "tango",
      title: "Tango",
      category: "banderas",
      description: "Manténgase alejado; estoy pescando al arrastre en pareja.",
      morse: "—",
      color: "bg-gradient-to-r from-red-600 via-white via-blue-600 to-blue-600",
      visual:
        "Tres franjas verticales iguales: Roja a babor, Blanca al centro, Azul a estribor.",
    },
    {
      id: "uniform",
      title: "Uniform",
      category: "banderas",
      description: "Se dirige usted hacia un peligro.",
      morse: "• • —",
      color:
        "bg-white grid grid-cols-2 gap-2 p-2 after:bg-red-600 before:bg-red-600",
      visual:
        "Cuatro cuarteles simétricos: Dos Rojos y dos Blancos alternados.",
    },
    {
      id: "victor",
      title: "Victor",
      category: "banderas",
      description: "Necesito asistencia.",
      morse: "• • • —",
      color:
        "bg-white relative after:absolute after:w-full after:h-1 after:bg-red-600 after:rotate-12",
      visual: "Fondo Blanco con una cruz de San Andrés Roja en aspa.",
    },
    {
      id: "whiskey",
      title: "Whiskey",
      category: "banderas",
      description: "Necesito asistencia médica.",
      morse: "• — —",
      color:
        'bg-blue-600 p-2 flex items-center justify-center after:w-full after:h-full after:bg-white after:p-2 after:flex after:items-center after:justify-center after:content-[""] before:w-4 before:h-4 before:bg-red-600 before:z-10',
      visual:
        "Un cuadro Azul exterior, cuadro Blanco intermedio, cuadro Rojo central.",
    },
    {
      id: "xray",
      title: "Xray",
      category: "banderas",
      description: "Interrumpa sus señales y observe mis señales.",
      morse: "— • • —",
      color:
        "bg-white relative after:absolute after:w-full after:h-2 after:bg-blue-600 after:top-1/2 after:-translate-y-1/2 before:absolute before:w-2 before:h-full before:bg-blue-600 before:left-1/2 before:-translate-x-1/2",
      visual: "Fondo Blanco con una cruz Azul celeste.",
    },
    {
      id: "yankee",
      title: "Yankee",
      category: "banderas",
      description: "Estoy garreando (el ancla arrastra por el fondo).",
      morse: "— • — —",
      color:
        "bg-gradient-to-tr from-yellow-400 via-red-600 via-yellow-400 via-red-600 to-yellow-400",
      visual: "Franjas diagonales alternas Amarillas y Rojas.",
    },
    {
      id: "zulu",
      title: "Zulu",
      category: "banderas",
      description: "Necesito remolcador. (Pesqueros: Estoy calando redes).",
      morse: "— — • •",
      color: "bg-slate-900",
      visual:
        "Dividida en cuatro triángulos que convergen en el centro: Negro, Amarillo, Azul y Rojo.",
    },
  ],
  cabuyería: [
    {
      id: "as-de-guia",
      title: "As de Guía",
      category: "cabuyería",
      description:
        "El rey de los nudos marineros. Forma una gaza fija al final de un cabo que no se desliza ni se traba, y se deshace con extrema facilidad incluso bajo tensiones masivas.",
      imageUrl: "/nudos/as-de-guia.jpg",
      steps: [
        "Pasa el chicote por el revés para formar una pequeña gaza o lazo base.",
        'Introduce el chicote de abajo hacia arriba a través de la gaza simulando "la serpiente que sale del pozo".',
        "Pasa el chicote por detrás del firme (el cuerpo principal del cabo).",
        'Introduce el chicote de vuelta en la gaza ("la serpiente vuelve a entrar al pozo") y azoca el nudo firmemente.',
      ],
      properties:
        "Resistencia: Excelente // Aplicación: Amarre de drizas, amuras, salvamento de personas.",
    },
    {
      id: "ballestrinque",
      title: "Ballestrinque",
      category: "cabuyería",
      description:
        "Nudo de amarre rápido por excelencia. Ideal para sujetar defensas a las guardamancebos o encapillar cabos en un noray. Exige tensión continua para evitar deslices.",
      imageUrl: "/nudos/ballestrinque.jpg",
      steps: [
        "Da una vuelta completa con el cabo alrededor del poste o tubo de acero.",
        'Cruza el chicote por encima de la primera vuelta formando una "X".',
        "Da una segunda vuelta y pasa el chicote por debajo de este último cruce.",
        "Tira de ambos extremos simultáneamente para bloquear el cabo bajo su propia presión.",
      ],
      properties:
        "Resistencia: Media (Peligro si fluctúa la tensión) // Aplicación: Colocación de defensas, sujeción provisional.",
    },
    {
      id: "nudo-llano",
      title: "Nudo Llano o Rizo",
      category: "cabuyería",
      description:
        "Diseñado estrictamente para unir dos cabos de igual mena (grosor) y material. Históricamente usado para recoger los rizos de las velas mayores.",
      imageUrl: "/nudos/nudo-llano.png",
      steps: [
        "Cruza el chicote de la izquierda sobre el de la derecha y realiza una vuelta simple.",
        "Toma el chicote derecho resultante y crúzalo sobre el izquierdo.",
        "Pásalo por dentro del bucle recién creado.",
        "Azoca el nudo. Si queda simétrico y plano, la ejecución táctica es correcta.",
      ],
      properties:
        "Resistencia: Baja (Se deshace si los cabos son de diferente grosor) // Aplicación: Tomar rizos, paquetería ligera.",
    },
    {
      id: "nudo-en-ocho",
      title: "Nudo en Ocho o Lasca",
      category: "cabuyería",
      description:
        "Nudo de tope fundamental. Evita que las escotas, drizas o cabos de maniobra se escapen por las poleas, mordazas o guías del puente.",
      imageUrl: "/nudos/nudo-en-ocho.png",
      steps: [
        "Forma un seno o bucle con el chicote pasando por delante del firme.",
        "Da una vuelta completa por detrás del firme.",
        "Introduce el chicote desde arriba hacia abajo por el interior del primer bucle.",
        "Tira del firme y del chicote para conseguir la clásica forma simétrica del número 8.",
      ],
      properties:
        "Resistencia: Muy Alta // Aplicación: Tope final en escotas de foque, mayor y drizas.",
    },
    {
      id: "vuelta-de-rezon",
      title: "Vuelta de Rezón",
      category: "cabuyería",
      description:
        "El amarre definitivo para elementos sometidos a tracción constante y humedad extrema, como el grillete de un ancla de fondeo o el cabo de un rezón.",
      imageUrl: "/nudos/vuelta-de-rezon.jpg",
      steps: [
        "Da dos vueltas redondas completas alrededor de la argolla o grillete.",
        "Pasa el chicote por detrás del firme e introdúcelo por dentro de las dos vueltas iniciales.",
        "Realiza una segunda vuelta de seguridad idéntica justo por encima.",
        "Asegura el chicote sobrante al firme mediante una ligada para evitar movimientos por oleaje.",
      ],
      properties:
        "Resistencia: Máxima // Aplicación: Fondeo pesado, remolques de larga duración.",
    },
  ],
  prioridades: [
    {
      id: "p1",
      title: "Sin Gobierno (NUC)",
      symbol: "🔴\n🔴",
      description:
        "Sin gobierno por circunstancias excepcionales (avería, etc).",
      marks: "Diurna: Dos bolas negras. Luces: Dos rojas en vertical.",
      maneuver: "PREFERENCIA ABSOLUTA. El resto se apartan.",
      category: "Prioridad 1",
    },
    {
      id: "p2",
      title: "Maniobra Restringida (RAM)",
      symbol: "🔴\n⚪\n🔴",
      description:
        "Dedicado a trabajos (cables, dragado, etc) que limitan su capacidad de maniobrar.",
      marks: "Diurna: Bola-Rombo-Bola. Luces: Roja-Blanca-Roja en vertical.",
      maneuver: "Preferencia sobre Pesca, Vela y Motor.",
      category: "Prioridad 2",
    },
    {
      id: "p3",
      title: "Condicionado por Calado (CBD)",
      symbol: "⬛",
      description:
        "Debido a su gran calado solo puede navegar por un canal angosto.",
      marks:
        "Diurna: Un cilindro negro. Luces: Tres rojas en vertical (🔴🔴🔴).",
      maneuver: "Prioridad sobre Pesca, Vela y Motor.",
      category: "Prioridad 3",
    },
    {
      id: "p4",
      title: "Pesca",
      symbol: "▼\n▲",
      description:
        "Buque dedicado a la pesca que restringe su maniobra (no curricán).",
      marks:
        "Diurna: Dos conos por sus vértices superpuestos. Luces: Blanca sobre Roja.",
      maneuver: "Preferencia sobre Vela y Motor.",
      category: "Prioridad 4",
    },
    {
      id: "p5",
      title: "Vela",
      symbol: "⛵",
      description: "Buque navegando exclusivamente a vela.",
      marks: "Diurna: Cono hacia abajo. Luces: Costados y Alcance.",
      maneuver: "Preferencia sobre Motor.",
      category: "Prioridad 5",
    },
    {
      id: "p6",
      title: "Propulsión Mecánica",
      symbol: "🚢",
      description: "Cualquier buque movido por máquinas.",
      marks: "Diurna: Ninguna. Luces: Topes, Costados y Alcance.",
      maneuver: "Se mantendrá apartado de todos los anteriores.",
      category: "Prioridad 6",
    },
  ],
  balizamiento: [
    {
      id: "lateral-babor",
      title: "Lateral Babor",
      category: "balizamiento",
      description:
        "Baliza lateral que indica el canal navegable al entrar a puerto (IALA Región A). Se deja a la banda de BABOR (izquierda). En región A: cuerpo ROJO cilíndrico.",
      imageUrl: "/balizas/lateral-babor.png",
      colorTop: "bg-red-600",
      colorMiddle: "bg-red-600",
      colorBottom: "bg-red-600",
      topMark: "Cilindro Rojo",
      buoyColor: "Cuerpo Cilíndrico Rojo (IALA A)",
      lightRitmo: "Fl R (Destellos Rojos)",
    },
    {
      id: "lateral-estribor",
      title: "Lateral Estribor",
      category: "balizamiento",
      description:
        "Baliza lateral que indica el canal navegable al entrar a puerto (IALA Región A). Se deja a la banda de ESTRIBOR (derecha). En región A: cuerpo VERDE cónico.",
      imageUrl: "/balizas/lateral-estribor.png",
      colorTop: "bg-green-600",
      colorMiddle: "bg-green-600",
      colorBottom: "bg-green-600",
      topMark: "Cono Verde",
      buoyColor: "Cuerpo Cónico Verde (IALA A)",
      lightRitmo: "Fl G (Destellos Verdes)",
    },
    {
      id: "cardinal-norte",
      title: "Cardinal Norte",
      category: "balizamiento",
      description:
        "Las aguas navegables y el paso profundo se encuentran al NORTE de esta boya. El peligro queda al sur. Pásela por su lado norte.",
      imageUrl: "/balizas/cardinal-norte.png",
      colorTop: "bg-black",
      colorMiddle: "bg-black",
      colorBottom: "bg-yellow-400",
      topMark: "2 Conos Negros con vértices hacia ARRIBA (▲▲)",
      buoyColor: "Negro arriba, Amarillo abajo",
      lightRitmo: "Q o VQ continuo (Centelleo Blanco rápido)",
    },
    {
      id: "cardinal-sur",
      title: "Cardinal Sur",
      category: "balizamiento",
      description:
        "Las aguas navegables y el paso profundo se encuentran al SUR de esta boya. El peligro queda al norte. Pásela por su lado sur.",
      imageUrl: "/balizas/cardinal-sur.png",
      colorTop: "bg-yellow-400",
      colorMiddle: "bg-yellow-400",
      colorBottom: "bg-black",
      topMark: "2 Conos Negros con vértices hacia ABAJO (▼▼)",
      buoyColor: "Amarillo arriba, Negro abajo",
      lightRitmo: "Q(6) + LFl 15s (6 centelleos + 1 destello largo)",
    },
    {
      id: "cardinal-este",
      title: "Cardinal Este",
      category: "balizamiento",
      description:
        "Las aguas navegables y el paso profundo se encuentran al ESTE de esta boya. El peligro queda al oeste. Pásela por su lado este.",
      imageUrl: "/balizas/cardinal-este.png",
      colorTop: "bg-black",
      colorMiddle: "bg-yellow-400",
      colorBottom: "bg-black",
      topMark: "2 Conos Negros con vértices opuestos (▲▼ — bases juntas)",
      buoyColor: "Negro arriba, Amarillo banda central, Negro abajo",
      lightRitmo: "VQ(3) 5s o Q(3) 10s (3 centelleos Blancos)",
    },
    {
      id: "cardinal-oeste",
      title: "Cardinal Oeste",
      category: "balizamiento",
      description:
        "Las aguas navegables y el paso profundo se encuentran al OESTE de esta boya. El peligro queda al este. Pásela por su lado oeste.",
      imageUrl: "/balizas/cardinal-oeste.png",
      colorTop: "bg-yellow-400",
      colorMiddle: "bg-black",
      colorBottom: "bg-yellow-400",
      topMark: "2 Conos Negros con vértices juntos (▼▲ — puntas al centro)",
      buoyColor: "Amarillo arriba, Negro banda central, Amarillo abajo",
      lightRitmo: "VQ(9) 10s o Q(9) 15s (9 centelleos Blancos)",
    },
    {
      id: "peligro-aislado",
      title: "Peligro Aislado",
      category: "balizamiento",
      description:
        "Se sitúa directamente sobre un peligro de extensión limitada (bajo, roca, pecio) rodeado de aguas navegables en todos sus lados. Evítela por todos los flancos.",
      imageUrl: "/balizas/peligro-aislado.png",
      colorTop: "bg-black",
      colorMiddle: "bg-red-600",
      colorBottom: "bg-black",
      topMark: "2 Esferas Negras superpuestas (●●)",
      buoyColor: "Cuerpo Negro con una o más franjas horizontales Rojas",
      lightRitmo: "Fl(2) W (Grupo de 2 destellos Blancos)",
    },
    {
      id: "aguas-navegables",
      title: "Aguas Navegables",
      category: "balizamiento",
      description:
        "Señaliza que existe agua navegable a su alrededor en todos los sentidos. Se sitúa en el centro de canales o como baliza de recalada de alta mar.",
      imageUrl: "/balizas/aguas-navegables.png",
      isSpherical: true,
      isStriped: true,
      topMark: "1 Esfera Roja (●)",
      buoyColor: "Franjas verticales alternas Rojas y Blancas",
      lightRitmo:
        "Iso / Occ / Mo(A) / LFl 10s (Luz Blanca con ritmo específico)",
    },
    {
      id: "marca-especial",
      title: "Marca Especial",
      category: "balizamiento",
      description:
        "Señaliza zonas o características especiales indicadas en las cartas náuticas: áreas de vertido, cables submarinos, zonas de ejercicios militares, tuberías, etc.",
      imageUrl: "/balizas/marca-especial.jpg",
      colorTop: "bg-yellow-400",
      colorMiddle: "bg-yellow-400",
      colorBottom: "bg-yellow-400",
      topMark: "Cruz de San Andrés Amarilla (✕)",
      buoyColor: "Cuerpo totalmente Amarillo",
      lightRitmo:
        "Fl Y (Destellos Amarillos — cualquier ritmo no usado por blancas)",
    },
  ],
  beaufort: [
    {
      id: "b0",
      title: "Calma",
      category: "beaufort",
      description:
        "La mar está como un espejo, lisa y llana sin ningún tipo de ondulación.",
      symbol: "0",
      velocity: "0 - 1",
    },
    {
      id: "b1",
      title: "Ventolina",
      category: "beaufort",
      description:
        "El viento riza la superficie del agua ligeramente en zonas aisladas. No hay crestas.",
      symbol: "1",
      velocity: "1 - 3",
    },
    {
      id: "b2",
      title: "Flojito",
      category: "beaufort",
      description:
        "Olas pequeñas que no llegan a romper. Las crestas tienen un aspecto cristalino.",
      symbol: "2",
      velocity: "4 - 6",
    },
    {
      id: "b3",
      title: "Flojo",
      category: "beaufort",
      description:
        "Las olas empiezan a crecer. Aparecen los primeros borreguillos dispersos.",
      symbol: "3",
      velocity: "7 - 10",
    },
    {
      id: "b4",
      title: "Bonancible",
      category: "beaufort",
      description:
        "Olas ya alargadas. Los borreguillos blancos empiezan a ser bastante numerosos.",
      symbol: "4",
      velocity: "11 - 16",
    },
    {
      id: "b5",
      title: "Fresquito",
      category: "beaufort",
      description:
        "Olas moderadas con formas alargadas pronunciadas. Abundante espuma y borregos.",
      symbol: "5",
      velocity: "17 - 21",
    },
    {
      id: "b6",
      title: "Fresco",
      category: "beaufort",
      description:
        "Comienzan a formarse olas grandes. Las crestas de espuma blanca cubren extensiones amplias.",
      symbol: "6",
      velocity: "22 - 27",
    },
    {
      id: "b7",
      title: "Frescachón",
      category: "beaufort",
      description:
        "La mar ruge. La espuma empieza a ser arrastrada en hileras en la dirección del viento.",
      symbol: "7",
      velocity: "28 - 33",
    },
    {
      id: "b8",
      title: "Temporal",
      category: "beaufort",
      description:
        "Olas de gran altura. Las crestas se rompen en torbellinos y las ráfagas levantan rociones.",
      symbol: "8",
      velocity: "34 - 40",
    },
    {
      id: "b9",
      title: "Temporal Fuerte",
      category: "beaufort",
      description:
        "Olas gruesas con visibilidad mermada. El oleaje empieza a desplomarse en masas compactas.",
      symbol: "9",
      velocity: "41 - 47",
    },
    {
      id: "b10",
      title: "Temporal Duro",
      category: "beaufort",
      description:
        "Olas montañosas con largas crestas colgantes. La superficie del mar se ve completamente blanca.",
      symbol: "10",
      velocity: "48 - 55",
    },
    {
      id: "b11",
      title: "Temporal Muy Duro",
      category: "beaufort",
      description:
        "Olas excepcionalmente altas. Visibilidad severamente reducida, peligro de colapso de instrumentación.",
      symbol: "11",
      velocity: "56 - 63",
    },
    {
      id: "b12",
      title: "Temporal Huracanado",
      category: "beaufort",
      description:
        "El aire se llena de espuma y rociones. La mar está enteramente blanca y la visibilidad es nula.",
      symbol: "12",
      velocity: "64+",
    },
  ],
  acusticas: [
    {
      id: "viro-estribor",
      title: "Virar a Estribor",
      category: "acusticas",
      symbol: "•",
      description:
        "Emitida por buque de propulsión mecánica al alterar el rumbo a estribor en situación de visibilidad mutua. Es obligatoria la señal acústica simultánea a la maniobra.",
      protocol: "Regla 34(a) COLREGS — 1 pitido corto (~1 segundo)",
      soundPattern: [{ type: "short" }],
    },
    {
      id: "viro-babor",
      title: "Virar a Babor",
      category: "acusticas",
      symbol: "• •",
      description:
        "Emitida por buque de propulsión mecánica al alterar el rumbo a babor en situación de visibilidad mutua.",
      protocol: "Regla 34(a) COLREGS — 2 pitidos cortos",
      soundPattern: [{ type: "short" }, { type: "short" }],
    },
    {
      id: "maquina-atras",
      title: "Máquina Atrás",
      category: "acusticas",
      symbol: "• • •",
      description:
        "Indica que el buque está operando con propulsión hacia atrás. No significa que el buque vaya a popa, solo que la hélice gira en sentido inverso.",
      protocol: "Regla 34(a) COLREGS — 3 pitidos cortos",
      soundPattern: [{ type: "short" }, { type: "short" }, { type: "short" }],
    },
    {
      id: "senal-duda",
      title: "Señal de Duda / Alerta",
      category: "acusticas",
      symbol: "• • • • •",
      description:
        "Emitida cuando un buque no comprende las intenciones del otro, duda de que se tomen medidas suficientes para evitar colisión, o necesita llamar urgentemente la atención. Mínimo 5 pitidos cortos y rápidos.",
      protocol: "Regla 34(d) COLREGS — 5 o más pitidos cortos rápidos",
      soundPattern: [
        { type: "short", gap: 0.2 },
        { type: "short", gap: 0.2 },
        { type: "short", gap: 0.2 },
        { type: "short", gap: 0.2 },
        { type: "short" },
      ],
    },
    {
      id: "motor-navegando-niebla",
      title: "Motor con Arrancada (Niebla)",
      category: "acusticas",
      symbol: "—",
      description:
        "Buque de propulsión mecánica navegando con arrancada en condiciones de visibilidad reducida (niebla, lluvia intensa, calina densa). Intervalos no superiores a 2 minutos.",
      protocol: "Regla 35(b) COLREGS — 1 pitido largo (~4-6 s) cada 2 min",
      soundPattern: [{ type: "long" }],
    },
    {
      id: "motor-parado-niebla",
      title: "Motor Parado / Sin Arrancada (Niebla)",
      category: "acusticas",
      symbol: "— —",
      description:
        "Buque de propulsión mecánica parado y sin arrancada en condiciones de visibilidad reducida. Dos pitidos largos con una pausa de aproximadamente 2 segundos entre ellos.",
      protocol: "Regla 35(b) COLREGS — 2 pitidos largos (pausa ~2s) cada 2 min",
      soundPattern: [{ type: "long", gap: 2.0 }, { type: "long" }],
    },
    {
      id: "nuc-ram-vela-pesca",
      title: "NUC / RAM / Vela / Pesca (Niebla)",
      category: "acusticas",
      symbol: "— • •",
      description:
        "Señal unificada para: Buque Sin Gobierno (NUC), Maniobra Restringida (RAM), Buque de Vela, Buque Pesquero y Buque Remolcador o Empujando. Todos emiten esta misma secuencia en visibilidad reducida.",
      protocol: "Regla 35(c) COLREGS — 1 largo + 2 cortos, cada 2 min",
      soundPattern: [
        { type: "long", gap: 0.4 },
        { type: "short", gap: 0.3 },
        { type: "short" },
      ],
    },
    {
      id: "buque-practico",
      title: "Buque Práctico (Piloto)",
      category: "acusticas",
      symbol: "• • • •",
      description:
        'Señal de identidad del buque práctico cuando está en ejercicio. Se emite ADEMÁS de las señales reglamentarias correspondientes a su situación. Equivale a la letra "H" del alfabeto fonético.',
      protocol: "Regla 35(j) COLREGS — 4 pitidos cortos",
      soundPattern: [
        { type: "short" },
        { type: "short" },
        { type: "short" },
        { type: "short" },
      ],
    },
    {
      id: "rebasar-estribor",
      title: "Intención de Rebasar por Estribor",
      category: "acusticas",
      symbol: "— — •",
      description:
        "Emitida en canal angosto o vía de tráfico: el buque alcanzante indica su intención de rebasar al buque alcanzado por el costado de estribor de éste. El alcanzado debe responder.",
      protocol: "Regla 34(c)(i) COLREGS — 2 largos + 1 corto",
      soundPattern: [
        { type: "long", gap: 0.3 },
        { type: "long", gap: 0.4 },
        { type: "short" },
      ],
    },
    {
      id: "rebasar-babor",
      title: "Intención de Rebasar por Babor",
      category: "acusticas",
      symbol: "— — • •",
      description:
        "Emitida en canal angosto: el buque alcanzante indica su intención de rebasar al buque alcanzado por el costado de babor de éste. Requiere respuesta del alcanzado.",
      protocol: "Regla 34(c)(i) COLREGS — 2 largos + 2 cortos",
      soundPattern: [
        { type: "long", gap: 0.3 },
        { type: "long", gap: 0.4 },
        { type: "short", gap: 0.3 },
        { type: "short" },
      ],
    },
    {
      id: "acuerdo-rebasar",
      title: "Acuerdo de Ser Rebasado",
      category: "acusticas",
      symbol: "— • — •",
      description:
        "Respuesta del buque alcanzado: acepta ser rebasado y confirma que el canal está libre. Si hay duda o peligro, emite la señal de 5 pitidos cortos en su lugar.",
      protocol:
        "Regla 34(c)(ii) COLREGS — 1 largo + 1 corto + 1 largo + 1 corto",
      soundPattern: [
        { type: "long", gap: 0.35 },
        { type: "short", gap: 0.35 },
        { type: "long", gap: 0.35 },
        { type: "short" },
      ],
    },
    {
      id: "curva-ciega",
      title: "Aproximando Curva / Obstáculo Ciego",
      category: "acusticas",
      symbol: "—",
      description:
        "Buque que se aproxima a una curva u obstrucción donde otros buques no pueden ser vistos. Si otro buque escucha la señal, debe responder con 1 pitido largo prolongado. Solo aplica en canales angostos.",
      protocol:
        "Regla 34(e) COLREGS — 1 pitido largo al aproximarse al obstáculo",
      soundPattern: [{ type: "long" }],
    },
    {
      id: "fondeado-corto",
      title: "Buque Fondeado (< 100 m eslora)",
      category: "acusticas",
      symbol: "🔔",
      description:
        "Todo buque fondeado en condiciones de visibilidad reducida debe repicar la campana rápidamente durante 5 segundos con intervalos no superiores a 1 minuto. Los buques <100m pueden sustituirla por cualquier otra señal eficaz.",
      protocol:
        "Regla 35(g) COLREGS — Repique rápido de campana ~5 s, cada minuto",
      soundPattern: [
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell" },
      ],
    },
    {
      id: "fondeado-largo",
      title: "Buque Fondeado (> 100 m eslora)",
      category: "acusticas",
      symbol: "🔔 🔕",
      description:
        "En buques de más de 100m de eslora, inmediatamente después del repique de campana de proa, se añade un repique de gong a popa para alertar en ambas direcciones del buque.",
      protocol:
        "Regla 35(g) COLREGS — Campana (proa) + Gong (popa), cada minuto",
      soundPattern: [
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.35 },
        { type: "bell", gap: 0.8 },
        { type: "gong", gap: 0.4 },
        { type: "gong", gap: 0.4 },
        { type: "gong" },
      ],
    },
    {
      id: "varado",
      title: "Buque Varado",
      category: "acusticas",
      symbol: "🔔×3 + ~ + 🔔×3",
      description:
        "Buque que ha encallado o varado en condiciones de visibilidad reducida. Secuencia: 3 golpes lentos de campana, seguidos del repique rápido de campana, seguidos de otros 3 golpes lentos. Cada minuto.",
      protocol:
        "Regla 35(h) COLREGS — 3 golpes + repique rápido + 3 golpes de campana",
      soundPattern: [
        { type: "bell", gap: 0.6 },
        { type: "bell", gap: 0.6 },
        { type: "bell", gap: 0.5 },
        { type: "bell", gap: 0.28 },
        { type: "bell", gap: 0.28 },
        { type: "bell", gap: 0.28 },
        { type: "bell", gap: 0.28 },
        { type: "bell", gap: 0.5 },
        { type: "bell", gap: 0.6 },
        { type: "bell", gap: 0.6 },
        { type: "bell" },
      ],
    },
  ],
  nubes: [
    {
      id: "cirros",
      title: "Cirros",
      category: "nubes",
      cloudFamily: "Alta",
      altitude: "6.000 – 10.000 m",
      imageUrl: "/nubes/cirros.jpg",
      description:
        "Nubes compuestas por cristales de hielo. De color blanco con forma fibrosa o filamentosa (cirrus en latín: sortija, cabello). No producen generalmente precipitaciones.",
      precipitation:
        "Sin precipitaciones. Pueden anunciar cambio de tiempo si aumentan y se extienden.",
      properties:
        "Composición: Cristales de hielo. Forma: Fibrosa, filamentosa, en mechones.",
    },
    {
      id: "cirrocumulos",
      title: "Cirrocúmulos",
      category: "nubes",
      cloudFamily: "Alta",
      altitude: "6.000 – 10.000 m",
      imageUrl: "/nubes/cirrocumulos.jpg",
      description:
        "Compuestas de cristales de hielo o gotitas de agua. Tienen forma de pequeños copos de algodón blancos dispuestos en bandas o grupos regulares. Producen el llamado 'cielo ajedrezado' o 'cielo mackerel'.",
      precipitation:
        "Sin precipitaciones directas. Pueden preceder sistemas frontales.",
      properties:
        "Composición: Cristales de hielo y/o gotitas de agua supercooled. Forma: Copos pequeños, bancos.",
    },
    {
      id: "cirrostrato",
      title: "Cirrostrato",
      category: "nubes",
      cloudFamily: "Alta",
      altitude: "6.000 – 12.000 m",
      imageUrl: "/nubes/cirrostrato.jpg",
      description:
        "De la misma familia que los cirros, formadas por cristales de hielo. Cubren gran parte del cielo dando un aspecto lechoso o velo blanquecino. Producen el fenómeno del 'halo solar' o 'halo lunar'. Pueden anunciar precipitaciones en las próximas horas.",
      precipitation:
        "Pueden anunciar lluvia o nieve próxima, especialmente si aumentan y provienen de un punto fijo.",
      properties:
        "Composición: Cristales de hielo. Forma: Velo fibroso que cubre amplias zonas del cielo.",
    },
    {
      id: "altocumulos",
      title: "Altocúmulos",
      category: "nubes",
      cloudFamily: "Media",
      altitude: "2.000 – 4.000 m",
      imageUrl: "/nubes/altocumulos.jpg",
      description:
        "Formadas por gotitas de agua mezclada con polvo de aspecto fibroso. Existen varios tipos, a veces presentes simultáneamente en el mismo cielo. Su transparencia varía mucho: pueden ser blancas, grises o incluso negras según su grosor.",
      precipitation:
        "Si son suficientemente gruesas pueden conllevar precipitaciones. Si van aumentando, señal de que se acerca un sistema frontal.",
      properties:
        "Composición: Gotitas de agua y polvo. Forma: Masas, parches o bandas onduladas.",
    },
    {
      id: "altoestratos",
      title: "Altoestratos",
      category: "nubes",
      cloudFamily: "Media",
      altitude: "2.000 – 4.000 m",
      imageUrl: "/nubes/altoestratos.jpg",
      description:
        "Formadas por hielo y agua, pueden llegar a cubrir el cielo de manera total dando un aspecto gris uniforme. Se forman por grandes masas de aire que se condensan al ascender. Generalmente se forman antes de las tormentas.",
      precipitation:
        "Precursoras de lluvia continua o nieve. El sol o la luna se ven difusamente a través de ellas, sin halo.",
      properties:
        "Composición: Cristales de hielo y gotitas de agua. Forma: Capa gris uniforme extensa.",
    },
    {
      id: "nimbostratos",
      title: "Nimbostratos",
      category: "nubes",
      cloudFamily: "Baja",
      altitude: "150 – 1.600 m",
      imageUrl: "/nubes/nimbostratos.jpg",
      description:
        "Formadas por gotas de agua fría, cristales o nieve. De color gris oscuro con suficiente espesor como para no dejar ver el sol o la luna. Aspecto velado debido a las precipitaciones continuas de agua o nieve que caen de ellas.",
      precipitation:
        "Precipitaciones continuas y prolongadas de lluvia o nieve. Las más asociadas a lluvia persistente.",
      properties:
        "Composición: Gotitas de agua fría, cristales de hielo y/o nieve. Forma: Capa gris oscura densa y continua.",
    },
    {
      id: "estratocumulos",
      title: "Estratocúmulos",
      category: "nubes",
      cloudFamily: "Baja",
      altitude: "500 – 1.600 m",
      imageUrl: "/nubes/estratocumulos.jpg",
      description:
        "Formadas por gotitas de agua o nieve. La nube más común de todas. De color blancas o grisáceas. En verano suelen estar asociadas al buen tiempo, sobre todo cuando aparecen a media tarde como restos de cúmulos disipados.",
      precipitation:
        "Generalmente sin precipitaciones significativas. En invierno pueden dar llovizna o nieve ligera.",
      properties:
        "Composición: Gotitas de agua o nieve. Forma: Masas grises o blancas en rollos o parches.",
    },
    {
      id: "estratos",
      title: "Estratos",
      category: "nubes",
      cloudFamily: "Baja",
      altitude: "< 500 m",
      imageUrl: "/nubes/estratos.jpg",
      description:
        "Formada por gotitas de agua o hielo. De color grisáceo uniforme de la que pueden caer llovizna, láminas de hielo o nieve menuda (cinarra). Son la nube más baja y la más parecida a la niebla elevada.",
      precipitation:
        "Llovizna fina, láminas de hielo o cinarra. No producen lluvia intensa.",
      properties:
        "Composición: Gotitas de agua o hielo. Forma: Capa gris baja uniforme, sin estructura definida.",
    },
    {
      id: "cumulos",
      title: "Cúmulos",
      category: "nubes",
      cloudFamily: "Vertical",
      altitude: "500 – 1.600 m (base)",
      imageUrl: "/nubes/cumulos.jpg",
      description:
        "Formadas por gotitas de agua y, en las partes donde la temperatura está bajo cero, por cristales de hielo. Se desarrollan de manera vertical. En verano su tiempo asociado es bueno: cielo de buen tiempo.",
      precipitation:
        "Generalmente sin precipitaciones. Si crecen verticalmente en exceso pueden convertirse en cumulonimbos.",
      properties:
        "Composición: Gotitas de agua (base) y cristales de hielo (partes altas). Forma: Masas densas de desarrollo vertical, cúpula blanca, base plana y oscura.",
    },
    {
      id: "cumulonimbos",
      title: "Cumulonimbos",
      category: "nubes",
      cloudFamily: "Vertical",
      altitude: "300 – 1.700 m (base)",
      imageUrl: "/nubes/cumulonimbos.jpg",
      description:
        "Formadas por gotas de agua, cristales de hielo en su zona más alta, conteniendo en su interior grandes gotas de agua, nieve e incluso granizo. La nube de tormenta por excelencia. Producen fuertes lluvias e incluso granizadas.",
      precipitation:
        "⚠️ Lluvias intensas, granizo, aparato eléctrico (rayos), turbulencias severas y posibles trombas marinas. Peligro máximo para la navegación.",
      properties:
        "Composición: Agua, cristales de hielo, nieve y granizo. Forma: Torre vertical con yunque en la cima (anvil). Base muy oscura.",
    },
  ],
  radio: [
    {
      id: "vhf-16",
      title: "VHF Canal 16 — 156.800 MHz",
      category: "radio",
      description: "Frecuencia internacional de emergencia y llamada.",
      protocol:
        "Obligatoria monitorización 24/7 en navegación. Canal exclusivo para llamadas de emergencia y contacto inicial.",
      utility:
        "Primera frecuencia a monitorizar. Todos los buques deben estar equipados con VHF. Rango: ~20-25 NM (visibilidad).",
    },
    {
      id: "vhf-13",
      title: "VHF Canal 13 — 156.650 MHz",
      category: "radio",
      description: "Tráfico portuario y maniobras de buques.",
      protocol:
        "Usado entre buques en canales, puertos y escluses. Regla 10(g) COLREGS. Obligatorio en aguas confinadas.",
      utility:
        "Coordinar maniobras complejas. Obligatorio para tráfico en puertos. Rango: ~15 NM.",
    },
    {
      id: "vhf-12",
      title: "VHF Canal 12 — 156.600 MHz",
      category: "radio",
      description: "Llamadas de seguridad y control de tráfico portuario.",
      protocol:
        "Usado por autoridades portuarias y buques en puertos. Para seguridad y coordinación.",
      utility:
        "Comunicación con autoridades de puerto. Rango: ~15-20 NM.",
    },
    {
      id: "vhf-14",
      title: "VHF Canal 14 — 156.700 MHz",
      category: "radio",
      description: "Llamadas de seguridad y transmisión de información.",
      protocol: "Similar al Canal 12. Altamente directivo.",
      utility:
        "Seguridad portuaria. Comunicaciones en puerto. Rango: ~10-15 NM.",
    },
    {
      id: "vhf-70",
      title: "VHF Canal 70 — 156.525 MHz",
      category: "radio",
      description: "Digital Selective Calling (DSC) — Sistema automático de llamadas.",
      protocol:
        "Equipo DSC obligatorio en buques Solas. Permite identificación automática y enrutamiento de emergencias.",
      utility:
        "Llamadas automáticas identificadas. Rango: ~25-30 NM. Esencial para GMDSS.",
    },
    {
      id: "ssb-2182",
      title: "SSB 2182 kHz",
      category: "radio",
      description: "Frecuencia internacional de emergencia de onda media.",
      protocol:
        "Usada para MAYDAY y comunicaciones de larga distancia. Requiere equipo SSB (bandas laterales).",
      utility:
        "Emergencias en alta mar. Rango: 100-300 NM según condiciones. Obsoleta en algunos buques modernos.",
    },
    {
      id: "ssb-4125",
      title: "SSB 4125 kHz",
      category: "radio",
      description: "Frecuencia de comunicación de larga distancia MF/HF.",
      protocol:
        "Banda de seguridad marina internacional. Comunicaciones de barco a tierra.",
      utility:
        "Comunicaciones con centros de coordinación de rescate (RCC). Rango: Intercontinental.",
    },
    {
      id: "vhf-1",
      title: "VHF Canal 1 — 156.050 MHz",
      category: "radio",
      description: "Navegación costera entre buques.",
      protocol:
        "Canal de trabajo para navegación costera. No debe usarse para transmisiones largas.",
      utility:
        "Comunicación entre buques cercanos. Rango: ~15-20 NM.",
    },
    {
      id: "vhf-6",
      title: "VHF Canal 6 — 156.300 MHz",
      category: "radio",
      description: "Llamadas buque a buque.",
      protocol:
        "Específicamente para comunicaciones entre dos buques. Es cortesía establecer contacto en Canal 16 y cambiar a Canal 6.",
      utility:
        "Comunicación punto a punto entre buques. Rango: ~20-25 NM.",
    },
    {
      id: "vhf-72",
      title: "VHF Canal 72 — 156.625 MHz",
      category: "radio",
      description: "Comunicaciones entre buques — Navegación segura.",
      protocol:
        "Alternativa al Canal 6. Menos congestionado. Buenas prácticas de radiotelefonia.",
      utility:
        "Llamadas buque a buque. Rango: ~20 NM.",
    },
    {
      id: "mayday",
      title: "Procedimiento MAYDAY",
      category: "radio",
      description:
        "Señal de máxima emergencia para comunicar peligro de vida inminente.",
      protocol:
        "Pronunciado 3 veces: MAYDAY-MAYDAY-MAYDAY. Transmitir en VHF Canal 16 o SSB 2182 kHz.",
      utility:
        'Respuesta obligatoria. Todos los buques escuchan. Procedimiento: 1) MAYDAY×3 2) Identificación 3) Posición 4) Naturaleza del peligro 5) Número de personas 6) Equipo de seguridad.',
    },
    {
      id: "pan-pan",
      title: "Procedimiento PAN PAN",
      category: "radio",
      description: "Señal de urgencia — Situación seria pero controlada.",
      protocol:
        "Pronunciado 3 veces: PAN-PAN-PAN. Usar cuando MAYDAY no es apropiado pero hay urgencia.",
      utility:
        "Ej: Fallo de motor, mala estabilidad, etc. Todos escuchan pero no es máxima prioridad.",
    },
    {
      id: "securite",
      title: "Procedimiento SÉCURITÉ",
      category: "radio",
      description: "Aviso de seguridad náutica importante.",
      protocol:
        "Pronunciado 3 veces: SECURITÉ-SECURITÉ-SECURITÉ. Ej: obstáculos, detritus, condiciones peligrosas.",
      utility:
        "Información de interés para navegación segura. Menor prioridad que PAN PAN.",
    },
  ],
};
