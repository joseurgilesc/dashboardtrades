/* instruments.js
 * Static reference data for the trading journal.
 * Plain script (no modules) so it works from file:// and GitHub Pages.
 * Exposes global consts: INSTRUMENTS, ACCOUNTS, DIRECTIONS, STRATEGIES,
 * EXIT_TYPES, EMOTIONS, DEFAULT_BALANCES.
 */

const INSTRUMENTS = {
  NQ:   { pointValue: 20,     commission: 4.18 },
  MNQ:  { pointValue: 2,      commission: 1.22 },
  ES:   { pointValue: 50,     commission: 4.18 },
  MES:  { pointValue: 5,      commission: 1.22 },
  YM:   { pointValue: 5,      commission: 4.08 },
  MYM:  { pointValue: 0.5,    commission: 1.12 },
  '6E': { pointValue: 125000, commission: 4.72 },
  M6E:  { pointValue: 12500,  commission: 1.52 },
  CL:   { pointValue: 1000,   commission: 4.52 },
  MCL:  { pointValue: 100,    commission: 1.52 },
  FDAX: { pointValue: 25,     commission: 4.08 },
  FDXM: { pointValue: 5,      commission: 2.26 }
};

const ACCOUNTS = ['Sim', 'Real', 'Fondeo'];

const DIRECTIONS = ['Largo', 'Corto'];

const STRATEGIES = ['E1', 'E2', 'E3', 'E4', 'E5'];

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

const DEFAULT_BALANCES = { Sim: 5000, Real: 5000, Fondeo: 50000 };
