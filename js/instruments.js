/* instruments.js
 * Static reference data for the trading journal.
 * Plain script (no modules) so it works from file:// and GitHub Pages.
 * Exposes global consts: INSTRUMENTS, ACCOUNTS, DIRECTIONS, STRATEGIES,
 * STRATEGY_IDS, STRATEGY_GROUPS, MICRO_PAIRS, EXIT_TYPES, EMOTIONS,
 * EMOTION_COLORS, DEFAULT_INSTRUMENT, DEFAULT_EMOTION, DEFAULT_BALANCES,
 * DEFAULT_RISK_PCT, DEFAULT_DAILY_TRADE_LIMIT, RISK_PCT_MIN, RISK_PCT_MAX,
 * RISK_PCT_HARD_MAX, DEFAULT_MIN_RR, DAILY_DD_WARN_PCT, STREAK_WARN,
 * SMALL_ACCOUNT_MAX, DEFAULT_SCALING_RR, DEFAULT_SCALING_DAYS,
 * SCALING_DAYS_MAX, DEFAULT_STOP_TICKS, DEFAULT_TARGET_R,
 * DEFAULT_TARGET_R_ALT.
 *
 * Instrument hours follow the exchange timezone: CME Globex uses ET,
 * Eurex uses CET/CEST. Items still pending confirmation are marked
 * "por verificar" in `hours`/`note`.
 */

const INSTRUMENTS = {
  NQ: {
    name: 'E-mini Nasdaq-100',
    exchange: 'CME Globex',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.25,
    size: 'full',
    pointValue: 20,
    commission: 4.18,
    type: 'Índice (Nasdaq-100)',
    volatility: 'Alta',
    tip: 'Movimientos amplios; ajusta el tamaño',
    note: 'Full-size del Nasdaq-100; 20 USD por punto.'
  },
  MNQ: {
    name: 'Micro E-mini Nasdaq-100',
    exchange: 'CME Globex',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.25,
    size: 'micro',
    pointValue: 2,
    commission: 1.22,
    type: 'Índice (Nasdaq-100)',
    volatility: 'Alta',
    tip: 'Movimientos amplios; ajusta el tamaño',
    note: 'Micro del Nasdaq-100; 1/10 del valor por punto del NQ.'
  },
  ES: {
    name: 'E-mini S&P 500',
    exchange: 'CME Globex',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.25,
    size: 'full',
    pointValue: 50,
    commission: 4.18,
    type: 'Índice (S&P 500)',
    volatility: 'Media-alta',
    tip: 'El más líquido; ideal para empezar',
    note: 'Full-size del S&P 500; 50 USD por punto.'
  },
  MES: {
    name: 'Micro E-mini S&P 500',
    exchange: 'CME Globex',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.25,
    size: 'micro',
    pointValue: 5,
    commission: 1.22,
    type: 'Índice (S&P 500)',
    volatility: 'Media-alta',
    tip: 'El más líquido; ideal para empezar',
    note: 'Micro del S&P 500; 1/10 del valor por punto del ES.'
  },
  YM: {
    name: 'E-mini Dow ($5)',
    exchange: 'CME Globex (CBOT)',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 1,
    size: 'full',
    pointValue: 5,
    commission: 4.08,
    type: 'Índice (Dow Jones)',
    volatility: 'Media',
    tip: 'Movimientos más suaves; ojo con el tick de 1 punto',
    note: 'Full-size del Dow; 5 USD por punto.'
  },
  MYM: {
    name: 'Micro E-mini Dow',
    exchange: 'CME Globex (CBOT)',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 1,
    size: 'micro',
    pointValue: 0.5,
    commission: 1.12,
    type: 'Índice (Dow Jones)',
    volatility: 'Media',
    tip: 'Movimientos más suaves; ojo con el tick de 1 punto',
    note: 'Micro del Dow; 0,50 USD por punto.'
  },
  '6E': {
    name: 'Euro FX (EUR/USD)',
    exchange: 'CME Globex',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.0001,
    size: 'full',
    pointValue: 125000,
    commission: 4.72,
    type: 'Divisa (EUR/USD)',
    volatility: 'Media-baja',
    tip: 'Suele respetar niveles redondos (00)',
    note: 'Full-size EUR/USD; 125.000 USD por punto; tick 0,0001 (12,50 USD por tick).'
  },
  M6E: {
    name: 'Micro EUR/USD',
    exchange: 'CME Globex',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.0001,
    size: 'micro',
    pointValue: 12500,
    commission: 1.52,
    type: 'Divisa (EUR/USD)',
    volatility: 'Media-baja',
    tip: 'Suele respetar niveles redondos (00)',
    note: 'Micro EUR/USD; 1/10 del valor por punto del 6E.'
  },
  CL: {
    name: 'WTI Crude Oil',
    exchange: 'CME Globex (NYMEX)',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.01,
    size: 'full',
    pointValue: 1000,
    commission: 4.52,
    type: 'Commodity (Petróleo WTI)',
    volatility: 'Alta',
    tip: 'Atento a inventarios y noticias',
    note: 'Full-size WTI; 1.000 USD por punto.'
  },
  MCL: {
    name: 'Micro WTI Crude Oil',
    exchange: 'CME Globex (NYMEX)',
    hours: 'Dom–Vie 18:00–17:00 ET (pausa diaria 17:00–18:00 ET)',
    tick: 0.01,
    size: 'micro',
    pointValue: 100,
    commission: 1.52,
    type: 'Commodity (Petróleo WTI)',
    volatility: 'Alta',
    tip: 'Atento a inventarios y noticias',
    note: 'Micro WTI; 100 USD por punto.'
  },
  FDAX: {
    name: 'DAX Futures',
    exchange: 'Eurex',
    hours: 'Lun–Vie 02:10–22:00 CET (inicio de mañana por verificar)',
    tick: 0.5,
    size: 'full',
    pointValue: 25,
    currency: 'EUR',
    commission: 4.08,
    type: 'Índice (DAX)',
    volatility: 'Alta',
    tip: 'Sesión europea; spreads más amplios fuera de horario',
    note: 'Full-size DAX; 25 EUR por punto; tick 0,50 (12,50 EUR por tick). Horario en CET/CEST; inicio de mañana por verificar.'
  },
  FDXM: {
    name: 'Micro-DAX (Eurex: FDXS)',
    exchange: 'Eurex',
    hours: 'Lun–Vie 01:10–22:00 CET (por verificar)',
    tick: 0.5,
    size: 'micro',
    pointValue: 5,
    currency: 'EUR',
    commission: 2.26,
    type: 'Índice (DAX)',
    volatility: 'Alta',
    tip: 'Sesión europea; spreads más amplios fuera de horario',
    note: 'Micro-DAX; 5 EUR por punto; tick 0,50 (2,50 EUR por tick). El símbolo FDXM es del bróker (Eurex: FDXS); horario por verificar.'
  }
};

