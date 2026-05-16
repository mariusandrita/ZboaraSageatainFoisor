export const PRODARTS_NAME_MAP = {
  'Adela.A': 'Adela',
  sica666: 'Marius',
  MariusA: 'Marius',
  MariusAND: 'Marius',
  TeluAND: 'Telu',
  IonelaAND: 'Ionela',
  'Stefania.I': 'Stefania',
  Iulica: 'Iulica',
  'Iulica.Cra': 'Iulica',
  GabrielMiner: 'Gabriel Laudat',
  'Iulia.AND': 'Iulia',
};

export const PRODARTS_ACTIVE_PLAYERS = new Set([
  'Adela',
  'Axa',
  'Gabriel Laudat',
  'Iulia',
  'Leo',
  'Marius',
  'Telu',
  'Ionela',
  'Stefania',
  'Iulica',
]);

export function resolveCanonicalProdartsName(name) {
  const normalized = String(name ?? '').trim();
  return PRODARTS_NAME_MAP[normalized] ?? normalized;
}

export function prodartsPlayerVisibility(name) {
  const canonicalName = resolveCanonicalProdartsName(name);
  const isActive = PRODARTS_ACTIVE_PLAYERS.has(canonicalName);

  return {
    canonicalName,
    isPlayable: isActive ? 1 : 0,
    statsVisible: isActive ? 1 : 0,
  };
}
