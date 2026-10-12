import type { Lang } from "./types";

/* ---------------------------------------------------------------------------
   Text handling for the no-key assistant: normalise, tokenise, map English and
   Spanish words onto shared concepts ("basura" and "rubbish" both become "bin"),
   and score documents against a question.
   --------------------------------------------------------------------------- */

/** Lower-case, strip accents, keep letters/digits, collapse spaces. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const STOP = new Set(
  (
    // English
    "a an the is are was were be been being am to of in on at for and or i me my mine we our ours us you your yours it its " +
    "this that these those do does did doing can could should would will shall may might must what whats when where who whom " +
    "which why how there theres here please tell know about with from by any some get got have has had need want like just " +
    "also if so than then them they he she his her hers as up out into over under much many more most very too not no yes ok " +
    "okay hi hello hey thanks thank anyone someone something one all im ive id dont doesnt isnt cant let lets give find show " +
    "see look help kind best way go going nearest near closest next our s t good nice great better nearby around " +
    "local somewhere anywhere install put buy use using take bring keep make possible really usually normally old " +
    "time times happen happens happened lose after before look looks looking " +
    "still already ever often every tomorrow today tonight " +
    // Spanish
    "el la los las un una unos unas de del al y o u que es son era por para con se mi mis tu tus su sus nuestro nuestra " +
    "nuestros nuestras me te le les lo como cuando donde quien quienes cual cuales hay esta estan este estos estas eso ese esa " +
    "muy mas tengo tiene puedo puede pueden hacer hace ser si sobre cuanto cuanta cuantos cuantas hola gracias favor alguien algo " +
    "saber quiero quisiera necesito dime decir cerca cercana cercano cercanas cercanos bueno buena buen buenos buenas mejor " +
    "alguna alguno algun algunos algunas poner instalar usar traer tener llevar sitio lugar zona aqui alli ahi poder hoy manana " +
    "mucho mucha muchos muchas poco poca hacen hago hacemos siempre nunca todo toda todos todas otro otra otros otras ya aun " +
    "tambien pero sin solo ahora estoy estamos tenemos podemos debo debe deben dejo dejar dejarlo viejo vieja viejos viejas tirar tiro"
  ).split(/\s+/),
);

/** Words that mean the same thing for our purposes → one concept token. */
const SYNONYMS: Record<string, string> = {};
function syn(concept: string, words: string) {
  for (const w of words.split(/\s+/)) if (w) SYNONYMS[w] = concept;
}
syn("bin", "bin bins rubbish trash garbage waste refuse recycling recycle basura basuras residuo residuos contenedor contenedores reciclaje reciclar cubo cubos collection collected collect recogida recogen recoge");
syn("glass", "glass bottle bottles jar jars vidrio vidrios cristal botella botellas igloo iglu tarro tarros");
syn("paper", "paper cardboard papel carton cartones box boxes caja cajas periodico periodicos");
syn("plastic", "plastic plastics can cans tin tins packaging cartons envase envases plastico plasticos lata latas amarillo yellow");
syn("organic", "organic food compost kitchen organico organica organicos restos comida brown marron");
syn("general", "general household grey gray resto gris");
syn("leak", "leak leaks leaking leaked water flood flooded flooding drip dripping burst pipe pipes fuga fugas agua gotera goteras inundacion tuberia tuberias humedad stopcock");
syn("president", "president presidente presidenta chairman chairwoman chair");
syn("vicepresident", "vicepresident vicepresidente vicepresidenta");
syn("secretary", "secretary secretario secretaria");
syn("treasurer", "treasurer tesorero tesorera");
syn("concierge", "concierge porter doorman conserje conserjeria portero caretaker reception recepcion gatehouse");
syn("pool", "pool pools swimming swim piscina piscinas bano banarse nadar");
syn("pharmacy", "pharmacy pharmacies chemist chemists farmacia farmacias medicine medicines prescription receta medicamento medicamentos");
syn("meeting", "meeting meetings agm assembly junta juntas reunion reuniones asamblea egm");
syn("representative", "representative representatives rep reps delegate delegates representante representantes delegado delegada vocal");
syn("office", "office oficina administration administrator administrador administradora administracion management gestor gestoria manager");
syn("maintenance", "maintenance repair repairs plumber plumbing electrician electrics handyman mantenimiento fontanero electricista reparacion reparaciones arreglar fix");
syn("lift", "lift lifts elevator elevators ascensor ascensores");
syn("garage", "garage garages parking car cars garaje aparcamiento aparcar coche coches");
syn("remote", "remote remotes mando mandos fob");
syn("emergency", "emergency emergencies emergencia emergencias urgent urgente urgencia urgencias fire police ambulance policia bomberos ambulancia incendio");
syn("noise", "noise noisy quiet loud music party parties bark barks barking ladra ladran ladrar ladrando ladridos ruido ruidos ruidoso ruidosos silencio musica fiesta fiestas");
syn("health", "doctor doctors gp health medical hospital clinic medico salud clinica ambulatorio");
syn("bus", "bus buses transport taxi autobus autobuses transporte");
syn("walk", "walk walks walking stroll route routes paseo paseos caminar ruta rutas promenade");
syn("beach", "beach beaches playa playas seafront sea seaside maritimo");
syn("restaurant", "restaurant restaurants eat dinner lunch restaurante restaurantes comer cenar almorzar");
syn("cafe", "cafe cafes coffee cafeteria churros");
syn("shop", "shop shops shopping supermarket groceries grocery supermercado tienda tiendas compra market mercado mercadillo");
syn("parcel", "parcel parcels package packages delivery deliveries amazon paquete paquetes post mensajero paqueteria");
syn("key", "key keys llave llaves locked lockout cerrajero locksmith");
syn("fee", "fee fees quota quotas cuota cuotas payment payments pay pagar paga pagan pagamos pago pagos due domiciliacion recibo recibos");
syn("pet", "pet pets dog dogs cat cats mascota mascotas perro perros gato gatos");
syn("barbecue", "barbecue barbecues bbq grill barbacoa barbacoas parrilla");
syn("satellite", "satellite dish antenna aerial tv television parabolica antena");
syn("holiday", "airbnb holiday holidays vacation rental rentals let lets letting alquiler alquilar vacacional turistico turistica tourist tourists turista turistas vft");
syn("flat", "flat flats apartment apartments piso pisos apartamento apartamentos vivienda viviendas");
syn("intercom", "intercom buzzer doorbell telefonillo interfono videoportero");
syn("moving", "move moving removal removals mudanza mudarse");
syn("bulky", "bulky furniture mueble muebles trastos enseres mattress mattresses colchon colchones sofa sofas fridge voluminoso voluminosos");
syn("guest", "guest guests visitor visitors invitado invitados visita visitas");
syn("report", "report reports reporting complaint complaints problem problems broken fault faulty queja quejas averia averias roto rota incidencia incidencias denunciar reportar");
syn("document", "document documents doc docs statutes estatutos minutes actas acta insurance seguro poliza");
syn("budget", "budget budgets spend spent spending cost costs money presupuesto gasto gastos gastamos gastado gastar gasta gastan gastaron dinero coste costes");
syn("contract", "contract contracts contrato contratos supplier suppliers proveedor proveedores");
syn("hours", "hours hour open opening opens close closes closing horario horarios hora horas abre abren abierto abierta cierra cierran cerrado");
syn("contact", "contact phone telephone number numbers call ring email whatsapp telefono numero llamar contactar correo movil mobile");
syn("garden", "garden gardens gardening gardener jardin jardines jardinero jardineria");
syn("cleaning", "cleaning clean cleans cleaned cleaner cleaners limpieza limpiar limpia limpian limpiador limpiadora");
syn("insurance", "insurance insurer aseguradora");
syn("neighbour", "neighbour neighbours neighbor neighbors vecino vecinos vecina vecinas resident residents upstairs downstairs arriba abajo");
syn("block", "block blocks bloque bloques building buildings edificio portal");
syn("rule", "rule rules regulation regulations norma normas reglas reglamento allowed permitted prohibido permitido admite admiten permite permiten");