const ACCOUNTS = ['Sim', 'Real', 'Fondeo'];

const DIRECTIONS = ['Largo', 'Corto'];

/* Strategy groups, in display order: scalping first, legacy last. */
const STRATEGY_GROUPS = ['scalping', 'swing', 'legacy'];

/* Strategy catalog. `id` is the stable slug persisted on each trade;
 * `name` is the display label; `group` is one of STRATEGY_GROUPS.
 * Legacy ids E1..E5 are kept verbatim and never remapped. */
const STRATEGIES = [
  { id: 'vela-a-vela', name: 'Vela a Vela', group: 'scalping' },
  { id: 'box-breakout', name: 'Box Breakout (Ruptura de laterales)', group: 'scalping' },
  { id: 'doble-00', name: 'El Doble 00', group: 'scalping' },
  { id: 'cruces-medias', name: 'Cruces de Medias Móviles', group: 'scalping' },
  { id: 'tres-impulsos', name: 'Tres Impulsos (Ruptura con tres impulsos)', group: 'swing' },
  { id: 'gaps', name: 'Operativa de Gaps', group: 'swing' },
  { id: 'figuras-chartistas', name: 'Figuras Chartistas (HCH y dobles/triples)', group: 'swing' },
  { id: 'weinstein', name: 'Método Stan Weinstein', group: 'swing' },
  { id: 'E1', name: 'E1', group: 'legacy' },
  { id: 'E2', name: 'E2', group: 'legacy' },
  { id: 'E3', name: 'E3', group: 'legacy' },
  { id: 'E4', name: 'E4', group: 'legacy' },
  { id: 'E5', name: 'E5', group: 'legacy' }
];

