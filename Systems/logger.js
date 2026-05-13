const IMPORTANT_LOG_PATTERNS = [
  /Loading version/i,
  /Lancement du bot/i,
  /Connexion a Discord/i,
  /Bot en ligne/i,
  /Serveur\(s\)/i,
  /Total des commandes/i,
  /Serveur HTTP pret|Serveur HTTP prêt/i,
  /Commandes .*deployee|Deploiement global termine/i
];

function isDebugEnabled() {
  return String(process.env.DEBUG_LOGS || '').toLowerCase() === 'true' ||
    String(process.env.LOG_LEVEL || '').toLowerCase() === 'debug';
}

function installConsoleFilter() {
  if (global.__UBOT_LOGGER_INSTALLED__) return;
  global.__UBOT_LOGGER_INSTALLED__ = true;

  if (isDebugEnabled()) return;

  const originalLog = console.log.bind(console);
  const originalInfo = console.info.bind(console);

  const shouldPrint = args => {
    const message = args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ');
    return IMPORTANT_LOG_PATTERNS.some(pattern => pattern.test(message));
  };

  console.log = (...args) => {
    if (shouldPrint(args)) originalLog(...args);
  };

  console.info = (...args) => {
    if (shouldPrint(args)) originalInfo(...args);
  };
}

module.exports = {
  installConsoleFilter,
  isDebugEnabled
};