// Multi-word phrases first, so "centro de salud" is not read as "centre" + "health".
const PHRASES: [RegExp, string][] = [
  [/\bcentro de salud\b/g, " health "],
  [/\bportero automatico\b/g, " intercom "],
  [/\bvice ?president[ae]?\b/g, " vicepresident "],
  [/\bgeneral meeting\b/g, " meeting "],
  [/\bjunta general\b/g, " meeting "],
  [/\bswimming pool\b/g, " pool "],
  [/\bsatellite dish\b/g, " satellite "],
  [/\bstop ?cock\b/g, " leak "],
  [/\bfood waste\b/g, " organic "],
  [/\bpaper and cardboard\b/g, " paper "],
  [/\bplastic,? cans and cartons\b/g, " plastic "],
  [/\bgeneral waste\b/g, " general "],
  [/\bbloque ([abc])\b/g, " block $1 "],
  // "Where can I park my car?" is about parking, not the botanical park.
  [/\b(?:can|do|could|should|may|to|where)( i| we| you| guests| visitors)? park\b/g, " garage "],
  [/\bpark(?= (?:my|the|a|our|your|his|her|their|outside|overnight|here|there)\b)/g, " garage "],
];

function stem(w: string): string {
  if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(ches|shes|xes|sses)$/.test(w)) return w.slice(0, -2);
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** Tokens for scoring: concepts for known words, light stems for everything else. */
export function tokens(text: string): string[] {
  let s = " " + normalize(text) + " ";
  for (const [re, rep] of PHRASES) s = s.replace(re, rep);
  const out: string[] = [];
  for (const w of s.split(" ")) {
    if (!w || STOP.has(w)) continue;
    if (/^\d+$/.test(w) && w.length < 3) continue;
    if (w.length < 2) continue;
    const c = SYNONYMS[w] ?? SYNONYMS[stem(w)];
    if (c) { out.push(c); continue; }
    const st = stem(w);
    if (STOP.has(st) || st.length < 3) continue;
    out.push(st);
  }
  return out;
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokens(text));
}