/* Derived, ordered list of catalog ids. */
const STRATEGY_IDS = STRATEGIES.map(function (strategy) { return strategy.id; });

/* Full-size instrument -> micro equivalent. */
const MICRO_PAIRS = {
  NQ: 'MNQ',
  ES: 'MES',
  YM: 'MYM',
  '6E': 'M6E',
  CL: 'MCL',
  FDAX: 'FDXM'
};

const EXIT_TYPES = ['Profit', 'Stop', 'Break Even', 'Trailing stop', 'Cierre manual'];

const EMOTIONS = [
  'Ansiedad',
  'Codicia',
  'Confianza',
  'Control',
  'Duda',
  'FOMO',
  'Frustración',
  'Impaciencia',
  'Miedo',
  'Venganza'
];

/* Default entry-form selections when nothing has been remembered yet. MES is
 * the intended starting instrument and Confianza the intended emotion. */
const DEFAULT_INSTRUMENT = 'MES';
const DEFAULT_EMOTION = 'Confianza';

/* Per-emotion color tokens. This is data, not scattered CSS: the UI reads the
 * map to tint the emotion dot/badge. Values reference the dark palette custom
 * properties so the theme stays sober and centralized.
 *   positive/controlled (Confianza, Control)  -> green / blue
 *   negative (Miedo, FOMO, Venganza, ...)     -> red / amber
 *   neutral (Duda, Impaciencia)               -> muted grey
 * Unknown emotions fall back to the neutral token. */
const EMOTION_COLORS = {
  Ansiedad: 'var(--amber)',
  Codicia: 'var(--amber)',
  Confianza: 'var(--pos)',
  Control: 'var(--accent)',
  Duda: 'var(--text-faint)',
  FOMO: 'var(--neg)',
  'Frustración': 'var(--neg)',
  Impaciencia: 'var(--text-faint)',
  Miedo: 'var(--neg)',
  Venganza: 'var(--neg)'
};

const DEFAULT_BALANCES = { Sim: 5000, Real: 5000, Fondeo: 50000 };

/* Default per-account risk settings (used when nothing was persisted). */
const DEFAULT_RISK_PCT = 2;
const DEFAULT_DAILY_TRADE_LIMIT = 3;

/* Risk-discipline bounds and warning thresholds.
 * Recommended risk band is 0.5%–2%; 3% is the hard maximum. */
const RISK_PCT_MIN = 0.5;
const RISK_PCT_MAX = 2;
const RISK_PCT_HARD_MAX = 3;
const DEFAULT_MIN_RR = 2;
const DAILY_DD_WARN_PCT = 5;
const STREAK_WARN = 3;

/* Small-account circuit breaker: at or below this capital the calculator is
 * forced to a single contract so a tiny account can never over-size. */
const SMALL_ACCOUNT_MAX = 5000;

/* Per-instrument stop/target defaults, expressed in TICKS (the authoritative
 * unit) and configurable per account in Ajustes. A tick maps to a different
 * number of points per instrument, so the UI also shows the points equivalent
 * (`ticks × tick`). `DEFAULT_STOP_TICKS` matches the calculator's historical
 * default input (8); `DEFAULT_TARGET_R`/`DEFAULT_TARGET_R_ALT` keep the BPT
 * 2:1 / 3:1 range when an instrument has no explicit configuration. */
const DEFAULT_STOP_TICKS = 8;
const DEFAULT_TARGET_R = DEFAULT_MIN_RR;
const DEFAULT_TARGET_R_ALT = DEFAULT_MIN_RR + 1;

/* Daily scaling-plan defaults (proportional compounding projection).
 * `DEFAULT_SCALING_RR` is the R/B expectancy (2 means 2:1) and
 * `DEFAULT_SCALING_DAYS` the projection horizon. `SCALING_DAYS_MAX` caps the
 * horizon so a mistyped day count cannot freeze the UI. */
const DEFAULT_SCALING_RR = 2;
const DEFAULT_SCALING_DAYS = 20;
const SCALING_DAYS_MAX = 365;