/** Raw normalised words (no stop-word removal), for intent patterns. */
export function words(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

const ES_MARKERS = new Set(
  "el la los las una unos del que cuando donde quien como hay para por esta estan es son mi mis tengo puedo cual cuanto cuantos hola gracias se recoge recogen basura vidrio piscina farmacia reunion junta proxima siguiente horario telefono numero presidente conserje bloque fuga agua llaves perro mascotas mudanza paquetes cuotas quiero necesito hacer".split(" "),
);
const EN_MARKERS = new Set(
  "the is are when where who how what my do does can i we our you your there please collected bins pool hours meeting next phone number president concierge block leak report".split(" "),
);

/** Very small language guess: Spanish or English. */
export function detectLang(question: string, fallback: Lang = "en"): Lang {
  if (/[¿¡ñ]/i.test(question)) return "es";
  let es = 0, en = 0;
  for (const w of words(question)) {
    if (ES_MARKERS.has(w)) es++;
    if (EN_MARKERS.has(w)) en++;
  }
  if (es > en) return "es";
  if (en > es) return "en";
  return fallback;
}

/* ---------------------------------------------------------------------------
   Scoring
   --------------------------------------------------------------------------- */

export type Doc<T = unknown> = {
  key: string;
  title: string;
  body: string;
  data: T;
  /** Extra words that should match this document (e.g. place type, folder). */
  tags?: string;
};

type Indexed<T> = Doc<T> & { titleTokens: Set<string>; bodyTokens: Set<string> };

export type Hit<T> = { doc: Doc<T>; score: number; coverage: number; matched: string[]; inTitle: number; unknown: number };

export function rank<T>(question: string, docs: Doc<T>[], opts: { limit?: number; minCoverage?: number; ignore?: string[] } = {}): Hit<T>[] {
  const q = [...new Set(tokens(question))].filter((t) => !opts.ignore?.includes(t));
  if (!q.length || !docs.length) return [];
  const idx: Indexed<T>[] = docs.map((d) => ({
    ...d,
    titleTokens: tokenSet(d.title + " " + (d.tags ?? "")),
    bodyTokens: tokenSet(d.body),
  }));
  const n = idx.length;
  const idf = new Map<string, number>();
  for (const t of q) {
    const df = idx.filter((d) => d.titleTokens.has(t) || d.bodyTokens.has(t)).length;
    // A word that appears nowhere keeps the highest weight: it tells us the question is about something we don't have.
    idf.set(t, Math.log(1 + n / (1 + df)));
  }
  const total = q.reduce((sum, t) => sum + (idf.get(t) ?? 0), 0) || 1;
  // Words that appear nowhere: the question is (partly) about something the community hasn't written about.
  const unknown = q.filter((t) => !idx.some((d) => d.titleTokens.has(t) || d.bodyTokens.has(t))).length;

  const hits: Hit<T>[] = [];
  for (const d of idx) {
    let score = 0, matchedWeight = 0, inTitle = 0;
    const matched: string[] = [];
    for (const t of q) {
      const w = idf.get(t) ?? 0;
      if (d.titleTokens.has(t)) { score += 2 * w; matchedWeight += w; matched.push(t); inTitle++; }
      else if (d.bodyTokens.has(t)) { score += w; matchedWeight += w; matched.push(t); }
    }
    if (!matched.length) continue;
    hits.push({ doc: d, score, coverage: matchedWeight / total, matched, inTitle, unknown });
  }
  const min = opts.minCoverage ?? 0.5;
  return hits
    .filter((h) => h.coverage >= min)
    .sort((a, b) => b.score - a.score || b.coverage - a.coverage)
    .slice(0, opts.limit ?? 5);
}

/** First sentences of a text, cut at a word boundary. */
export function snippet(text: string, max = 280): string {
  const t = text.replace(/\s+\n/g, "\n").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("\n"));
  if (stop > max * 0.5) return cut.slice(0, stop + 1).trim();
  return cut.slice(0, cut.lastIndexOf(" ")).trim() + "…";
}

/** Has the question got any of these concepts? */
export function hasAny(q: Set<string>, ...concepts: string[]) {
  return concepts.some((c) => q.has(c));
}
