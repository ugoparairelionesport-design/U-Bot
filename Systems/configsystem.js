const fs = require('fs');
const path = require('path');
console.log('🚀 [configsystem.js] Loading version 2.9.17 (Polishing & Fixes)...');
const { fetch } = require('undici');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  EmbedBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionsBitField,
} = require('discord.js');
const configPath = path.join(__dirname, '../Data/config.json');
let lastSavedContent = ""; // Cache mémoire pour optimiser les I/O

// Default config for a new guild
const defaultConfig = {
  guilds: {} // Structure: { "guildId": { categories: {}, roles: {}, ... } }
};

const defaultGuildSettings = {
  categories: {},
  roles: {},
  logsChannel: null,
  statsChannel: null,
  statsMessageId: null,
  panelMessages: {},
  panelOptions: {},
  stats: { opened: 0, closed: 0 },
  claims: {},
  ticketCount: {},
  ticketOwners: {},
  ticketOpenTime: {},
  ticketCreatedAt: {},
  ticketChoices: {},
  ticketFirstResponses: {},
  responseStats: {
    totalMs: 0,
    count: 0,
    staff: {}
  },
  staffStats: {},
  pendingClosures: {},
  pendingDeletions: {},
  closingTickets: {},
  securityHashtag: null, // Ajout du hashtag de sécurité par défaut
  detailedLogs: {
    enabled: false,
    categoryId: null,
    channels: {
      message: null, member: null, mod: null, server: null
    }
  },
  entrance: {
    enabled: false,
    welcomeChannel: null,
    leaveChannel: null,
    welcomeDm: false,
    welcomeImage: false,
    welcomeImageBg: null,
    autoRoles: [],
    rulesEnabled: false,
    rulesRoleId: null,
    rulesChannelId: null,
    rulesText: "Bienvenue ! Pour accéder à l'intégralité du serveur, veuillez lire et accepter notre règlement en cliquant sur le bouton ci-dessous.",
    statsChannel: null, // Salon vocal pour le compteur de membres
    welcomeText: "Bienvenue {user} sur **{server}** ! Nous sommes maintenant {count}.",
    leaveText: "**{user}** a quitté le navire. Nous sommes {count}."
  },
  xp: {
    enabled: false,
    levelUpChannel: null,
    cooldown: 60, // Secondes entre chaque gain
    xpRange: [15, 25], // Min/Max XP par message
    users: {} // userId: { xp, level, prestige, badges: [], lastMessage: 0 }
  },
  liveConfigs: [], // Ajout de la liste des configurations de live
  ai: {
    enabled: false,
    chatEnabled: false,
    autoTranslate: false,
    spellCheck: false,
    staffSuggestions: false,
    aiChannel: null
  }
};

// Default settings for protection modules
defaultGuildSettings.antiRaid = {
  enabled: false,
  threshold: 5,   // Membres
  window: 10,      // Secondes
  minAge: 24,     // Heures (âge du compte)
  lockdown: false,
  logChannel: null
};
defaultGuildSettings.antiSpam = {
  enabled: false,
  maxDuplicates: 3,
  maxMessages: 5,
  window: 5,
  maxLinks: 2,
  action: 'timeout', // warn, timeout, kick, ban
  timeoutDuration: 10,
  logChannel: null
};
defaultGuildSettings.verification = {
  enabled: false,
  roleId: null,
  channelId: null,
  logChannel: null
};
defaultGuildSettings.dmLock = {
  enabled: false,
  logChannel: null
};
defaultGuildSettings.globalEmbedBanner = null; // Image de fond pour tous les embeds
defaultGuildSettings.globalEmbedColor = "#5865F2"; // Couleur par défaut pour tous les embeds


function loadConfig() {
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return { ...defaultConfig };
  }

  try {
    const content = fs.readFileSync(configPath, 'utf8');
    if (!content.trim()) return { ...defaultConfig };
    const parsedConfig = JSON.parse(content);

    // Migration des anciennes configs vers la nouvelle structure
    for (const guildId in parsedConfig.guilds) {
      let modified = false;
      const guildConfig = parsedConfig.guilds[guildId];
      for (const key in defaultGuildSettings) {
        if (guildConfig[key] === undefined) {
          guildConfig[key] = JSON.parse(JSON.stringify(defaultGuildSettings[key]));
          modified = true;
        }
      }
      if (modified) console.log(`ℹ️ [CONFIG] Migration de la config pour la guilde ${guildId}`);
    }

    return parsedConfig;
  } catch (err) {
    console.error("❌ Erreur lecture config.json (Fichier corrompu) :", err.message);
    return { ...defaultConfig };
  }
}

let configData = loadConfig();

function getFullConfig() {
  return configData;
}

function cloneDefaultGuildSettings() {
  return JSON.parse(JSON.stringify(defaultGuildSettings));
}

function mergeDeep(target, source) {
  let modified = false;
  for (const key in source) {
    if (source[key] instanceof Object && !Array.isArray(source[key])) {
      if (!target[key]) {
        target[key] = {};
        modified = true;
      }
      if (mergeDeep(target[key], source[key])) modified = true;
    } else if (target[key] === undefined) {
      target[key] = JSON.parse(JSON.stringify(source[key]));
      modified = true;
    }
  }
  return modified;
}

function hasLegacyRootConfig(data) {
  if (!data || typeof data !== 'object' || data.guilds) return false;
  return Object.keys(defaultGuildSettings).some(key => data[key] !== undefined);
}

function migrateLegacyRootConfig(guildId) {
  if (!hasLegacyRootConfig(configData)) return false;

  const legacyConfig = { ...configData };
  const migratedGuildConfig = cloneDefaultGuildSettings();

  for (const key of Object.keys(legacyConfig)) {
    if (key === 'guilds') continue;
    migratedGuildConfig[key] = legacyConfig[key];
  }

  mergeDeep(migratedGuildConfig, defaultGuildSettings);
  configData = { guilds: { [guildId]: migratedGuildConfig } };
  saveConfig(configData);
  console.log(`ℹ️ [CONFIG] Ancienne config racine migrée vers la guilde ${guildId}`);
  return true;
}

function getGuildConfig(guildId) {
  migrateLegacyRootConfig(guildId);

  if (!configData.guilds) configData.guilds = {};
  if (!configData.guilds[guildId]) {
    configData.guilds[guildId] = cloneDefaultGuildSettings();
    saveConfig(configData);
  } else {
    // Migration Récursive : S'assure que même les sous-objets (antiRaid, ai, etc.) existent
    let modified = mergeDeep(configData.guilds[guildId], defaultGuildSettings);

    // Migration/Nettoyage automatique des URLs de Live pour éviter le crash des 100 caractères
    if (configData.guilds[guildId].liveConfigs) {
      configData.guilds[guildId].liveConfigs.forEach(l => {
        if (l.url && (l.url.includes('?') || l.url.includes('<') || l.url.includes('>'))) {
          try {
            l.url = l.url.replace(/<|>/g, '').split('?')[0].replace(/\/$/, '');
            modified = true;
          } catch (e) {}
        }
      });
    }

    const normalizedBannerUrl = normalizeStoredAssetUrl(configData.guilds[guildId].globalEmbedBanner);
    if (normalizedBannerUrl !== configData.guilds[guildId].globalEmbedBanner) {
      configData.guilds[guildId].globalEmbedBanner = normalizedBannerUrl;
      modified = true;
    }

    if (modified) saveConfig(configData);
  }
  return configData.guilds[guildId];
}

/**
 * Sauvegarde "World Class" : utilise un cache mémoire pour éviter les lectures disque
 */
function saveConfig(data) {
  const content = JSON.stringify(data, null, 2);
  if (content !== lastSavedContent) {
    fs.writeFileSync(configPath, content);
    lastSavedContent = content;
  }
}

function startVisualTimer(message, deleteAt) {
  if (message?.attachments?.size > 0) return;

  let lastSecond = -1;
  const isDeletionStillPending = () => {
    const guildId = message?.channel?.guild?.id;
    const channelId = message?.channel?.id;
    if (!guildId || !channelId) return true;
    return Boolean(getGuildConfig(guildId).pendingDeletions?.[channelId]);
  };

  const updateFooter = async () => {
    try {
      if (!message || !message.editable) return;
      if (!isDeletionStillPending()) return;
      const timeRemaining = deleteAt - Date.now();

      if (timeRemaining <= 0) return;

      const currentSecond = Math.floor(timeRemaining / 1000);
      if (currentSecond !== lastSecond) {
        lastSecond = currentSecond;
        const minutes = Math.floor(currentSecond / 60);
        const seconds = currentSecond % 60;
        const timeStr = `⏱️ Suppression dans ${minutes}:${seconds.toString().padStart(2, '0')}`;
        if (message.embeds && message.embeds.length > 0) {
          try {
            const embeds = message.embeds.map(embed =>
              EmbedBuilder.from(embed.toJSON()).setFooter({ text: timeStr })
            );
            await message.edit({ embeds });
          } catch (_) {}
        }
      }
    } catch (_) {}
  };

  // Premier appel immédiat pour éviter le délai de 100ms
  updateFooter();

  const timerInterval = setInterval(async () => {
    if (Date.now() >= deleteAt || !isDeletionStillPending()) {
      clearInterval(timerInterval);
      return;
    }
    await updateFooter();
  }, 5000); // Optimisé : 5s pour éviter les rate limits Discord tout en restant fluide
}

const TICKET_DELETE_DELAY_MS = 30 * 60 * 1000;
const CONFIG_MESSAGE_DELETE_DELAY_MS = 5 * 60 * 1000; // Passage à 5 minutes pour la configuration
const PENDING_CLOSE_EXPIRE_MS = 10 * 60 * 1000;
const pendingTicketCreations = new Map();
const recentInteractionActions = new Map();
const TICKET_ACTION_LOCK_MS = 8 * 1000;

function cleanupRecentInteractionActions(now = Date.now()) {
  for (const [key, timestamp] of recentInteractionActions) {
    if (now - timestamp > 60 * 1000) recentInteractionActions.delete(key);
  }
}

function consumeRecentInteractionAction(interaction, windowMs = 1200) {
  const now = Date.now();
  cleanupRecentInteractionActions(now);
  const key = [
    interaction.guildId || 'global',
    interaction.channelId || 'no-channel',
    interaction.message?.id || 'no-message',
    interaction.user?.id || 'anonymous',
    interaction.customId || 'unknown'
  ].join(':');

  const previous = recentInteractionActions.get(key);
  if (previous && now - previous < windowMs) return true;
  recentInteractionActions.set(key, now);
  return false;
}

function consumeTicketActionLock(guildConfig, channelId, action, ttlMs = TICKET_ACTION_LOCK_MS) {
  if (!guildConfig || !channelId || !action) return false;
  const now = Date.now();
  if (!guildConfig.ticketActionLocks || typeof guildConfig.ticketActionLocks !== 'object') {
    guildConfig.ticketActionLocks = {};
  }

  for (const [key, timestamp] of Object.entries(guildConfig.ticketActionLocks)) {
    if (!timestamp || now - timestamp > 5 * 60 * 1000) {
      delete guildConfig.ticketActionLocks[key];
    }
  }

  const key = `${channelId}:${action}`;
  const previous = guildConfig.ticketActionLocks[key];
  if (previous && now - previous < ttlMs) return true;
  guildConfig.ticketActionLocks[key] = now;
  return false;
}

async function quietlyAcknowledgeComponent(interaction) {
  if (interaction.replied || interaction.deferred) return null;
  if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
    return interaction.deferUpdate().catch(() => null);
  }
  return null;
}

async function replyAndAutoDelete(interaction, payload) {
  let message = null;
  try {
    payload = applyInteractionEmbedDefaults(interaction, payload, 'reply-banner');

    if (interaction.deferred && !interaction.replied) {
      message = await interaction.editReply(payload);
    } else if (interaction.replied) {
      message = await interaction.followUp(payload);
    } else if (payload.message && payload.message.acknowledged) {
        return; // Évite l'erreur si déjà acquitté
    } else {
      message = await interaction.reply(payload);
    }

    // Auto-delete messages with ephemeral flag after CONFIG_MESSAGE_DELETE_DELAY_MS
    if (payload && payload.flags === 64) {
      setTimeout(() => {
        interaction.deleteReply().catch(() => {});
      }, CONFIG_MESSAGE_DELETE_DELAY_MS);
    }

    return message;
  } catch (err) {
    // On ignore silencieusement l'erreur de double réponse
    if (err.code !== 40060 && !err.message?.includes('already been acknowledged')) {
        console.warn('SAFE REPLY ERROR:', err?.message || err);
    }
    // En cas d'erreur (ex: Unknown Interaction), on tente un followUp discret
    try {
      message = await interaction.followUp(payload);
      if (payload && payload.flags === 64) {
        setTimeout(() => {
          interaction.deleteReply().catch(() => {});
        }, CONFIG_MESSAGE_DELETE_DELAY_MS);
      }
      return message;
    } catch (_) {
      return null;
    }
  }
}

async function updateComponentMessage(interaction, payload) {
  try {
    payload = applyInteractionEmbedDefaults(interaction, payload, 'component-banner');
    const editablePayload = { ...payload };
    delete editablePayload.flags;
    editablePayload.attachments = [];

    if (!interaction.deferred && !interaction.replied && interaction.isModalSubmit?.() && typeof interaction.update === 'function') {
      return await interaction.update(editablePayload);
    }

    if (!interaction.deferred && !interaction.replied) {
      if (typeof interaction.deferUpdate === 'function') {
        await interaction.deferUpdate();
      } else {
        await interaction.deferReply({ flags: 64 }).catch(() => {});
      }
    }

    return await interaction.editReply(editablePayload);
  } catch (err) {
    if (err.code !== 10062 && err.code !== 40060) {
      console.warn('SAFE UPDATE ERROR:', err?.message || err);
    }

    if (interaction.message?.editable) {
      const editablePayload = { ...payload };
      delete editablePayload.flags;
      editablePayload.attachments = [];
      return interaction.message.edit(editablePayload).catch(() => null);
    }
    return null;
  }
}

async function sendOrUpdatePanel(interaction, payload) {
  if (interaction.isButton?.() || interaction.isStringSelectMenu?.()) {
    return updateComponentMessage(interaction, payload);
  }

  return replyAndAutoDelete(interaction, payload);
}

/* ========================= */
function formatDate() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('fr-FR', {
      timeZone: 'Europe/Paris',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(new Date()).map(part => [part.type, part.value])
  );
  const day = parts.day;
  const month = parts.month;
  const hour = parts.hour;
  const minute = parts.minute;
  return `${day}-${month}-${hour}h${minute}`;
}

function sanitizeChannelPart(value, fallback = 'ticket') {
  const sanitized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  return sanitized || fallback;
}

function trimChannelName(name, maxLength = 100) {
  return name
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/g, '');
}


function getPublicBaseUrl() {
  const replitDomains = process.env.REPLIT_DOMAINS;
  if (replitDomains) {
    const domain = String(replitDomains).split(',')[0].trim();
    if (domain) return `https://${domain}`;
  }

  const replName = process.env.REPL_SLUG;
  const replOwner = process.env.REPL_OWNER;
  if (replName && replOwner) return `https://${replName}.${replOwner}.replit.app`;

  const devDomain = process.env.REPLIT_DEV_DOMAIN;
  if (devDomain) return `https://${String(devDomain).split(',')[0].trim()}`;

  return null;
}

function getImageExtensionFromContentType(contentType) {
  const cleanType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (cleanType === 'image/jpeg' || cleanType === 'image/jpg') return '.jpg';
  if (cleanType === 'image/png') return '.png';
  if (cleanType === 'image/gif') return '.gif';
  if (cleanType === 'image/webp') return '.webp';
  return null;
}

function getImageExtensionFromBuffer(buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return '.png';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return '.jpg';
  if (buffer.subarray(0, 3).toString() === 'GIF') return '.gif';
  if (buffer.subarray(8, 12).toString() === 'WEBP') return '.webp';
  return null;
}

function normalizeStoredAssetUrl(url) {
  const publicBaseUrl = getPublicBaseUrl();
  if (!url || !publicBaseUrl) return url;

  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.pathname.startsWith('/assets/')) return url;

    const publicUrl = new URL(publicBaseUrl);
    if (parsedUrl.origin === publicUrl.origin) return url;

    parsedUrl.protocol = publicUrl.protocol;
    parsedUrl.host = publicUrl.host;
    return parsedUrl.toString();
  } catch (_) {
    return url;
  }
}

async function cacheImageUrl(interaction, url, prefix = 'image') {
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) throw new Error('URL invalide');

  const response = await fetch(url, {
    headers: { 'User-Agent': 'U-Bot/2.9.17 (+Discord Embed Image Fetch)' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());
  const contentType = response.headers.get('content-type');
  const extension = getImageExtensionFromContentType(contentType) || getImageExtensionFromBuffer(buffer);
  if (!extension) throw new Error(`Type d'image non supporté (${contentType || 'inconnu'})`);

  const publicBaseUrl = getPublicBaseUrl();
  if (!publicBaseUrl) return url;

  const assetsDir = path.join(__dirname, '../Data/assets', interaction.guildId);
  if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

  const fileName = `${prefix}${extension}`;
  fs.writeFileSync(path.join(assetsDir, fileName), buffer);
  return `${publicBaseUrl}/assets/${interaction.guildId}/${fileName}?v=${Date.now()}`;
}

function getLocalAssetAttachment(url, attachmentBaseName = 'embed-banner') {
  if (!url) return null;

  try {
    const parsedUrl = new URL(url);
    if (!parsedUrl.pathname.startsWith('/assets/')) return null;

    const assetPath = decodeURIComponent(parsedUrl.pathname).replace(/^\/+/, '');
    const filePath = path.normalize(path.join(__dirname, '../Data', assetPath));
    const assetsRoot = path.join(__dirname, '../Data/assets');
    const relativeAssetPath = path.relative(assetsRoot, filePath);

    if (relativeAssetPath.startsWith('..') || path.isAbsolute(relativeAssetPath)) return null;
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;

    const extension = path.extname(filePath) || '.png';
    const name = `${attachmentBaseName}${extension}`;
    return {
      imageUrl: `attachment://${name}`,
      file: new AttachmentBuilder(filePath, { name })
    };
  } catch (_) {
    return null;
  }
}

function withGuildBanner(guildConfig, payload, attachmentBaseName = 'embed-banner') {
  const bannerUrl = normalizeStoredAssetUrl(guildConfig?.globalEmbedBanner);
  if (!bannerUrl || !payload?.embeds?.length) return payload;

  const localAsset = getLocalAssetAttachment(bannerUrl, attachmentBaseName);
  const imageUrl = localAsset?.imageUrl || bannerUrl;
  let bannerApplied = false;

  payload.embeds.forEach(embed => {
    const currentImage = embed?.data?.image?.url;
    const normalizedCurrentImage = normalizeStoredAssetUrl(currentImage);
    const shouldApplyBanner =
      !currentImage ||
      currentImage === guildConfig?.globalEmbedBanner ||
      normalizedCurrentImage === bannerUrl ||
      currentImage === localAsset?.imageUrl;

    if (typeof embed?.setImage === 'function' && shouldApplyBanner) {
      embed.setImage(imageUrl);
      bannerApplied = true;
    }
  });

  if (localAsset?.file && bannerApplied) {
    payload.files = [...(payload.files || []), localAsset.file];
  }

  return payload;
}

function applyInteractionEmbedDefaults(interaction, payload, attachmentBaseName = 'embed-banner') {
  if (!interaction?.guildId || !payload?.embeds?.length) return payload;
  const guildConfig = getGuildConfig(interaction.guildId);
  return withGuildBanner(guildConfig, payload, attachmentBaseName);
}

function isTicketPanelMessage(message) {
  return Boolean(message?.components?.some(row =>
    row.components?.some(component => component.customId === 'ticket_select')
  ));
}

async function purgeTicketPanelMessages(channel, botUserId, keepMessageId = null) {
  if (!channel?.messages || !botUserId) return 0;

  const messages = await channel.messages.fetch({ limit: 75 }).catch(() => null);
  if (!messages) return 0;

  const panelsToDelete = messages.filter(message =>
    message.id !== keepMessageId &&
    message.author?.id === botUserId &&
    isTicketPanelMessage(message)
  );

  for (const [, message] of panelsToDelete) {
    await message.delete().catch(() => {});
  }

  return panelsToDelete.size;
}

function isDetailedTicketPanelMessage(message) {
  const embed = message?.embeds?.[0];
  const title = embed?.title || '';
  const description = embed?.description || '';

  return title.includes('Tickets') &&
    description.includes("Centre d'Assistance & Support") &&
    description.includes('Procédure');
}

function stripTicketStatusEmoji(channelName) {
  return String(channelName || '').replace(/-?[🟠🟢🔴]$/u, '');
}

function buildTicketChannelName(choice, user, statusEmoji = '🟠') {
  const categoryPart = sanitizeChannelPart(choice, 'ticket');
  const userPart = sanitizeChannelPart(user?.username || user?.displayName || user?.tag || user?.id, 'user');
  const baseName = trimChannelName(`${categoryPart}-${userPart}-${formatDate()}`, 96);
  return `${baseName}-${statusEmoji}`;
}

async function setTicketStatusEmoji(channel, statusEmoji) {
  if (!channel?.setName || channel.name.endsWith('fermeture-en-cours')) return;
  const baseName = trimChannelName(stripTicketStatusEmoji(channel.name), 96);
  const newName = `${baseName}-${statusEmoji}`;

  if (newName !== channel.name) {
    await channel.setName(newName).catch(() => {});
  }
}

function getRoleIds(value) {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  return [value].filter(Boolean);
}

function parseRoleIds(input) {
  return [...new Set(
    String(input || '')
      .match(/\d{17,20}/g) || []
  )];
}

function getTicketCount(guildId, userId) {
  const guildConfig = getGuildConfig(guildId);
  return Number(guildConfig.ticketCount[userId] || 0);
}

function setTicketCount(guildId, userId, value) {
  const guildConfig = getGuildConfig(guildId);
  if (value <= 0) {
    delete guildConfig.ticketCount[userId];
    return;
  }
  guildConfig.ticketCount[userId] = value;
  saveConfig(configData);
}

function getStaffStats(guildId, userId) {
  const guildConfig = getGuildConfig(guildId);
  return guildConfig.staffStats[userId] || { claimed: 0, closed: 0 };
}

async function resetSelectMenuToPlaceholder(interaction) {
  if (!interaction.isStringSelectMenu() || !interaction.message) return;

  const row = interaction.message.components[0];
  const component = row?.components?.[0];
  if (!component || !component.customId) return;

  const menu = new StringSelectMenuBuilder()
    .setCustomId(component.customId)
    .setPlaceholder(component.placeholder || 'Choisir une option')
    .addOptions(component.options.map(option => ({
      label: option.label,
      value: option.value,
      description: option.description,
      emoji: option.emoji,
      default: false
    })));

  await interaction.message.edit({ components: [new ActionRowBuilder().addComponents(menu)] }).catch(() => {});
}

function getClosingChannelName(channelName) {
  const suffix = 'fermeture-en-cours';
  if (channelName.includes(suffix)) return channelName;

  const cleanBase = stripTicketStatusEmoji(channelName);
  // On limite la base pour laisser de la place à la pastille et au suffixe
  const baseName = trimChannelName(cleanBase, 78);
  return `${baseName}-🔴-${suffix}`;
}

function getReopenedChannelName(channelName, originalName = null) {
  if (originalName && !String(originalName).includes('fermeture-en-cours')) return originalName;

  const cleanBase = stripTicketStatusEmoji(
    String(channelName || 'ticket')
      .replace(/-?🔴-?fermeture-en-cours$/u, '')
      .replace(/-?fermeture-en-cours$/u, '')
  );

  return `${trimChannelName(cleanBase, 96)}-🟢`;
}

function incrementStaffStat(guildId, userId, key) {
  const guildConfig = getGuildConfig(guildId);
  const current = getStaffStats(guildId, userId);
  guildConfig.staffStats[userId] = {
    ...current,
    [key]: Number(current[key] || 0) + 1
  };
  saveConfig(configData);
}

function decrementStaffStat(guildId, userId, key) {
  if (!userId || !key) return;
  const guildConfig = getGuildConfig(guildId);
  const current = getStaffStats(guildId, userId);
  guildConfig.staffStats[userId] = {
    ...current,
    [key]: Math.max(0, Number(current[key] || 0) - 1)
  };
  saveConfig(configData);
}

function ensureResponseStats(guildConfig) {
  if (!guildConfig.responseStats || typeof guildConfig.responseStats !== 'object') {
    guildConfig.responseStats = { totalMs: 0, count: 0, staff: {} };
  }
  if (!guildConfig.responseStats.staff || typeof guildConfig.responseStats.staff !== 'object') {
    guildConfig.responseStats.staff = {};
  }
  if (!guildConfig.ticketFirstResponses || typeof guildConfig.ticketFirstResponses !== 'object') {
    guildConfig.ticketFirstResponses = {};
  }
  if (!guildConfig.ticketCreatedAt || typeof guildConfig.ticketCreatedAt !== 'object') {
    guildConfig.ticketCreatedAt = {};
  }
  return guildConfig.responseStats;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "Non mesuré";
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
}

function getAverageResponseMs(stats) {
  return stats?.count ? Number(stats.totalMs || 0) / Number(stats.count || 1) : null;
}

function getStaffAverageResponseMs(guildConfig, userId) {
  const stats = ensureResponseStats(guildConfig).staff[userId];
  return stats?.count ? Number(stats.totalMs || 0) / Number(stats.count || 1) : null;
}

function recordTicketFirstResponse(guildId, channelId, staffUserId, timestamp = Date.now()) {
  if (!guildId || !channelId || !staffUserId) return false;
  const guildConfig = getGuildConfig(guildId);
  const ownerId = guildConfig.ticketOwners?.[channelId];
  if (!ownerId || ownerId === staffUserId) return false;

  const responseStats = ensureResponseStats(guildConfig);
  if (guildConfig.ticketFirstResponses[channelId]) return false;

  const openedAt = Number(guildConfig.ticketCreatedAt?.[channelId] || guildConfig.ticketOpenTime?.[channelId] || timestamp);
  const responseMs = Math.max(0, timestamp - openedAt);
  guildConfig.ticketFirstResponses[channelId] = {
    userId: staffUserId,
    at: timestamp,
    responseMs
  };

  responseStats.totalMs = Number(responseStats.totalMs || 0) + responseMs;
  responseStats.count = Number(responseStats.count || 0) + 1;

  if (!responseStats.staff[staffUserId]) {
    responseStats.staff[staffUserId] = { totalMs: 0, count: 0 };
  }
  responseStats.staff[staffUserId].totalMs = Number(responseStats.staff[staffUserId].totalMs || 0) + responseMs;
  responseStats.staff[staffUserId].count = Number(responseStats.staff[staffUserId].count || 0) + 1;

  const staffStats = getStaffStats(guildId, staffUserId);
  guildConfig.staffStats[staffUserId] = {
    ...staffStats,
    responseTotalMs: Number(staffStats.responseTotalMs || 0) + responseMs,
    responseCount: Number(staffStats.responseCount || 0) + 1
  };

  saveConfig(configData);
  return true;
}

function getPanelOptionFromChannel(channel) {
  if (!channel || !channel.guildId) return null;
  const guildConfig = getGuildConfig(channel.guildId);
  // Priorité au stockage explicite pour éviter les conflits
  return guildConfig.ticketChoices?.[channel.id] ||
    Object.keys(guildConfig.categories).find(option => guildConfig.categories[option] === channel.parentId) ||
    Object.keys(guildConfig.categories).find(option => channel.name.startsWith(`${sanitizeChannelPart(option)}-`)) ||
    null;
}

function getConfiguredTicketOptions(guildConfig) {
  const panelOptions = Object.values(guildConfig.panelOptions || {})
    .flat()
    .filter(Boolean);

  const uniquePanelOptions = [...new Set(panelOptions)];
  return uniquePanelOptions.length ? uniquePanelOptions : Object.keys(guildConfig.categories || {});
}

function hasConfiguredModRole(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const option = getPanelOptionFromChannel(interaction.channel);
  if (!option) return false;

  const roleIds = getRoleIds(guildConfig.roles[option]);
  if (!roleIds.length) return false;

  return roleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId));
}

function canManageTicket(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const isTicketOwner = guildConfig.ticketOwners[interaction.channel?.id] === interaction.user.id;
  return isTicketOwner || 
    hasConfiguredModRole(interaction) ||
    interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels) ||
    interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
}

function capturePermissionOverwrites(channel) {
  return [...(channel?.permissionOverwrites?.cache?.values?.() || [])].map(overwrite => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  }));
}

async function lockTicketChannelForClosing(channel, closingState = {}) {
  if (!channel?.permissionOverwrites) return;

  closingState.permissionOverwrites = capturePermissionOverwrites(channel);
  const botId = channel.client.user?.id;
  const guildConfig = getGuildConfig(channel.guild.id);
  const roleIds = getRoleIds(guildConfig.roles?.[closingState.choice]);
  const targets = new Set([
    channel.guild.id,
    closingState.ownerId,
    closingState.claimedBy,
    ...roleIds,
    ...channel.permissionOverwrites.cache.keys()
  ].filter(Boolean));
  const denySendPermissions = {
    SendMessages: false,
    SendMessagesInThreads: false,
    CreatePublicThreads: false,
    CreatePrivateThreads: false
  };

  await Promise.all([...targets].map(targetId => {
    if (!targetId || targetId === botId) return Promise.resolve();
    return channel.permissionOverwrites.edit(targetId, denySendPermissions).catch(() => {});
  }));

  if (botId) {
    await channel.permissionOverwrites.edit(botId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true
    }).catch(() => {});
  }
}

async function restoreTicketChannelPermissions(channel, closingState, guildConfig) {
  if (!channel?.permissionOverwrites) return;

  if (Array.isArray(closingState?.permissionOverwrites) && closingState.permissionOverwrites.length) {
    await channel.permissionOverwrites.set(
      closingState.permissionOverwrites.map(overwrite => ({
        id: overwrite.id,
        type: overwrite.type,
        allow: BigInt(overwrite.allow || 0),
        deny: BigInt(overwrite.deny || 0)
      }))
    ).catch(() => {});
    return;
  }

  const ownerId = closingState?.ownerId || guildConfig.ticketOwners?.[channel.id];
  const choice = closingState?.choice || guildConfig.ticketChoices?.[channel.id] || getPanelOptionFromChannel(channel);
  const roleIds = getRoleIds(guildConfig.roles?.[choice]);

  if (ownerId) {
    await channel.permissionOverwrites.edit(ownerId, { SendMessages: true, SendMessagesInThreads: true }).catch(() => {});
  }

  for (const roleId of roleIds) {
    await channel.permissionOverwrites.edit(roleId, { SendMessages: true, SendMessagesInThreads: true }).catch(() => {});
  }
}

function getMissingBotPermissions(guild) {
  const botMember = guild.members.me;
  if (!botMember) return ["Présence du bot introuvable"];

  const requiredPermissions = [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ManageRoles,
    PermissionsBitField.Flags.MentionEveryone
  ];

  const permissionLabels = {
    [PermissionsBitField.Flags.ViewChannel]: "Voir les salons",
    [PermissionsBitField.Flags.SendMessages]: "Envoyer des messages",
    [PermissionsBitField.Flags.ReadMessageHistory]: "Lire l'historique des messages",
    [PermissionsBitField.Flags.ManageChannels]: "Gérer les salons",
    [PermissionsBitField.Flags.ManageRoles]: "Gérer les rôles",
    [PermissionsBitField.Flags.MentionEveryone]: "Mentionner tous les rôles"
  };

  return requiredPermissions
    .filter(permission => !botMember.permissions.has(permission))
    .map(permission => permissionLabels[permission]);
}

async function ensureBotPermissions(interaction) {
  const missingPermissions = getMissingBotPermissions(interaction.guild);

  if (!missingPermissions.length) return true;

  await interaction.reply({
    content: `❌ Permissions bot manquantes : ${missingPermissions.join(', ')}`,
    flags: 64
  }).catch(() => {});

  return false;
}

async function sendLog(guild, embed, specificChannelId = null) {
  const guildConfig = getGuildConfig(guild.id);
  const targetChannelId = specificChannelId || guildConfig.logsChannel;
  if (!targetChannelId) return;

  const channel = await guild.channels.fetch(targetChannelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  if (typeof embed?.setThumbnail === 'function' && !embed.data?.thumbnail) {
    embed.setThumbnail(guild.client.user.displayAvatarURL());
  }

  const sentMessage = await channel.send(withGuildBanner(guildConfig, { embeds: [embed] }, 'log-banner')).catch(() => null);
  if (sentMessage) {
    const title = embed.data?.title;
    const purgeLegacy = () => deleteLegacyBotEmbeds(
      channel,
      guild.client.user.id,
      legacyEmbed => isLegacySimpleEmbed(legacyEmbed, title),
      sentMessage.id,
      15
    );
    await purgeLegacy();
    setTimeout(() => purgeLegacy().catch(() => {}), 1500);
  }
}

async function sendRolePingMessage(channel, roleIds) {
  if (!roleIds.length) return;

  const mentions = roleIds.map(roleId => `<@&${roleId}>`).join(' ');

  await channel.send({
    content: mentions,
    allowedMentions: {
      roles: roleIds
    }
  }).catch(() => {});
}

async function sendMessageWithTimer(channel, payload, durationMs) {
  try {
    if (channel?.guild && payload?.embeds?.length && payload.applyGuildBanner !== false) {
      payload = withGuildBanner(getGuildConfig(channel.guild.id), payload, 'timed-message-banner');
    }
    delete payload.applyGuildBanner;
    const message = await channel.send(payload);
    const deleteAt = Date.now() + durationMs;

    if (typeof startVisualTimer === 'function') startVisualTimer(message, deleteAt);
    return message;
  } catch (err) {
    console.error("ERROR sending message with timer:", err);
    return null;
  }
}

function buildTicketContextFields(interaction, extraFields = []) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const ownerId = guildConfig.ticketOwners[interaction.channel?.id];
  const claimedBy = guildConfig.claims[interaction.channel?.id];
  const openedAt = guildConfig.ticketOpenTime[interaction.channel?.id];
  const durationMinutes = openedAt ? Math.max(1, Math.round((Date.now() - openedAt) / 60000)) : null;

  return [
    { name: "Salon", value: interaction.channel ? `${interaction.channel.name}` : "Inconnu", inline: true },
    { name: "ID Salon", value: interaction.channel ? `${interaction.channel.id}` : "Inconnu", inline: true },
    { name: "Action par", value: `${interaction.user}`, inline: true },
    { name: "Créateur", value: ownerId ? `<@${ownerId}>` : "Inconnu", inline: true },
    { name: "Claim", value: claimedBy ? `<@${claimedBy}>` : "Aucun", inline: true },
    { name: "Durée", value: durationMinutes ? `${durationMinutes} min` : "Inconnue", inline: true },
    ...extraFields
  ];
}

function buildStatsPayload(guildOrId) {
  const guildId = typeof guildOrId === 'string' ? guildOrId : guildOrId.id;
  const guild = typeof guildOrId === 'string' ? null : guildOrId;
  const guildConfig = getGuildConfig(guildId);
  const responseStats = ensureResponseStats(guildConfig);
  const averageResponseMs = getAverageResponseMs(responseStats);
  const topStaffLines = Object.entries(guildConfig.staffStats || {})
    .sort((a,b) => (b[1].claimed || 0) - (a[1].claimed || 0))
    .slice(0, 5)
    .map(([id, s], index) => {
      const averageMs = getStaffAverageResponseMs(guildConfig, id);
      const responseLabel = averageMs !== null ? formatDuration(averageMs) : "Non mesuré";
      const responseCount = responseStats.staff?.[id]?.count || s.responseCount || 0;
      return `**#${index + 1}** <@${id}> • ${s.claimed || 0} claim(s) • ${s.closed || 0} fermeture(s) • rép. moy. **${responseLabel}**${responseCount ? ` (${responseCount})` : ""}`;
    });
  const total = (guildConfig.stats.opened || 0) + (guildConfig.stats.closed || 0);
  const closeRate = total > 0 ? Math.round(((guildConfig.stats.closed || 0) / total) * 100) : 0;
  
  const embed = new EmbedBuilder()
    .setTitle("📊 Centre de Données Tickets")
    .setDescription(
      "### Activité du support\n" +
      "> Suivi en temps réel des tickets, fermetures et performances staff.\n\n" +
      `**Synthèse :** ${total} action(s) enregistrée(s), taux de fermeture **${closeRate}%**.`
    )
    .addFields(
      { name: "🎫 Ouverts", value: `\`\`\`\n${guildConfig.stats.opened || 0}\n\`\`\``, inline: true },
      { name: "🔒 Fermés", value: `\`\`\`\n${guildConfig.stats.closed || 0}\n\`\`\``, inline: true },
      { name: "📈 Total", value: `\`\`\`\n${total}\n\`\`\``, inline: true }
    )
    .addFields({
      name: "⏱️ Réactivité Modération",
      value:
        `Moyenne globale : **${averageResponseMs !== null ? formatDuration(averageResponseMs) : "Non mesurée"}**\n` +
        `Tickets mesurés : **${responseStats.count || 0}**`
    })
    .addFields({
      name: "🛡️ Top Staff",
      value: topStaffLines.join('\n') || "Aucune donnée"
    })
    .setThumbnail(guild?.client?.user?.displayAvatarURL() || null)
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setFooter({ text: "U-Bot Tickets • Statistiques dynamiques" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('refresh_stats')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  return withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'stats-banner');
}

function isStatsMessage(message) {
  const embed = message?.embeds?.[0];
  return Boolean(
    message?.components?.some(row => row.components?.some(component => component.customId === 'refresh_stats')) ||
    embed?.title?.includes('Statistiques') ||
    embed?.title?.includes('Centre de Données')
  );
}

function isDetailedStatsMessage(message) {
  const embed = message?.embeds?.[0];
  const title = embed?.title || '';
  const description = embed?.description || '';
  return title.includes('Centre de Données') || description.includes('Activité du support');
}

async function deleteLegacyBotEmbeds(channel, botUserId, matcher, keepMessageId = null, limit = 25) {
  if (!channel?.messages || !botUserId || typeof matcher !== 'function') return 0;

  const messages = await channel.messages.fetch({ limit }).catch(() => null);
  if (!messages) return 0;

  let deleted = 0;
  for (const message of messages.values()) {
    if (message.id === keepMessageId || message.author?.id !== botUserId) continue;
    const embed = message.embeds?.[0];
    if (!embed || !matcher(embed, message)) continue;
    await message.delete().catch(() => {});
    deleted++;
  }
  return deleted;
}

function isLegacySimpleEmbed(embed, expectedTitle = null) {
  const title = embed?.title || '';
  if (expectedTitle && title !== expectedTitle) return false;
  return !embed?.thumbnail && !embed?.image;
}

function buildCloseConfirmRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('confirm_close_ticket')
      .setLabel('✅ Confirmer')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('save_close_archive')
      .setLabel('💾 Sauvegarder')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('cancel_close_ticket')
      .setLabel('❌ Annuler')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildClosingTicketRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('reopen_ticket')
      .setLabel('Ré-ouvrir')
      .setEmoji('🔓')
      .setStyle(ButtonStyle.Success)
  );
}

function buildCloseConfirmationPayload(interaction, guildConfig, reason = '') {
  return withGuildBanner(guildConfig, {
    embeds: [
      new EmbedBuilder()
        .setTitle("🔒 Confirmation de fermeture")
        .setDescription(
          "La fermeture du ticket nécessite une confirmation.\n\n" +
          `${reason ? `Raison renseignée : ${reason}\n\n` : ""}` +
          "Utilise le bouton **💾 Sauvegarder** si tu souhaites archiver le ticket avant sa suppression.\n\n" +
          "Clique sur le bouton de confirmation ci-dessous pour finaliser la fermeture.\n\n" +
          "Cette demande expirera automatiquement dans 10 minutes."
        )
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setImage(guildConfig.globalEmbedBanner)
        .setColor(guildConfig.globalEmbedColor)
        .setTimestamp()
    ],
    components: [buildCloseConfirmRow()],
    flags: 64
  }, 'close-confirm-banner');
}

function buildChannelIdModal(customId, title, label) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channel_id')
          .setLabel(label)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

/* ========================= */
async function updateStatsMessage(guild) {
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig.statsChannel) return;

  const channel = await guild.channels.fetch(guildConfig.statsChannel).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const payload = buildStatsPayload(guild);
  const messages = await channel.messages.fetch({ limit: 75 }).catch(() => null);
  const botStatsMessages = messages
    ? [...messages.values()]
        .filter(message => message.author?.id === guild.client.user.id && isStatsMessage(message))
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
    : [];

  if (guildConfig.statsMessageId) {
    const existingMessage = botStatsMessages.find(message => message.id === guildConfig.statsMessageId) ||
      await channel.messages.fetch(guildConfig.statsMessageId).catch(() => null);

    if (existingMessage) {
      await existingMessage.edit(payload).catch(() => {});
      for (const message of botStatsMessages) {
        if (message.id !== existingMessage.id) await message.delete().catch(() => {});
      }
      await deleteLegacyBotEmbeds(channel, guild.client.user.id, embed => embed.title?.includes('Statistiques') && !embed.title?.includes('Centre de Données'), existingMessage.id, 100);
      return;
    }
  }

  const reusableMessage = botStatsMessages.find(isDetailedStatsMessage) || botStatsMessages[0];
  if (reusableMessage) {
    await reusableMessage.edit(payload).catch(() => {});
    guildConfig.statsMessageId = reusableMessage.id;
    for (const message of botStatsMessages) {
      if (message.id !== reusableMessage.id) await message.delete().catch(() => {});
    }
    await deleteLegacyBotEmbeds(channel, guild.client.user.id, embed => embed.title?.includes('Statistiques') && !embed.title?.includes('Centre de Données'), reusableMessage.id, 100);
    saveConfig(configData);
    return;
  }

  const message = await channel.send(payload).catch(() => null);

  if (message) {
    guildConfig.statsMessageId = message.id;
    saveConfig(configData);
    await deleteLegacyBotEmbeds(channel, guild.client.user.id, embed => embed.title?.includes('Statistiques') && !embed.title?.includes('Centre de Données'), message.id, 100);
  }
}

async function showStaffStats(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const entries = Object.entries(guildConfig.staffStats || {})
    .sort((a, b) => {
      const scoreA = Number(a[1]?.claimed || 0) + Number(a[1]?.closed || 0);
      const scoreB = Number(b[1]?.claimed || 0) + Number(b[1]?.closed || 0);
      return scoreB - scoreA;
    })
    .slice(0, 10);

  const description = entries.length
    ? entries.map(([userId, stats], index) =>
        `${index + 1}. <@${userId}> • Claims : ${Number(stats.claimed || 0)} • Fermetures : ${Number(stats.closed || 0)}`
      ).join('\n')
    : "Aucune statistique staff n'est encore disponible.";

  return replyAndAutoDelete(interaction, {
    embeds: [
      new EmbedBuilder()
        .setTitle("📈 Statistiques staff")
        .setDescription(description)
        .setColor(guildConfig.globalEmbedColor)
        .setTimestamp()
    ],
    flags: 64
  });
}

async function buildTicketArchive(channel) {
  const collectedMessages = [];
  let lastId;

  while (true) {
    const batch = await channel.messages.fetch({ limit: 100, ...(lastId ? { before: lastId } : {}) }).catch(() => null);
    if (!batch || !batch.size) break;

    collectedMessages.push(...batch.values());
    lastId = batch.last().id;

    if (batch.size < 100) break;
  }

  const transcript = collectedMessages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(message => {
      const createdAt = new Date(message.createdTimestamp).toLocaleString('fr-FR');
      const author = message.author ? `${message.author.tag}` : 'Auteur inconnu';
      const content = message.content || '[Aucun texte]';
      const attachments = message.attachments.size
        ? ` | Pièces jointes : ${message.attachments.map(attachment => attachment.url).join(', ')}`
        : '';

      return `[${createdAt}] ${author} : ${content}${attachments}`;
    })
    .join('\n');

  return transcript || 'Aucun message à archiver.';
}

async function saveTicketArchive(guild, channel, requestedBy) {
  const guildConfig = getGuildConfig(guild.id);
  if (!guildConfig.logsChannel) {
    return { ok: false, reason: "❌ Aucun salon logs configuré" };
  }

  const logsChannel = await guild.channels.fetch(guildConfig.logsChannel).catch(() => null);
  if (!logsChannel || logsChannel.type !== ChannelType.GuildText) {
    return { ok: false, reason: "❌ Salon logs invalide" };
  }

  const transcript = await buildTicketArchive(channel);
  const fileName = `archive-${channel.name}.txt`;
  const attachment = new AttachmentBuilder(
    Buffer.from(transcript, 'utf8'),
    { name: fileName }
  );

  await logsChannel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("💾 Archive du ticket")
        .addFields(
          { name: "Salon", value: `${channel.name}`, inline: true },
          { name: "Demandée par", value: `${requestedBy}`, inline: true }
        )
        .setColor(guildConfig.globalEmbedColor)
        .setTimestamp()
    ],
    files: [attachment]
  }).catch(() => null);

  return { ok: true };
}

/**
 * Nettoie les anciens messages de panel de tickets qui pourraient exister sur Discord
 * mais ne sont plus référencés ou sont obsolètes.
 * @param {Client} client Le client Discord.
 * @returns {Promise<number>} Le nombre de panels supprimés.
 */
async function cleanupLegacyTicketPanels(client) {
  let deletedCount = 0;
  if (!configData.guilds) return deletedCount;

  for (const guildId in configData.guilds) {
    const guildConfig = configData.guilds[guildId];
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const guildChannels = await guild.channels.fetch().catch(() => null);
    const panelChannelIds = new Set(Object.keys(guildConfig.panelMessages || {}));

    if (guildChannels) {
      for (const channel of guildChannels.values()) {
        if (channel?.isTextBased?.()) panelChannelIds.add(channel.id);
      }
    }

    for (const channelId of panelChannelIds) {
      const channel = guildChannels?.get(channelId) || guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || !channel.isTextBased()) continue;

      try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const currentPanelId = guildConfig.panelMessages[channelId];
        const botPanels = [...messages.values()]
          .filter(m => m.author.id === client.user.id && isTicketPanelMessage(m))
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
        const detailedPanels = botPanels.filter(isDetailedTicketPanelMessage);
        const currentPanel = botPanels.find(m => m.id === currentPanelId);
        const currentPanelIsDetailed = currentPanel && isDetailedTicketPanelMessage(currentPanel);
        const panelToKeep = currentPanelIsDetailed ? currentPanel : detailedPanels[0];

        for (const msg of botPanels) {
          const mustDelete = !panelToKeep || msg.id !== panelToKeep.id || !isDetailedTicketPanelMessage(msg);
          if (mustDelete) {
            console.log(`🧹 [PURGE] Panel ticket obsolète supprimé dans #${channel.name}`);
            await msg.delete().catch(() => {});
            deletedCount++;
          }
        }

        if (panelToKeep) {
          guildConfig.panelMessages[channelId] = panelToKeep.id;
          const keepOptions = panelToKeep.components?.[0]?.components?.[0]?.options?.map(option => option.value) || guildConfig.panelOptions[channelId] || [];
          guildConfig.panelOptions[channelId] = keepOptions;
        } else if (currentPanelId) {
          const officialMsg = await channel.messages.fetch(currentPanelId).catch(() => null);
          if (!officialMsg || !isDetailedTicketPanelMessage(officialMsg)) {
            delete guildConfig.panelMessages[channelId];
            delete guildConfig.panelOptions[channelId];
          }
        }
      } catch (error) {
        console.error(`❌ Erreur lors du scan du salon ${channelId}:`, error.message);
      }
    }
  }
  saveConfig(configData);
  return deletedCount;
}

/**
 * Rafraîchit les contrôles (boutons) des tickets actifs pour s'assurer qu'ils sont à jour.
 * @param {Client} client Le client Discord.
 * @returns {Promise<number>} Le nombre de tickets mis à jour.
 */
async function refreshActiveTicketControls(client) {
  let updatedCount = 0;
  if (!configData.guilds) return updatedCount;

  for (const guildId in configData.guilds) {
    const guildConfig = configData.guilds[guildId];
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    // Itérer sur les tickets actifs
    for (const channelId in guildConfig.ticketOwners) {
      const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildText) continue;

      try {
        // Chercher le message du bot contenant l'embed du ticket
        const messages = await channel.messages.fetch({ limit: 10 }); // Récupérer les messages récents
        const botMessage = messages.find(m => m.author.id === client.user.id && m.embeds.length > 0 && m.embeds[0].title?.startsWith('🎫 Ticket'));

        if (botMessage) {
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('claim_ticket').setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
            new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
          );
          // Mettre à jour les composants du message
          await botMessage.edit({ components: [row] });
          updatedCount++;
        }
      } catch (error) {
        console.warn(`⚠️ [TICKETS] Impossible de rafraîchir les contrôles du ticket #${channel.name}: ${error.message}`);
      }
    }
  }
  return updatedCount;
}

async function createTicketFromChoice(interaction, choice, openingReason = '') {
  const guildConfig = getGuildConfig(interaction.guildId);
  
  if (openingReason) {
    return executeTicketCreation(interaction, choice, openingReason);
  }

  const categoryId = guildConfig.categories[choice];
  const roleIds = getRoleIds(guildConfig.roles[choice]);

  if (!categoryId) return replyAndAutoDelete(interaction, { content: "❌ Catégorie introuvable", flags: 64 });
  if (getTicketCount(interaction.guildId, interaction.user.id) >= 3) return replyAndAutoDelete(interaction, { content: "❌ Max 3 tickets", flags: 64 });

  const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) return replyAndAutoDelete(interaction, { content: `❌ Catégorie invalide pour l'option ${choice}`, flags: 64 });
  if (roleIds.some(roleId => !interaction.guild.roles.cache.get(roleId))) return replyAndAutoDelete(interaction, { content: `❌ Rôle de modération invalide pour l'option ${choice}`, flags: 64 });
  if (!(await ensureBotPermissions(interaction))) return;

  pendingTicketCreations.set(interaction.user.id, { choice });

  return interaction.showModal(
    new ModalBuilder()
      .setCustomId('modal_ticket_opening')
      .setTitle('Ouvrir ticket')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('opening_reason')
            .setLabel("Raison d'ouverture (optionnelle)")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(false)
        )
      )
  );
}

async function executeTicketCreation(interaction, choice, openingReason) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const categoryId = guildConfig.categories[choice];
  const roleIds = getRoleIds(guildConfig.roles[choice]);
  guildConfig.stats.opened = (guildConfig.stats.opened || 0) + 1;
  const channelName = buildTicketChannelName(choice, interaction.user, '🟢');

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
      ...roleIds.map(id => ({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }))
    ]
  });

  guildConfig.ticketOwners[channel.id] = interaction.user.id;
  guildConfig.ticketOpenTime[channel.id] = Date.now();
  guildConfig.ticketCreatedAt[channel.id] = guildConfig.ticketOpenTime[channel.id];
  guildConfig.ticketChoices[channel.id] = choice;
  setTicketCount(interaction.guildId, interaction.user.id, getTicketCount(interaction.guildId, interaction.user.id) + 1);
  saveConfig(configData);

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket - ${choice}`)
    .setDescription(`Bienvenue ${interaction.user},\n\nLe staff a été notifié de votre demande. Un membre de l'équipe va vous répondre sous peu.\n\n**📌 Raison du ticket :**\n> ${openingReason || "Aucune raison fournie"}`)
    .addFields(
      { name: "👤 Demandeur", value: `${interaction.user}`, inline: true },
      { name: "⏰ Ouvert le", value: `<t:${Math.floor(Date.now()/1000)}:f>`, inline: true }
    )
    .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setFooter({ text: "Utilisez les boutons ci-dessous pour gérer le ticket." })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
    new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('Libérer').setStyle(ButtonStyle.Secondary).setEmoji('♻️'),
    new ButtonBuilder().setCustomId('add_user').setLabel('Membre').setStyle(ButtonStyle.Success).setEmoji('➕'),
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Fermer').setStyle(ButtonStyle.Danger).setEmoji('🔒')
  );

  await channel.send({ content: `${interaction.user} | ${roleIds.map(id => `<@&${id}>`).join(' ')}`, embeds: [embed], components: [row] });
  
  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle("📩 Nouveau ticket")
    .addFields(buildTicketContextFields(interaction, [{ name: "Raison", value: openingReason || "Aucune", inline: false }]))
    .setColor(guildConfig.globalEmbedColor).setTimestamp());

  await updateStatsMessage(interaction.guild);
  return interaction.editReply({ content: `✅ Votre ticket a été créé : ${channel}`, flags: 64 });
}

async function resumeTicketState(client) {
  if (!configData.guilds) return;
  console.log(`🔍 [SYSTEM - TICKETS VER: 2.8.36] Analyse et restauration pour ${Object.keys(configData.guilds).length} serveur(s)...`);

  for (const guildId of Object.keys(configData.guilds)) {
    const guildConfig = configData.guilds[guildId];
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) continue;

    const channels = await guild.channels.fetch().catch(() => null);
    if (!channels) continue;

    const ticketCategoryIds = Object.values(guildConfig.categories || {});

    // Reset du compteur de tickets pour recomptage propre
    guildConfig.ticketCount = {};

    // Appeler les fonctions de nettoyage et de rafraîchissement ici
    await cleanupLegacyTicketPanels(client); // Nettoyer les panels obsolètes
    await refreshActiveTicketControls(client); // Rafraîchir les contrôles des tickets actifs
    
    // 1. Analyse des salons physiques sur Discord
    for (const channel of channels.values()) {
      if (channel.type !== ChannelType.GuildText) continue;

      const isClosing = channel.name.endsWith('fermeture-en-cours');
      const isTicket = ticketCategoryIds.includes(channel.parentId) || guildConfig.ticketOwners[channel.id];

      if (isClosing) {
        // REPRISE DE FERMETURE : On recalcule le temps restant
        const storedDeleteAt = guildConfig.pendingDeletions?.[channel.id];
        const deleteAt = storedDeleteAt || (Date.now() + TICKET_DELETE_DELAY_MS);
        const delay = Math.max(5000, deleteAt - Date.now()); 

        // Si le timer n'était pas encore en base, on le fixe pour qu'il soit persistant
        if (!storedDeleteAt) {
          if (!guildConfig.pendingDeletions) guildConfig.pendingDeletions = {};
          guildConfig.pendingDeletions[channel.id] = deleteAt;
        }

        console.log(`⏳ [TICKETS] Reprise de la suppression pour #${channel.name} dans ${Math.round(delay/60000)} min.`);

        // REPRISE DU TIMER VISUEL : On cherche le message de fermeture du bot
        const messages = await channel.messages.fetch({ limit: 20 }).catch(() => null);
        const timerMessage = messages?.find(m => 
          m.author.id === client.user.id && 
          m.embeds[0]?.title === "🔒 Ticket fermé"
        );

        if (timerMessage) {
          try {
            // Appel ultra-sécurisé : on vérifie la fonction locale ET l'export
            const timer = (typeof startVisualTimer === 'function') ? startVisualTimer : 
                          (module.exports && module.exports.startVisualTimer);
            
            if (typeof timer === 'function') timer(timerMessage, deleteAt);
          } catch (_) {}
        }

        setTimeout(() => {
          try {
            if (!guildConfig.pendingDeletions?.[channel.id] || guildConfig.pendingDeletions[channel.id] > Date.now()) return;
            if (guildConfig.pendingDeletions) delete guildConfig.pendingDeletions[channel.id];
            if (guildConfig.closingTickets) delete guildConfig.closingTickets[channel.id];
            delete guildConfig.claims[channel.id];
            delete guildConfig.ticketOwners[channel.id];
            delete guildConfig.ticketOpenTime[channel.id];
            delete guildConfig.ticketCreatedAt[channel.id];
            delete guildConfig.ticketFirstResponses[channel.id];
            delete guildConfig.ticketChoices[channel.id];
            saveConfig(configData);
            channel.delete().catch(() => {});
          } catch (_) {}
        }, delay);
      } else if (isTicket) {
        // ADOPTION : Si le ticket est ouvert mais non listé dans la base, on le récupère
        if (!guildConfig.ticketOwners[channel.id]) {
          guildConfig.ticketOwners[channel.id] = "Inconnu (Adopté)";
          if (!guildConfig.ticketOpenTime[channel.id]) {
            guildConfig.ticketOpenTime[channel.id] = channel.createdTimestamp;
          }
          if (!guildConfig.ticketCreatedAt[channel.id]) {
            guildConfig.ticketCreatedAt[channel.id] = guildConfig.ticketOpenTime[channel.id] || channel.createdTimestamp;
          }
          if (!guildConfig.ticketChoices[channel.id]) {
            guildConfig.ticketChoices[channel.id] = getPanelOptionFromChannel(channel);
          }
          console.log(`🛡️ [TICKETS] Adoption du ticket orphelin : #${channel.name}`);
        }

        // Recomptage des tickets par utilisateur
        const ownerId = guildConfig.ticketOwners[channel.id];
        if (ownerId && ownerId !== "Inconnu (Adopté)") {
            guildConfig.ticketCount[ownerId] = (guildConfig.ticketCount[ownerId] || 0) + 1;
        }
      }
    }

    // 2. Nettoyage des données "fantômes" (salons supprimés manuellement)
    const cleanObj = (obj) => {
      if (!obj) return;
      let count = 0;
      Object.keys(obj).forEach(id => {
        if (!channels.has(id)) {
          delete obj[id];
          count++;
        }
      });
      return count;
    };

    const totalCleaned = cleanObj(guildConfig.ticketOwners) + 
                         cleanObj(guildConfig.ticketOpenTime) +
                         cleanObj(guildConfig.ticketCreatedAt) +
                         cleanObj(guildConfig.ticketFirstResponses) +
                         cleanObj(guildConfig.ticketChoices) +
                         cleanObj(guildConfig.claims) + 
                         cleanObj(guildConfig.pendingClosures) + 
                         cleanObj(guildConfig.pendingDeletions) +
                         cleanObj(guildConfig.closingTickets);

    if (totalCleaned > 0) console.log(`🧹 [TICKETS] ${totalCleaned} données obsolètes nettoyées.`);
  }
  saveConfig(configData);
  console.log(`✅ [SYSTEM] Restauration terminée.`);
}

/* ========================= */
function sendConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const embed = new EmbedBuilder()
    .setTitle("⚙️ Configuration du système de tickets")
    .setDescription(
      "Bienvenue dans le panneau de configuration.\n\n" +
      "Utilise les boutons ci-dessous pour configurer correctement le système :\n\n" +
      "📝 **Logs** → Définir le salon des logs\n" +
      "🎫 **Panel** → Créer le menu de tickets\n" +
      "📊 **Stats** → Configurer les statistiques\n\n" +
      "_Assure-toi que les IDs sont corrects pour éviter les erreurs._"
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setFooter({ text: "Système de tickets Discord" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('config_logs')
      .setLabel('📝 Logs')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('create_panel')
      .setLabel('🎫 Panel')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('config_stats')
      .setLabel('📊 Stats')
      .setStyle(ButtonStyle.Primary)
  );

  return replyAndAutoDelete(interaction, withGuildBanner(guildConfig, {
    embeds: [embed],
    components: [row],
    flags: 64
  }, 'config-ticket-banner'));
}

/* ========================= */
async function handleButtons(interaction) {
  try {
    const guildConfig = getGuildConfig(interaction.guildId);
    const duplicateSensitiveIds = new Set([
      'xp_leaderboard_refresh',
      'refresh_stats',
      'unclaim_ticket',
      'add_user',
      'close_ticket',
      'confirm_close_ticket',
      'reopen_ticket',
      'save_close_archive',
      'cancel_close_ticket'
    ]);

    if (
      duplicateSensitiveIds.has(interaction.customId) &&
      consumeRecentInteractionAction(interaction, interaction.customId === 'xp_leaderboard_refresh' ? 1800 : 2500)
    ) {
      return quietlyAcknowledgeComponent(interaction);
    }

    const blockedWhileClosingIds = new Set(['claim_ticket', 'unclaim_ticket', 'add_user', 'close_ticket']);
    if (blockedWhileClosingIds.has(interaction.customId) && guildConfig.pendingDeletions?.[interaction.channelId]) {
      return replyAndAutoDelete(interaction, { content: "🔒 Ce ticket est en cours de fermeture. Utilise le bouton **Ré-ouvrir** si tu dois reprendre la discussion.", flags: 64 });
    }

    if (interaction.customId?.startsWith('verify_choice_')) {
      return await interaction.client.verification?.handleGameChoice(interaction);
    }
    if (interaction.customId === 'verify_restart') {
      return await interaction.client.verification?.handleVerifyButtonClick(interaction);
    }

    if (interaction.customId === 'live_edit_select' && interaction.isStringSelectMenu()) {
      return await handleLiveEditSelect(interaction, interaction.values[0]);
    }

    if (interaction.customId?.startsWith('live_btn_edit_')) {
      const url = interaction.customId.replace('live_btn_edit_', '');
      const live = guildConfig.liveConfigs?.find(config => config.url === url);
      if (!live) return replyAndAutoDelete(interaction, { content: "❌ Configuration live introuvable.", flags: 64 });
      return interaction.showModal(buildLiveConfigModal(live.platform, live));
    }

    if (interaction.customId?.startsWith('live_btn_del_')) {
      const url = interaction.customId.replace('live_btn_del_', '');
      return await handleLiveDelete(interaction, url);
    }

    if (interaction.customId === 'xp_leaderboard_refresh') {
      if (!interaction.client.xpSystem?.getLeaderboardPayload) {
        return replyAndAutoDelete(interaction, { content: "❌ Leaderboard indisponible.", flags: 64 });
      }
      return updateComponentMessage(interaction, await interaction.client.xpSystem.getLeaderboardPayload(interaction.guild));
    }
    
    switch (interaction.customId) {
      // == BOT CUSTOMIZATION ==
      case 'bot_name_set_btn':
        return await handleBotNameButtonClick(interaction);
      case 'global_banner_set_btn':
      case 'prot_banner_set_btn':
        return interaction.showModal(new ModalBuilder().setCustomId(`modal_set_global_banner:${interaction.message?.id || 'none'}`).setTitle('Image de fond des Embeds').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner_url').setLabel('URL de l\'image').setPlaceholder('Lien direct').setValue(guildConfig.globalEmbedBanner || '').setStyle(TextInputStyle.Short).setRequired(false))));
      case 'global_color_set_btn':
        return interaction.showModal(new ModalBuilder().setCustomId(`modal_set_global_color:${interaction.message?.id || 'none'}`).setTitle('Couleur des Embeds').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color_hex').setLabel('Code HEX').setPlaceholder('#5865F2').setValue(guildConfig.globalEmbedColor || '#5865F2').setStyle(TextInputStyle.Short).setRequired(true))));

      // == PROTECTION HUB ==
      case 'prot_hub_back':
        return await sendProtectionConfigPanel(interaction);
      case 'prot_hub_antiraid':
        return await sendAntiRaidConfigPanel(interaction);
      case 'prot_hub_antispam':
        return await sendAntiSpamConfigPanel(interaction);
      case 'prot_hub_captcha':
        return await sendVerificationConfigPanel(interaction);
      case 'prot_hub_dmlock':
        return await sendDmLockConfigPanel(interaction);
      case 'antiraid_toggle_status':
        guildConfig.antiRaid.enabled = !guildConfig.antiRaid.enabled;
        saveConfig(configData);
        return await sendAntiRaidConfigPanel(interaction);
      case 'antiraid_setup':
        return interaction.showModal(buildAntiRaidModal(guildConfig.antiRaid));
      case 'antispam_toggle_status':
        guildConfig.antiSpam.enabled = !guildConfig.antiSpam.enabled;
        saveConfig(configData);
        return await sendAntiSpamConfigPanel(interaction);
      case 'antispam_setup':
        return interaction.showModal(buildAntiSpamModal(guildConfig.antiSpam));
      case 'verify_toggle_status':
        guildConfig.verification.enabled = !guildConfig.verification.enabled;
        saveConfig(configData);
        return await sendVerificationConfigPanel(interaction);
      case 'verify_setup':
        return interaction.showModal(buildVerificationModal(guildConfig.verification));
      case 'verify_send_panel':
        return await sendUserVerificationPanel(interaction);
      case 'verify_start':
        return await interaction.client.verification?.handleVerifyButtonClick(interaction);
      case 'verify_enter_code':
        return await interaction.client.verification?.showCodeModal(interaction);
      case 'dmlock_toggle_status':
        guildConfig.dmLock.enabled = !guildConfig.dmLock.enabled;
        saveConfig(configData);
        return await sendDmLockConfigPanel(interaction);
      case 'dmlock_send_panel':
        return await sendUserDmSafetyPanel(interaction);
      case 'live_config_twitch':
        return interaction.showModal(buildLiveConfigModal('twitch'));
      case 'live_config_youtube':
        return interaction.showModal(buildLiveConfigModal('youtube'));
      case 'live_config_tiktok':
        return interaction.showModal(buildLiveConfigModal('tiktok'));
      case 'xp_toggle_status':
        return await toggleXPStatus(interaction);
      case 'ai_toggle_status':
        return await toggleAISetting(interaction, 'enabled');
      case 'ai_toggle_chat':
        return await toggleAISetting(interaction, 'chatEnabled');
      case 'ai_toggle_translate':
        return await toggleAISetting(interaction, 'autoTranslate');
      case 'ai_toggle_ortho':
        return await toggleAISetting(interaction, 'spellCheck');
      case 'ai_toggle_staff':
        return await toggleAISetting(interaction, 'staffSuggestions');
      case 'ai_set_channel':
        return interaction.showModal(new ModalBuilder().setCustomId('modal_ai_channel').setTitle('Salon IA').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('ID Salon IA').setStyle(TextInputStyle.Short).setRequired(false))));

      // == LOGS & ENTRANCE ==
      case 'logs_toggle_status':
        return await toggleLogsStatus(interaction);
      case 'logs_setup_channels': return await setupLogsChannels(interaction);
      case 'entrance_toggle_status': return await toggleEntranceStatus(interaction);
      case 'entrance_toggle_rules': return await toggleEntranceRules(interaction);
      case 'entrance_toggle_image': return await toggleEntranceImage(interaction);
      case 'entrance_setup_welcome': return await interaction.showModal(buildEntranceTextModal(guildConfig.entrance));
      case 'entrance_setup_roles': return await interaction.showModal(buildEntranceRolesModal(guildConfig.entrance));
      case 'entrance_setup_rules': return await interaction.showModal(buildEntranceRulesModal(guildConfig.entrance));
      case 'entrance_send_rules': return await interaction.client.entranceSystem.sendRulesPanel(interaction);
      case 'entrance_accept_rules': return await interaction.client.entranceSystem.handleRulesAcceptance(interaction);

      // == TICKETS ==
      case 'ticket_select': {
        if (!interaction.isStringSelectMenu()) break; // S'assurer que c'est bien un menu
      const choice = interaction.values[0];
      const categoryId = guildConfig.categories[choice];
      const roleIds = getRoleIds(guildConfig.roles[choice]);

      if (!categoryId) {
        return replyAndAutoDelete(interaction, { content: "❌ Catégorie introuvable.", flags: 64 });
      }

      if (getTicketCount(interaction.guildId, interaction.user.id) >= 3) {
        return replyAndAutoDelete(interaction, { content: "❌ Max 3 tickets", flags: 64 });
      }

      const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return replyAndAutoDelete(interaction, { content: `❌ Catégorie invalide pour l'option ${choice}`, flags: 64 });
      }

      if (roleIds.some(roleId => !interaction.guild.roles.cache.get(roleId))) {
        return replyAndAutoDelete(interaction, { content: `❌ Rôle de modération invalide pour l'option ${choice}`, flags: 64 });
      }

      if (!(await ensureBotPermissions(interaction))) {
        return;
      }

      pendingTicketCreations.set(interaction.user.id, { choice });

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_ticket_opening')
          .setTitle('Ouvrir ticket')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('opening_reason')
                .setLabel("Raison d'ouverture (optionnelle)")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
            )
          )
      );
      }

      case 'modif_select': {
        if (!interaction.isStringSelectMenu()) break; // S'assurer que c'est bien un menu
        const selected = interaction.values[0];
        const showModalAndReset = async (modal) => {
          await interaction.showModal(modal);
          setTimeout(() => resetSelectMenuToPlaceholder(interaction).catch(() => {}), 350);
          return null;
        };
        if (selected === 'logs') return showModalAndReset(buildChannelIdModal('modal_edit_logs', 'Modifier logs', 'Nouvel ID salon logs'));
        if (selected === 'stats') return showModalAndReset(buildChannelIdModal('modal_edit_stats', 'Modifier stats', 'Nouvel ID salon stats'));
        if (selected === 'options_panel') {
          const embed = new EmbedBuilder().setTitle("🎫 Gestion des options").setDescription("Ajoutez ou supprimez des types de tickets.").setColor(guildConfig.globalEmbedColor);
          const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('panel_opt_add').setLabel('Ajouter').setStyle(ButtonStyle.Success).setEmoji('➕'),
            new ButtonBuilder().setCustomId('panel_opt_remove').setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('➖'),
            new ButtonBuilder().setCustomId('modif_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
          );
          return updateComponentMessage(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'ticket-options-banner'));
        }
        if (selected === 'category') {
          return showModalAndReset(new ModalBuilder().setCustomId('modal_edit_category').setTitle('Modifier catégorie').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('option_name').setLabel('Nom exact de l’option').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('category_id').setLabel('Nouvel ID catégorie').setStyle(TextInputStyle.Short).setRequired(true))));
        }
        if (selected === 'role') {
          return showModalAndReset(new ModalBuilder().setCustomId('modal_edit_role').setTitle('Modifier rôle').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('option_name').setLabel('Nom exact de l’option').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roles').setLabel('Nouveaux rôles (@role ou IDs)').setStyle(TextInputStyle.Short).setRequired(false))));
        }
        break;
      }

      case 'modif_back':
        return sendEditConfigPanel(interaction);

      case 'refresh_stats':
      await interaction.deferUpdate().catch(() => {});
      return updateStatsMessage(interaction.guild);

      case 'panel_opt_add':
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_panel_add_option')
          .setTitle('Ajouter une option')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('opt_name').setLabel('Nom de l\'option').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('cat_id').setLabel('ID de la catégorie').setStyle(TextInputStyle.Short).setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder().setCustomId('role_ids').setLabel('ID(s) Rôle(s) (séparés par des virgules)').setStyle(TextInputStyle.Short).setRequired(false)
            )
          )
      );

      case 'panel_opt_remove':
      const options = getConfiguredTicketOptions(guildConfig);
      if (options.length === 0) return replyAndAutoDelete(interaction, { content: "❌ Aucune option à supprimer.", flags: 64 });
      const removeEmbed = new EmbedBuilder()
        .setTitle("🧹 Suppression d'option")
        .setDescription(
          "Sélectionne ci-dessous l'option de ticket à retirer du panel.\n\n" +
          "Cette action supprime l'option de la configuration active, mais ne supprime aucun salon déjà existant."
        )
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setColor(guildConfig.globalEmbedColor)
        .setTimestamp();
      const menu = new StringSelectMenuBuilder()
        .setCustomId('panel_opt_remove_select')
        .setPlaceholder('Sélectionnez l\'option à supprimer')
        .addOptions(options.map(opt => ({ label: opt, value: opt })));
      const backRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('modif_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
      );
      return updateComponentMessage(interaction, withGuildBanner(guildConfig, {
        content: '',
        embeds: [removeEmbed],
        components: [new ActionRowBuilder().addComponents(menu), backRow]
      }, 'ticket-option-remove-banner'));

      case 'panel_opt_remove_select': {
        if (!interaction.isStringSelectMenu()) break; // S'assurer que c'est bien un menu
      await resetSelectMenuToPlaceholder(interaction);
      const optionToRemove = interaction.values[0];
      delete guildConfig.categories[optionToRemove];
      delete guildConfig.roles[optionToRemove];
      saveConfig(configData);
      const embed = new EmbedBuilder()
        .setTitle("🎫 Gestion des options")
        .setDescription(`✅ L'option **${optionToRemove}** a été supprimée du système.`)
        .setColor(guildConfig.globalEmbedColor);
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('panel_opt_add').setLabel('Ajouter').setStyle(ButtonStyle.Success).setEmoji('➕'),
        new ButtonBuilder().setCustomId('panel_opt_remove').setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('➖'),
        new ButtonBuilder().setCustomId('modif_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
      );
      return updateComponentMessage(interaction, withGuildBanner(guildConfig, { content: '', embeds: [embed], components: [row] }, 'ticket-options-banner'));
      }

      case 'config_logs':
      return interaction.showModal(
        buildChannelIdModal('modal_logs', 'Configurer logs', 'ID salon logs')
      );

      case 'config_stats':
      return interaction.showModal(
        buildChannelIdModal('modal_stats', 'Configurer stats', 'ID salon stats')
      );

      case 'create_panel':
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_panel')
          .setTitle('Créer panel')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('channel_id')
                .setLabel('ID salon')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('options')
                .setLabel('Options (1 par ligne)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('roles')
                .setLabel('Rôles autorisés (@role ou IDs)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            ),
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('categories_input')
                .setLabel('IDs catégories (1 par ligne)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
            )
          )
      );

      case 'claim_ticket': {
        if (!canManageTicket(interaction)) return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket.", flags: 64 });
        if (guildConfig.claims[interaction.channel.id]) return replyAndAutoDelete(interaction, { content: "❌ Ce ticket est déjà pris en charge.", flags: 64 });
        recordTicketFirstResponse(interaction.guildId, interaction.channel.id, interaction.user.id);
        guildConfig.claims[interaction.channel.id] = interaction.user.id;
        incrementStaffStat(interaction.guildId, interaction.user.id, 'claimed');
        saveConfig(configData);
        await updateStatsMessage(interaction.guild).catch(() => {});
        await setTicketStatusEmoji(interaction.channel, '🟠');
        return replyAndAutoDelete(interaction, withGuildBanner(guildConfig, {
          embeds: [new EmbedBuilder().setTitle("🛠️ Claim").setDescription(`${interaction.user} a pris en charge ce ticket.\n\nUn membre de l'équipe est désormais assigné à votre demande.`).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).setImage(guildConfig.globalEmbedBanner).setColor(guildConfig.globalEmbedColor).setFooter({ text: "Merci de patienter pendant le traitement." }).setTimestamp()]
        }, 'ticket-claim-banner'));
      }

      case 'unclaim_ticket': {
        if (!canManageTicket(interaction)) return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket.", flags: 64 });
        const previousClaim = guildConfig.claims[interaction.channel.id];
        if (!previousClaim) return replyAndAutoDelete(interaction, { content: "❌ Ce ticket n'est pas pris en charge.", flags: 64 });
        if (consumeTicketActionLock(guildConfig, interaction.channel.id, 'unclaim')) {
          saveConfig(configData);
          return quietlyAcknowledgeComponent(interaction);
        }
        delete guildConfig.claims[interaction.channel.id];
        saveConfig(configData);
        await setTicketStatusEmoji(interaction.channel, '🟢');
        await sendLog(interaction.guild, new EmbedBuilder().setTitle("♻️ Ticket libéré").addFields(buildTicketContextFields(interaction, [{ name: "Claim précédent", value: previousClaim ? `<@${previousClaim}>` : "Aucun", inline: true }])).setColor(guildConfig.globalEmbedColor).setTimestamp());
        return replyAndAutoDelete(interaction, { content: "✅ Ticket libéré.", flags: 64 });
      }

      case 'add_user':
        if (!canManageTicket(interaction)) return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket.", flags: 64 });
        return interaction.showModal(
          new ModalBuilder()
            .setCustomId('modal_add_user')
            .setTitle('Ajouter membre')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('user_id')
                  .setLabel('ID utilisateur')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
              )
            )
        );

      case 'close_ticket':
        if (!canManageTicket(interaction)) {
          return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
        }

        guildConfig.pendingClosures[interaction.channel.id] = {
          userId: interaction.user.id,
          reason: '',
          expiresAt: Date.now() + PENDING_CLOSE_EXPIRE_MS
        };
        saveConfig(configData);
        return replyAndAutoDelete(interaction, buildCloseConfirmationPayload(interaction, guildConfig));

      case 'confirm_close_ticket': {
        if (!canManageTicket(interaction)) {
          return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
        }

      const ticketChannel = interaction.channel || await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
      if (!ticketChannel) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon du ticket introuvable ou déjà supprimé.", flags: 64 });
      }

      const pendingClose = guildConfig.pendingClosures[ticketChannel.id];
      if (!pendingClose) {
        return replyAndAutoDelete(interaction, { content: "❌ Aucune fermeture en attente", flags: 64 });
      }

      if (pendingClose.expiresAt && pendingClose.expiresAt < Date.now()) {
        delete guildConfig.pendingClosures[ticketChannel.id];
        saveConfig(configData);
        return replyAndAutoDelete(interaction, { content: "❌ La demande de fermeture a expiré.", flags: 64 });
      }

      if (pendingClose.userId !== interaction.user.id) {
        return replyAndAutoDelete(interaction, { content: "❌ Seul le modérateur ayant lancé la fermeture peut la confirmer", flags: 64 });
      }

      if (pendingClose.processing || consumeTicketActionLock(guildConfig, ticketChannel.id, 'confirm_close', 10 * 1000)) {
        saveConfig(configData);
        return quietlyAcknowledgeComponent(interaction);
      }
      pendingClose.processing = true;
      pendingClose.processingAt = Date.now();
      saveConfig(configData);

      await interaction.deferUpdate().catch(() => {});
      await interaction.editReply({ components: [] }).catch(() => {});

      const ownerId = guildConfig.ticketOwners[ticketChannel.id];
      const claimedBy = guildConfig.claims[ticketChannel.id];
      const choice = guildConfig.ticketChoices[ticketChannel.id] || getPanelOptionFromChannel(ticketChannel);
      const openedAt = guildConfig.ticketOpenTime[ticketChannel.id];
      const createdAt = guildConfig.ticketCreatedAt?.[ticketChannel.id] || openedAt;
      const deleteAt = Date.now() + TICKET_DELETE_DELAY_MS;
      const durationMinutes = openedAt ? Math.max(1, Math.round((Date.now() - openedAt) / 60000)) : null;
      const closeReason = pendingClose.reason || "Aucune";
      const originalChannelName = ticketChannel.name;
      const closingState = {
        ownerId,
        claimedBy,
        choice,
        openedAt,
        createdAt,
        originalName: originalChannelName,
        closedBy: interaction.user.id,
        closeReason,
        deleteAt,
        statsClosedCredited: true,
        ticketCountReleased: Boolean(ownerId)
      };

      const closeEmbed = {
          embeds: [
            new EmbedBuilder()
              .setTitle("🔒 Ticket fermé")
              .setDescription(
                "Ce ticket va maintenant être fermé.\n\n" +
                "Merci d'avoir utilisé le support. Nous espérons que votre demande a été traitée dans les meilleures conditions."
              )
              .setColor(guildConfig.globalEmbedColor)
              .setFooter({ text: "⏱️ Suppression dans 30:00" })
              .setTimestamp()
          ]
      };
      closeEmbed.components = [buildClosingTicketRow()];

      if (!guildConfig.pendingDeletions || typeof guildConfig.pendingDeletions !== 'object') guildConfig.pendingDeletions = {};
      guildConfig.pendingDeletions[ticketChannel.id] = deleteAt;
      const closingMessage = await sendMessageWithTimer(ticketChannel, { ...closeEmbed, applyGuildBanner: false }, TICKET_DELETE_DELAY_MS);
      if (closingMessage) closingState.messageId = closingMessage.id;

      await Promise.all([
        ticketChannel.setName(getClosingChannelName(ticketChannel.name)).catch(err => console.warn('TICKET CLOSE RENAME ERROR:', err?.message || err)),
        lockTicketChannelForClosing(ticketChannel, closingState).catch(err => console.warn('TICKET CLOSE LOCK ERROR:', err?.message || err))
      ]);

      guildConfig.stats.closed = (guildConfig.stats.closed || 0) + 1;

      if (!guildConfig.closingTickets || typeof guildConfig.closingTickets !== 'object') guildConfig.closingTickets = {};
      guildConfig.closingTickets[ticketChannel.id] = closingState;
      if (ownerId) {
        setTicketCount(interaction.guildId, ownerId, getTicketCount(interaction.guildId, ownerId) - 1);
      }

      incrementStaffStat(interaction.guildId, interaction.user.id, 'closed');
      delete guildConfig.pendingClosures[ticketChannel.id];
      saveConfig(configData);
      setTimeout(() => {
        try {
          if (!guildConfig.pendingDeletions?.[ticketChannel.id] || guildConfig.pendingDeletions[ticketChannel.id] > Date.now()) return;
          if (guildConfig.pendingDeletions) delete guildConfig.pendingDeletions[ticketChannel.id];
          if (guildConfig.closingTickets) delete guildConfig.closingTickets[ticketChannel.id];
          delete guildConfig.claims[ticketChannel.id];
          delete guildConfig.ticketOwners[ticketChannel.id];
          delete guildConfig.ticketOpenTime[ticketChannel.id];
          delete guildConfig.ticketCreatedAt[ticketChannel.id];
          delete guildConfig.ticketFirstResponses[ticketChannel.id];
          delete guildConfig.ticketChoices[ticketChannel.id];
          saveConfig(configData);
          ticketChannel.delete().catch(() => {});
        } catch (_) {}
      }, TICKET_DELETE_DELAY_MS);
      await updateStatsMessage(interaction.guild).catch(() => {});

      await sendLog(
        interaction.guild,
        new EmbedBuilder()
          .setTitle("🔒 Log : Ticket fermé")
          .addFields(
            { name: "Salon", value: `\`${originalChannelName}\``, inline: true },
            { name: "Fermé par", value: `${interaction.user}`, inline: true },
            { name: "Créateur", value: ownerId ? `<@${ownerId}>` : "Inconnu", inline: true },
            { name: "Durée", value: durationMinutes ? `${durationMinutes} min` : "Inconnue", inline: true },
            { name: "Raison", value: closeReason, inline: false }
          )
          .setColor(guildConfig.globalEmbedColor)
          .setTimestamp()
      );
      
      // Suppression gérée par le timer déjà existant
      break;
    }

    case 'reopen_ticket': {
      if (!canManageTicket(interaction)) {
        return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const ticketChannel = interaction.channel || await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
      if (!ticketChannel) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon du ticket introuvable ou déjà supprimé.", flags: 64 });
      }

      const closingState = guildConfig.closingTickets?.[ticketChannel.id] || null;
      const pendingDeleteAt = guildConfig.pendingDeletions?.[ticketChannel.id];
      if (!closingState && !pendingDeleteAt) {
        return replyAndAutoDelete(interaction, { content: "❌ Ce ticket n'est pas en cours de fermeture.", flags: 64 });
      }

      await interaction.deferUpdate().catch(() => {});

      if (guildConfig.pendingDeletions) delete guildConfig.pendingDeletions[ticketChannel.id];
      await restoreTicketChannelPermissions(ticketChannel, closingState, guildConfig);
      await ticketChannel.setName(getReopenedChannelName(ticketChannel.name, closingState?.originalName)).catch(() => {});

      if (closingState?.ownerId) guildConfig.ticketOwners[ticketChannel.id] = closingState.ownerId;
      if (closingState?.openedAt) guildConfig.ticketOpenTime[ticketChannel.id] = closingState.openedAt;
      if (closingState?.createdAt) guildConfig.ticketCreatedAt[ticketChannel.id] = closingState.createdAt;
      if (closingState?.choice) guildConfig.ticketChoices[ticketChannel.id] = closingState.choice;
      if (closingState?.claimedBy) guildConfig.claims[ticketChannel.id] = closingState.claimedBy;

      if (closingState?.statsClosedCredited) {
        guildConfig.stats.closed = Math.max(0, Number(guildConfig.stats.closed || 0) - 1);
      }

      if (closingState?.ticketCountReleased && closingState.ownerId) {
        setTicketCount(interaction.guildId, closingState.ownerId, getTicketCount(interaction.guildId, closingState.ownerId) + 1);
      }

      if (closingState?.closedBy) {
        decrementStaffStat(interaction.guildId, closingState.closedBy, 'closed');
      }

      if (guildConfig.closingTickets) delete guildConfig.closingTickets[ticketChannel.id];
      saveConfig(configData);
      await updateStatsMessage(interaction.guild).catch(() => {});

      const reopenedEmbed = new EmbedBuilder()
        .setTitle("🔓 Ticket réouvert")
        .setDescription(
          "Ce ticket vient d'être remis en service.\n\n" +
          "La discussion est de nouveau ouverte et l'équipe peut reprendre le suivi de la demande."
        )
        .addFields(
          { name: "Réouvert par", value: `${interaction.user}`, inline: true },
          { name: "Statut", value: "Messages autorisés", inline: true }
        )
        .setThumbnail(interaction.client.user.displayAvatarURL())
        .setColor(guildConfig.globalEmbedColor)
        .setFooter({ text: "U-Bot Tickets • Ticket actif" })
        .setTimestamp();

      if (interaction.message?.editable) {
        await interaction.message.edit(withGuildBanner(guildConfig, { embeds: [reopenedEmbed], components: [] }, 'ticket-reopen-banner')).catch(() => {});
      }

      await sendLog(
        interaction.guild,
        new EmbedBuilder()
          .setTitle("🔓 Ticket réouvert")
          .addFields(
            { name: "Salon", value: `\`${ticketChannel.name}\``, inline: true },
            { name: "Réouvert par", value: `${interaction.user}`, inline: true },
            { name: "Fermeture annulée", value: pendingDeleteAt ? `<t:${Math.floor(pendingDeleteAt / 1000)}:R>` : "Oui", inline: true }
          )
          .setColor(guildConfig.globalEmbedColor)
          .setTimestamp()
      );

      break;
    }

    case 'save_close_archive': {
      if (!canManageTicket(interaction)) {
        return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const ticketChannel = interaction.channel || await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
      if (!ticketChannel) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon du ticket introuvable ou déjà supprimé.", flags: 64 });
      }

      const pendingClose = guildConfig.pendingClosures[ticketChannel.id];
      if (!pendingClose) {
        return replyAndAutoDelete(interaction, { content: "❌ Aucune fermeture en attente", flags: 64 });
      }

      if (pendingClose.expiresAt && pendingClose.expiresAt < Date.now()) {
        delete guildConfig.pendingClosures[ticketChannel.id];
        saveConfig(configData);
        return replyAndAutoDelete(interaction, { content: "❌ La demande de fermeture a expiré", flags: 64 });
      }

      if (pendingClose.archiveSavedAt) {
        return replyAndAutoDelete(interaction, { content: "❌ L'archive a déjà été sauvegardée", flags: 64 });
      }

      const archiveResult = await saveTicketArchive(interaction.guild, ticketChannel, interaction.user);

      if (!archiveResult.ok) {
        return replyAndAutoDelete(interaction, { content: archiveResult.reason, flags: 64 });
      }

      pendingClose.archiveSavedAt = Date.now();
      pendingClose.archivedBy = interaction.user.id;
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: "✅ Archive sauvegardée", flags: 64 });
    }

    case 'cancel_close_ticket': {
      if (!canManageTicket(interaction)) {
        return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const pendingClose = guildConfig.pendingClosures[interaction.channel.id];
      if (!pendingClose) {
        return replyAndAutoDelete(interaction, { content: "❌ Aucune fermeture en attente", flags: 64 });
      }

      if (pendingClose.expiresAt && pendingClose.expiresAt < Date.now()) {
        delete guildConfig.pendingClosures[interaction.channel.id];
        saveConfig(configData);
        return replyAndAutoDelete(interaction, { content: "❌ La demande de fermeture a expiré", flags: 64 });
      }

      delete guildConfig.pendingClosures[interaction.channel.id];
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: '❌ Fermeture annulée', flags: 64 });
    }
    } // Fin du Switch

    // Si aucune condition n'est remplie, on ne laisse pas l'interaction expirer
    if (!interaction.replied && !interaction.deferred && interaction.isButton() && interaction.customId?.startsWith('xp_')) {
        return quietlyAcknowledgeComponent(interaction);
    }

    if (!interaction.replied && !interaction.deferred && interaction.isButton()) {
        return replyAndAutoDelete(interaction, { content: "⚠️ Bouton non reconnu ou en cours de déploiement.", flags: 64 });
    }
  } catch (err) {
    console.error("BUTTON ERROR:", err);
  }
}

/* ========================= */
// CONFIGURATION LIVE

async function sendLiveConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const embed = new EmbedBuilder()
    .setTitle("📡 Configuration des Alertes Live")
    .setDescription(
      "Configurez ici les notifications automatiques pour vos plateformes préférées.\n\n" +
      "Choisissez la plateforme que vous souhaitez ajouter ou modifier :"
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('live_config_twitch').setLabel('Twitch').setStyle(ButtonStyle.Primary).setEmoji('1499576322869956668'),
    new ButtonBuilder().setCustomId('live_config_youtube').setLabel('YouTube').setStyle(ButtonStyle.Danger).setEmoji('1499576375911383110'),
    new ButtonBuilder().setCustomId('live_config_tiktok').setLabel('TikTok').setStyle(ButtonStyle.Secondary).setEmoji('1499576285951823902')
  );

  return replyAndAutoDelete(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row], flags: 64 }, 'live-banner'));
}

function buildLiveConfigModal(platform, existingData = null) {
  return new ModalBuilder()
    .setCustomId(`modal_live_config_${platform}`)
    .setTitle(`Alerte ${platform.charAt(0).toUpperCase() + platform.slice(1)}`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('channel_url')
          .setLabel('Lien de la chaîne / Pseudo')
          .setPlaceholder('https://twitch.tv/nom_du_streamer')
          .setValue(existingData?.url || '')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('notif_channel_id')
          .setLabel('ID du salon de notification')
          .setValue(existingData?.channelId || '')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('role_id')
          .setLabel('ID du rôle à mentionner (Optionnel)')
          .setValue(existingData?.roleId || '')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('security_hashtag')
          .setLabel('Hashtag de sécurité (Ex: #live)')
          .setPlaceholder('Le live doit contenir ce hashtag pour être notifié')
          .setValue(existingData?.securityHashtag || '')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

async function saveLiveConfig(interaction, platform) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
  }

  const guildConfig = getGuildConfig(interaction.guildId);
  let url = interaction.fields.getTextInputValue('channel_url').trim();
  const channelId = interaction.fields.getTextInputValue('notif_channel_id').trim();
  const roleId = interaction.fields.getTextInputValue('role_id').trim();
  const securityHashtag = interaction.fields.getTextInputValue('security_hashtag').trim();

  // Nettoyage de l'URL pour respecter la limite de 100 caractères des IDs Discord
  url = url.replace(/<|>/g, '');
  try {
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      urlObj.search = ''; // Supprime les paramètres ?...
      urlObj.hash = '';   // Supprime les ancres #...
      url = urlObj.toString().replace(/\/$/, ''); // Uniformisation sans slash final
    }
  } catch (e) {
    // On garde la valeur brute si ce n'est pas une URL complète
  }

  const targetChannel = await interaction.guild.channels.fetch(channelId).catch(() => null);
  if (!targetChannel) return replyAndAutoDelete(interaction, { content: "❌ ID de salon invalide.", flags: 64 });

  const newConfig = {
    platform,
    url,
    channelId,
    roleId: roleId || null,
    securityHashtag: securityHashtag || null,
    lastMessageId: null,
    isLive: false
  };

  if (!guildConfig.liveConfigs) guildConfig.liveConfigs = [];
  const index = guildConfig.liveConfigs.findIndex(c => c.url === url);
  if (index !== -1) guildConfig.liveConfigs[index] = newConfig;
  else guildConfig.liveConfigs.push(newConfig);

  saveConfig(configData);
  return replyAndAutoDelete(interaction, { content: `✅ Configuration live enregistrée pour **${platform}** (${url}) !`, flags: 64 });
}

async function sendLiveEditList(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const lives = guildConfig.liveConfigs || [];

  if (lives.length === 0) return replyAndAutoDelete(interaction, { content: "❌ Aucune configuration trouvée.", flags: 64 });

  const select = new StringSelectMenuBuilder()
    .setCustomId('live_edit_select')
    .setPlaceholder('Choisir une chaîne à gérer...')
    .addOptions(lives.map(l => ({
      label: l.url.split('/').pop().replace('@', ''),
      description: `${l.platform.toUpperCase()} - Salon: ${l.channelId}`,
      value: l.url,
      emoji: l.platform === 'twitch' ? '1499576322869956668' : (l.platform === 'youtube' ? '1499576375911383110' : '1499576285951823902')
    })));

  return replyAndAutoDelete(interaction, { 
    content: "📝 **Gestion des lives**\nSélectionnez une chaîne pour la modifier ou la supprimer.", 
    components: [new ActionRowBuilder().addComponents(select)], 
    flags: 64 
  });
}

async function handleLiveEditSelect(interaction, url) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const live = guildConfig.liveConfigs.find(l => l.url === url);
  if (!live) return replyAndAutoDelete(interaction, { content: "❌ Config introuvable.", flags: 64 });

  const embed = new EmbedBuilder()
    .setTitle(`⚙️ Gestion : ${url.split('/').pop()}`)
    .addFields(
      { name: "Hashtag", value: `\`${live.securityHashtag || 'Aucun'}\``, inline: true },
      { name: "Salon", value: `<#${live.channelId}>`, inline: true },
      { name: "Rôle", value: live.roleId ? `<@&${live.roleId}>` : "`Aucun`", inline: true }
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`live_btn_edit_${url}`).setLabel('Modifier').setStyle(ButtonStyle.Primary).setEmoji('✏️'),
    new ButtonBuilder().setCustomId(`live_btn_del_${url}`).setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('🗑️')
  );

  return updateComponentMessage(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'live-edit-banner'));
}

async function handleLiveDelete(interaction, url) {
  try {
    const guildConfig = getGuildConfig(interaction.guildId);
    const index = guildConfig.liveConfigs.findIndex(l => l.url === url);
    if (index !== -1) {
      guildConfig.liveConfigs.splice(index, 1);
      saveConfig(configData);
      return await updateComponentMessage(interaction, { content: `✅ Configuration supprimée pour **${url}**.`, embeds: [], components: [] });
    }
    return await replyAndAutoDelete(interaction, { content: "❌ Erreur lors de la suppression.", flags: 64 });
  } catch (err) {
    console.error("❌ Erreur suppression live:", err);
  }
}

/* ========================= */
async function handleModal(interaction) {
  try {
    const guildConfig = getGuildConfig(interaction.guildId);
    const updatesSourceMessage = interaction.customId.startsWith('modal_set_bot_nickname') ||
      interaction.customId.startsWith('modal_set_global_banner') ||
      interaction.customId.startsWith('modal_set_global_color');

    if (!updatesSourceMessage && !interaction.deferred && !interaction.replied) {
      await interaction.deferReply({ flags: 64 }).catch(() => {});
    }
    // RÉPONSE PRIORITAIRE : Traitement du formulaire de nom
    if (interaction.customId.startsWith('modal_set_bot_nickname')) {
      return await handleSetBotNicknameModal(interaction);
    }

    if (interaction.customId.startsWith('modal_set_global_banner')) {
      const url = interaction.fields.getTextInputValue('banner_url').trim();

      if (!url) {
        guildConfig.globalEmbedBanner = null;
        saveConfig(configData);
        return updateComponentMessage(interaction, await buildBotNamePanelPayload(interaction));
      }

      if (!/^https?:\/\//i.test(url)) {
        return replyAndAutoDelete(interaction, { content: "❌ URL invalide : utilisez un lien direct commençant par http:// ou https://.", flags: 64 });
      }
      
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'U-Bot/2.9.17 (+Discord Embed Image Fetch)'
          }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const buffer = Buffer.from(await response.arrayBuffer());
        const contentType = response.headers.get('content-type');
        const extension = getImageExtensionFromContentType(contentType) || getImageExtensionFromBuffer(buffer);
        if (!extension) throw new Error(`Type d'image non supporté (${contentType || 'inconnu'})`);

        const publicBaseUrl = getPublicBaseUrl();
        if (!publicBaseUrl) {
          guildConfig.globalEmbedBanner = url;
          saveConfig(configData);
          return updateComponentMessage(interaction, await buildBotNamePanelPayload(interaction));
        }

        const assetsDir = path.join(__dirname, '../Data/assets', interaction.guildId);
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

        const fileName = `banner${extension}`;
        fs.writeFileSync(path.join(assetsDir, fileName), buffer);
        
        guildConfig.globalEmbedBanner = `${publicBaseUrl}/assets/${interaction.guildId}/${fileName}?v=${Date.now()}`;
        saveConfig(configData);
        return updateComponentMessage(interaction, await buildBotNamePanelPayload(interaction));
      } catch (err) {
        guildConfig.globalEmbedBanner = url;
        saveConfig(configData);
        return updateComponentMessage(interaction, await buildBotNamePanelPayload(interaction));
      }
    }

    if (interaction.customId.startsWith('modal_set_global_color')) {
      const color = interaction.fields.getTextInputValue('color_hex').trim();

      // Validation simple du format HEX
      if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
        return replyAndAutoDelete(interaction, { content: "❌ Code couleur HEX invalide. Utilisez le format #RRGGBB.", flags: 64 });
      }

      guildConfig.globalEmbedColor = color;
      saveConfig(configData);
      return updateComponentMessage(interaction, await buildBotNamePanelPayload(interaction));
    }

    if (interaction.customId === 'modal_logs') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon invalide", flags: 64 });
      }
       guildConfig.logsChannel = channelId;
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: "✅ Logs configurés", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_logs') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon invalide", flags: 64 });
      }

      guildConfig.logsChannel = channelId;
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: "✅ Logs modifiés", flags: 64 });
    }

    if (interaction.customId === 'modal_stats') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon invalide", flags: 64 });
      }

      guildConfig.statsChannel = channelId;
      guildConfig.statsMessageId = null;
      saveConfig(configData);
      await updateStatsMessage(interaction.guild);
      return replyAndAutoDelete(interaction, { content: "✅ Stats configurés", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_stats') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon invalide", flags: 64 });
      }

      guildConfig.statsChannel = channelId;
      guildConfig.statsMessageId = null;
      saveConfig(configData);
      await updateStatsMessage(interaction.guild);
      return replyAndAutoDelete(interaction, { content: "✅ Stats modifiées", flags: 64 });
    }

    if (interaction.customId === 'modal_panel') {
      if (!(await ensureBotPermissions(interaction))) {
        return;
      }

      const channelId = interaction.fields.getTextInputValue('channel_id');
      const options = interaction.fields.getTextInputValue('options')
        .split('\n')
        .map(option => option.trim())
        .filter(Boolean);
      const categoriesInput = interaction.fields.getTextInputValue('categories_input')
        .split('\n')
        .map(category => category.trim())
        .filter(Boolean);
      const rolesInput = interaction.fields.getTextInputValue('roles') || "";
      const roleIds = parseRoleIds(rolesInput);
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return replyAndAutoDelete(interaction, { content: "❌ Salon invalide", flags: 64 });
      }

      if (!options.length) {
        return replyAndAutoDelete(interaction, { content: "❌ Aucune option valide", flags: 64 });
      }

      if (options.length !== categoriesInput.length) {
        return replyAndAutoDelete(interaction, { content: "❌ Le nombre d'options et de catégories doit correspondre", flags: 64 });
      }

      for (const roleId of roleIds) {
        if (!interaction.guild.roles.cache.get(roleId)) {
          return replyAndAutoDelete(interaction, { content: "❌ Rôle de modération invalide", flags: 64 });
        }
      }

      for (let index = 0; index < categoriesInput.length; index++) {
        const categoryId = categoriesInput[index];
        const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

        if (!category || category.type !== ChannelType.GuildCategory) {
          return replyAndAutoDelete(interaction, { content: `❌ Catégorie invalide pour l'option ${options[index]}`, flags: 64 });
        }
      }

      const deletedPanels = await purgeTicketPanelMessages(channel, interaction.client.user.id);
      if (deletedPanels > 0) {
        console.log(`🧹 [PURGE] ${deletedPanels} ancien(s) panel(s) ticket supprimé(s) dans #${channel.name}`);
      }

      for (const oldOption of Object.keys(guildConfig.categories || {})) {
        if (!options.includes(oldOption)) {
          delete guildConfig.categories[oldOption];
          delete guildConfig.roles[oldOption];
        }
      }

      options.forEach((option, index) => {
        guildConfig.categories[option] = categoriesInput[index];
        guildConfig.roles[option] = roleIds;
      });

      saveConfig(configData);

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Choisir une option')
        .addOptions(options.map(option => ({ label: option, value: option })));

      const panelPayload = withGuildBanner(guildConfig, {
        embeds: [
          new EmbedBuilder()
            .setTitle("🎫 Tickets")
          .setDescription(
            "### 🛰️ Centre d'Assistance & Support\n" +
            "> *Un problème ou une question ? Notre équipe est là pour vous aider. Sélectionnez la catégorie appropriée ci-dessous pour ouvrir une session de chat privée.*\n\n" +
            "**📌 Procédure :**\n" +
            "┣ 1️⃣ Choisissez votre motif dans le menu déroulant.\n" +
            "┣ 2️⃣ Expliquez votre demande avec un maximum de détails.\n" +
            "┗ 3️⃣ Un modérateur vous répondra dans les plus brefs délais."
          )
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setImage(guildConfig.globalEmbedBanner)
            .setColor(guildConfig.globalEmbedColor)
        ],
        components: [new ActionRowBuilder().addComponents(menu)]
      }, 'ticket-panel-banner');

      const panelMessage = await channel.send(panelPayload);

      setTimeout(() => {
        purgeTicketPanelMessages(channel, interaction.client.user.id, panelMessage.id)
          .then(count => {
            if (count > 0) console.log(`🧹 [PURGE] ${count} panel(s) doublon(s) supprimé(s) après création dans #${channel.name}`);
          })
          .catch(() => {});
      }, 2500);

      guildConfig.panelMessages[channelId] = panelMessage.id;
      guildConfig.panelOptions[channelId] = options;
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: "✅ Panel créé", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_category') {
      const optionName = interaction.fields.getTextInputValue('option_name').trim();
      const categoryId = interaction.fields.getTextInputValue('category_id').trim();

      if (!guildConfig.categories[optionName]) {
        return replyAndAutoDelete(interaction, { content: "❌ Option introuvable", flags: 64 });
      }

      const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return replyAndAutoDelete(interaction, { content: "❌ Catégorie invalide", flags: 64 });
      }

      guildConfig.categories[optionName] = categoryId;
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: "✅ Catégorie modifiée", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_role') {
      const optionName = interaction.fields.getTextInputValue('option_name').trim();
      const rolesInput = interaction.fields.getTextInputValue('roles') || "";
      const roleIds = parseRoleIds(rolesInput);

      if (!guildConfig.categories[optionName]) {
        return replyAndAutoDelete(interaction, { content: "❌ Option introuvable", flags: 64 });
      }

      for (const roleId of roleIds) {
        if (!interaction.guild.roles.cache.get(roleId)) {
          return replyAndAutoDelete(interaction, { content: "❌ Rôle de modération invalide", flags: 64 });
        }
      }

      guildConfig.roles[optionName] = roleIds;
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: "✅ Rôle modifié", flags: 64 });
    }

    // Modal pour l'ajout d'une option
    if (interaction.customId === 'modal_panel_add_option') {
      const name = interaction.fields.getTextInputValue('opt_name').trim();
      const catId = interaction.fields.getTextInputValue('cat_id').trim();
      const rolesRaw = interaction.fields.getTextInputValue('role_ids');
      const roleIds = parseRoleIds(rolesRaw);
      const category = await interaction.guild.channels.fetch(catId).catch(() => null);
      if (!category || category.type !== ChannelType.GuildCategory) {
        return replyAndAutoDelete(interaction, { content: "❌ ID de catégorie invalide.", flags: 64 });
      }
      guildConfig.categories[name] = catId;
      guildConfig.roles[name] = roleIds;
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: `✅ Option **${name}** ajoutée ! (Recréez le panel pour l'afficher)`, flags: 64 });
    }

    if (interaction.customId === 'modal_ticket_opening') {
      const pendingCreation = pendingTicketCreations.get(interaction.user.id);

      if (!pendingCreation) {
        return replyAndAutoDelete(interaction, { content: "❌ Aucune création de ticket en attente", flags: 64 });
      }

      pendingTicketCreations.delete(interaction.user.id);
      const openingReason = interaction.fields.getTextInputValue('opening_reason').trim();

      return executeTicketCreation(interaction, pendingCreation.choice, openingReason);
    }

    if (interaction.customId === 'modal_entrance_texts') {
      guildConfig.entrance.welcomeText = interaction.fields.getTextInputValue('welcome_text').trim();
      guildConfig.entrance.leaveText = interaction.fields.getTextInputValue('leave_text').trim();
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: "✅ Textes d'accueil enregistrés.", flags: 64 });
    }

    if (interaction.customId === 'modal_entrance_channels') {
      const welcomeChannelId = interaction.fields.getTextInputValue('welcome_chan').trim();
      const autoRolesInput = interaction.fields.getTextInputValue('auto_roles').trim();
      const welcomeBgUrl = interaction.fields.getTextInputValue('welcome_bg').trim();

      if (welcomeChannelId) {
        const channel = await interaction.guild.channels.fetch(welcomeChannelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
          return replyAndAutoDelete(interaction, { content: "❌ Salon bienvenue invalide.", flags: 64 });
        }
        guildConfig.entrance.welcomeChannel = welcomeChannelId;
      }

      guildConfig.entrance.autoRoles = parseRoleIds(autoRolesInput);

      if (welcomeBgUrl) {
        try {
          guildConfig.entrance.welcomeImageBg = await cacheImageUrl(interaction, welcomeBgUrl, 'welcome-bg');
        } catch (err) {
          guildConfig.entrance.welcomeImageBg = welcomeBgUrl;
          saveConfig(configData);
          return replyAndAutoDelete(interaction, { content: `⚠️ Configuration enregistrée, mais copie locale de l'image impossible : ${err.message}`, flags: 64 });
        }
      }

      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: "✅ Salons, rôles et image d'accueil enregistrés.", flags: 64 });
    }

    if (interaction.customId === 'modal_entrance_rules') {
      guildConfig.entrance.rulesText = interaction.fields.getTextInputValue('rules_text').trim();
      guildConfig.entrance.rulesRoleId = interaction.fields.getTextInputValue('rules_role').trim();
      guildConfig.entrance.rulesChannelId = interaction.fields.getTextInputValue('rules_chan').trim();
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: "✅ Règlement enregistré.", flags: 64 });
    }

    if (interaction.customId === 'modal_add_user') {
      if (!(await ensureBotPermissions(interaction))) {
        return;
      }

      const id = interaction.fields.getTextInputValue('user_id').trim();
      const member = await interaction.guild.members.fetch(id).catch(() => null);

      if (!member) {
        return replyAndAutoDelete(interaction, { content: "❌ Utilisateur invalide", flags: 64 });
      }

      if (consumeTicketActionLock(guildConfig, interaction.channel.id, `add_user:${member.id}`)) {
        saveConfig(configData);
        return replyAndAutoDelete(interaction, { content: `✅ ${member.user} est déjà ajouté au ticket.`, flags: 64 });
      }

      await interaction.channel.permissionOverwrites.edit(id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }).catch(() => {});
      
      const addLog = new EmbedBuilder()
        .setTitle("➕ Membre ajouté")
        .setDescription(`${member.user} a été ajouté à ce ticket.`)
        .setColor(guildConfig.globalEmbedColor)
        .setTimestamp();

      saveConfig(configData);
      const sentMessage = await interaction.channel.send({ embeds: [addLog] }).catch(() => null);
      if (sentMessage) {
        const purgeLegacy = () => deleteLegacyBotEmbeds(
          interaction.channel,
          interaction.client.user.id,
          embed => (embed.title || '') === "➕ Membre ajouté",
          sentMessage.id,
          15
        );
        await purgeLegacy();
        setTimeout(() => purgeLegacy().catch(() => {}), 1500);
      }
      return replyAndAutoDelete(interaction, { content: `✅ ${member.user} a été ajouté au ticket.`, flags: 64 });
    }

    if (interaction.customId === 'modal_close_ticket') {
      if (!canManageTicket(interaction)) {
        return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const reason = interaction.fields.getTextInputValue('close_reason').trim();
      guildConfig.pendingClosures[interaction.channel.id] = {
        userId: interaction.user.id,
        reason,
        expiresAt: Date.now() + PENDING_CLOSE_EXPIRE_MS
      };
      saveConfig(configData);

      return replyAndAutoDelete(interaction, buildCloseConfirmationPayload(interaction, guildConfig, reason));
    }
  } catch (err) {
    console.error("MODAL ERROR:", err);
  }
}

/* ========================= */
async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;

  const guildConfig = getGuildConfig(message.guild.id);
  const ticketOwnerId = guildConfig.ticketOwners[message.channel.id];

  // On vérifie si nous sommes dans un ticket actif
  if (!ticketOwnerId) return;

  // Identification du staff via les rôles configurés pour cette catégorie
  const option = getPanelOptionFromChannel(message.channel);
  const modRoleIds = option ? getRoleIds(guildConfig.roles[option]) : [];

  const isOwner = message.author.id === ticketOwnerId;
  const isMod = message.member.roles.cache.some(role => modRoleIds.includes(role.id)) || 
                message.member.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
                message.member.permissions.has(PermissionsBitField.Flags.Administrator);

  let statusEmoji = '';
  if (isOwner) {
    statusEmoji = '🟢';
  } else if (isMod) {
    statusEmoji = '🟠';
    if (recordTicketFirstResponse(message.guild.id, message.channel.id, message.author.id, message.createdTimestamp || Date.now())) {
      await updateStatsMessage(message.guild).catch(() => {});
    }
  }

  if (statusEmoji) {
    await setTicketStatusEmoji(message.channel, statusEmoji);
  }
}

async function handleMessageDelete(message) {
  try {
    if (message.partial) {
      await message.fetch().catch(() => null);
    }

    // On cherche dans tous les serveurs quel panel a été supprimé
    for (const guildId of Object.keys(configData.guilds)) {
      const guildConfig = configData.guilds[guildId];
      const panelEntry = Object.entries(guildConfig.panelMessages).find(([, messageId]) => messageId === message.id);

      if (panelEntry) {
        const [channelId] = panelEntry;
        const optionNames = Array.isArray(guildConfig.panelOptions[channelId]) ? guildConfig.panelOptions[channelId] : [];

        delete guildConfig.panelMessages[channelId];
        delete guildConfig.panelOptions[channelId];
        saveConfig(configData);
        break;
      }
    }
  } catch (err) {
    console.error("MESSAGE DELETE ERROR:", err);
  }
}

async function sendEditConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const menu = new StringSelectMenuBuilder()
    .setCustomId('modif_select')
    .setPlaceholder('Que veux-tu modifier ?')
    .addOptions([
      { label: 'Logs', value: 'logs', description: 'Modifier le salon des logs', emoji: '📝' },
      { label: 'Catégorie', value: 'category', description: 'Modifier la catégorie d’une option', emoji: '📂' },
      { label: 'Rôle', value: 'role', description: 'Modifier le rôle de modération d’une option', emoji: '🛡️' },
      { label: 'Stats', value: 'stats', description: 'Modifier le salon des statistiques', emoji: '📊' },
      { label: 'Options', value: 'options_panel', description: 'Gérer les options de tickets (Ajout/Suppression)', emoji: '🎫' }
    ]);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Modification de la configuration")
    .setDescription(
      "Utilise le menu ci-dessous pour modifier un élément précis du système de tickets.\n\n" +
      "📝 **Logs** → Modifier le salon des logs\n" +
      "📂 **Catégorie** → Modifier la catégorie liée à une option\n" +
      "🛡️ **Rôle** → Modifier le rôle de modération lié à une option\n" +
      "📊 **Stats** → Modifier le salon des statistiques\n" +
      "🎫 **Options** → Ajouter ou supprimer des options de tickets\n\n" +
      "_Choisis l’élément que tu souhaites mettre à jour._"
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setFooter({ text: "Système de tickets Discord" })
    .setTimestamp();

  const rowMenu = new ActionRowBuilder().addComponents(menu);

  return sendOrUpdatePanel(interaction, withGuildBanner(guildConfig, {
    embeds: [embed],
    components: [rowMenu],
    flags: 64
  }, 'ticket-edit-banner'));
}

/* ========================= */
// PERSONNALISATION DU NOM

async function buildBotNamePanelPayload(interaction) {
  const botMember = await interaction.guild.members.fetchMe().catch(() => null);
  const currentNickname = botMember?.nickname || interaction.client.user.username;
  const guildConfig = getGuildConfig(interaction.guildId);

  const embed = new EmbedBuilder()
    .setTitle("🤖 Personnalisation du bot")
    .setDescription(
      "Personnalisez l'apparence de votre bot sur ce serveur.\n\n" +
      `**Nom actuel** : \`${currentNickname}\`\n\n` +
      `**Couleur actuelle des embeds** : \`${guildConfig.globalEmbedColor}\`\n\n` +
      `**Bannière actuelle des embeds** : ${guildConfig.globalEmbedBanner ? `Voir l'image` : '`Aucune`'}`
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setFooter({ text: "Ces modifications n'affectent pas les autres serveurs." })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('bot_name_set_btn')
      .setLabel('Modifier le nom')
      .setEmoji('✏️')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('global_banner_set_btn')
      .setLabel("image d'embed")
      .setEmoji('📋')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('global_color_set_btn')
      .setLabel("Couleur d'embed")
      .setEmoji('🎨')
      .setStyle(ButtonStyle.Secondary)
  );

  return withGuildBanner(guildConfig, {
    embeds: [embed], 
    components: [row],
    flags: 64
  }, 'bot-config-banner');
}

async function refreshBotNamePanelMessage(interaction) {
  let message = interaction.message?.editable ? interaction.message : null;
  if (!message && interaction.customId?.includes(':') && interaction.channel?.messages) {
    const messageId = interaction.customId.split(':')[1];
    if (messageId && messageId !== 'none') {
      message = await interaction.channel.messages.fetch(messageId).catch(() => null);
    }
  }
  if (!message?.editable) return null;
  const payload = await buildBotNamePanelPayload(interaction);
  const editablePayload = { ...payload };
  delete editablePayload.flags;
  editablePayload.attachments = [];
  return message.edit(editablePayload).catch(() => null);
}

async function sendBotNamePanel(interaction) {
  const payload = await buildBotNamePanelPayload(interaction);
  return sendOrUpdatePanel(interaction, payload);
}

async function handleBotNameButtonClick(interaction) {
  const modal = new ModalBuilder()
    .setCustomId(`modal_set_bot_nickname:${interaction.message?.id || 'none'}`)
    .setTitle('Changer le nom du bot')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('new_nickname')
          .setLabel('Nouveau nom (vide pour réinitialiser)')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(32)
          .setRequired(false)
      )
    );

  await interaction.showModal(modal);
}

async function handleSetBotNicknameModal(interaction) {
  const newNickname = interaction.fields.getTextInputValue('new_nickname').trim();
  const guildConfig = getGuildConfig(interaction.guildId);
  
  try {
    const botMember = await interaction.guild.members.fetchMe();
    
    if (!botMember.permissions.has(PermissionsBitField.Flags.ChangeNickname) && 
        !botMember.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
      return replyAndAutoDelete(interaction, { 
        content: "❌ Je n'ai pas la permission `Changer le pseudo` ou `Gérer les pseudos` sur ce serveur.", 
        flags: 64 
      });
    }

    // Vérification de la hiérarchie des rôles
    try {
      await botMember.setNickname(newNickname || null);

      // Envoi d'un log pour tracer le changement de nom
      await sendLog(
        interaction.guild,
        new EmbedBuilder()
          .setTitle("🤖 Nom du bot modifié")
          .addFields(
            { name: "Nouveau nom", value: `\`${newNickname || interaction.client.user.username}\``, inline: true },
            { name: "Modifié par", value: `${interaction.user}`, inline: true }
          )
          .setColor(guildConfig.globalEmbedColor)
          .setTimestamp()
      );

      return updateComponentMessage(interaction, await buildBotNamePanelPayload(interaction));
    } catch (roleErr) {
      return replyAndAutoDelete(interaction, { 
        content: "❌ Impossible de changer mon nom. Mon rôle est probablement trop bas dans la hiérarchie ou je n'ai pas les permissions suffisantes.", 
        flags: 64 
      });
    }
  } catch (err) {
    console.error("Erreur changement surnom:", err);
    return replyAndAutoDelete(interaction, { content: "❌ Je n'ai pas la permission de changer mon surnom sur ce serveur.", flags: 64 });
  }
}

/* ========================= */
// PROTECTION HUB UI

async function sendProtectionConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const banner = guildConfig.globalEmbedBanner;

  const embed = new EmbedBuilder()
    .setTitle("🛡️ U-BOT | Shield Protocol")
    .setDescription(
      "### 🛰️ Centre de Commandement\n" +
      "> *Gérez l'ensemble des modules de protection avancée pour garantir la sécurité de votre communauté.*\n\n" +
      "**✨ Modules de Protection**\n" +
      "┣ 🛡️ **Anti-Raid** : Bloque les vagues de bots et comptes suspects.\n" +
      "┣ 🚫 **Anti-Spam** : Filtre le flood, les liens et les répétitions.\n" +
      "┣ 🤖 **Captcha** : Mini-jeu de vérification humaine pour les nouveaux membres.\n" +
      "┗ 📩 **DM Lock** : Prévention et signalement contre les scams en messages privés.\n\n" +
      "**📊 État actuel du serveur**"
    )
    .addFields(
      { name: "Systèmes Passifs", value: `🛡️ Anti-Raid: ${guildConfig.antiRaid.enabled ? '`🟢 ON`' : '`🔴 OFF`'}\n🚫 Anti-Spam: ${guildConfig.antiSpam.enabled ? '`🟢 ON`' : '`🔴 OFF`'}`, inline: true },
      { name: "Systèmes Actifs", value: `🤖 Captcha: ${guildConfig.verification.enabled ? '`🟢 ON`' : '`🔴 OFF`'}\n📩 DM Lock: ${guildConfig.dmLock.enabled ? '`🟢 ON`' : '`🔴 OFF`'}`, inline: true }
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(banner)
    .setColor(guildConfig.antiRaid.lockdown ? "#FF0000" : guildConfig.globalEmbedColor)
    .setFooter({ text: "U-Bot Security • Protection en temps réel", iconURL: interaction.client.user.displayAvatarURL() })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('prot_hub_antiraid').setLabel('🛡️ Anti-Raid').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot_hub_antispam').setLabel('🚫 Anti-Spam').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot_hub_captcha').setLabel('🤖 Captcha').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot_hub_dmlock').setLabel('📩 DM Lock').setStyle(ButtonStyle.Secondary)
  );

  return sendOrUpdatePanel(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row], flags: 64 }, 'protection-banner'));
}

async function toggleEntranceRules(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.entrance.rulesEnabled = !guildConfig.entrance.rulesEnabled;
  saveConfig(configData);
  return sendEntranceConfigPanel(interaction);
}

async function toggleEntranceImage(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.entrance.welcomeImage = !guildConfig.entrance.welcomeImage;
  saveConfig(configData);
  return sendEntranceConfigPanel(interaction);
}

function buildEntranceRulesModal(settings) {
  return new ModalBuilder()
    .setCustomId('modal_entrance_rules')
    .setTitle('Configuration Règlement')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rules_text').setLabel('Contenu du Règlement').setValue(settings.rulesText).setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rules_role').setLabel('ID du Rôle à donner').setValue(settings.rulesRoleId || '').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rules_chan').setLabel('ID Salon Règlement').setValue(settings.rulesChannelId || '').setStyle(TextInputStyle.Short).setRequired(true))
    );
}

async function sendAntiRaidConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.antiRaid;
  const embed = new EmbedBuilder()
    .setTitle("🛡️ Module Anti-Raid Pro")
    .setDescription(
      "Ce module surveille la fréquence des arrivées et l'ADN des nouveaux comptes.\n\n" +
      "**⚙️ Paramètres Actuels**\n" +
      `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
      `┣ 🔒 Lockdown : ${settings.lockdown ? '`🔴 ACTIF`' : '`🟢 Inactif`'}\n` +
      `┣ 👥 Seuil : \`${settings.threshold} membres\` / \`${settings.window}s\`\n` +
      `┗ ⏳ Âge mini : \`${settings.minAge} heures\``
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(settings.lockdown ? "#FF0000" : guildConfig.globalEmbedColor);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('antiraid_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('antiraid_setup').setLabel('⚙️ Paramètres').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );
  return updateComponentMessage(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'antiraid-banner'));
}

async function sendAntiSpamConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.antiSpam;
  const embed = new EmbedBuilder()
    .setTitle("🚫 Module Anti-Spam")
    .setDescription("Analyse les messages en temps réel pour filtrer les comportements abusifs.\n\n" +
      "**⚙️ Paramètres Actuels**\n" +
      `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
      `┣ 🔨 Sanction : \`${settings.action.toUpperCase()}\`\n` +
      `┗ 📝 Doublons max : \`${settings.maxDuplicates}\``
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('antispam_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('antispam_setup').setLabel('⚙️ Paramètres').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );
  return updateComponentMessage(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'antispam-banner'));
}

async function sendVerificationConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.verification;
  const embed = new EmbedBuilder()
    .setTitle("🤖 Module de Vérification Humaine")
    .setDescription("Force les nouveaux membres à résoudre un captcha avant d'accéder au serveur.\n\n" +
      "**⚙️ Paramètres Actuels**\n" +
      `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
      `┣ 🛡️ Rôle attribué : ${settings.roleId ? `<@&${settings.roleId}>` : '`❌ Non configuré`'}\n` +
      `┗ 📍 Salon Captcha : ${settings.channelId ? `<#${settings.channelId}>` : '`❌ Non configuré`'}`
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('verify_setup').setLabel('⚙️ Paramètres').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('verify_send_panel').setLabel('📤 Envoyer Panel').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );
  return updateComponentMessage(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'verification-banner'));
}

async function sendDmLockConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.dmLock;
  const embed = new EmbedBuilder()
    .setTitle("📩 Module DM Lock & Prévention")
    .setDescription("Alerte les nouveaux membres, publie des consignes anti-scam et guide les utilisateurs vers le blocage des MPs côté Discord. Les bots ne peuvent pas désactiver les DMs à la place des membres.\n\n" +
      "**⚙️ Paramètres Actuels**\n" +
      `┗ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}`
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dmlock_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('dmlock_send_panel').setLabel('📤 Envoyer Infos').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );
  return updateComponentMessage(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'dmlock-banner'));
}

function buildAntiRaidModal(settings) {
  return new ModalBuilder().setCustomId('modal_antiraid_settings').setTitle('Anti-Raid').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('threshold').setLabel('Seuil membres').setValue(String(settings.threshold)).setStyle(TextInputStyle.Short)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('window').setLabel('Fenêtre (sec)').setValue(String(settings.window)).setStyle(TextInputStyle.Short)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('min_age').setLabel('Âge mini (h)').setValue(String(settings.minAge)).setStyle(TextInputStyle.Short))
  );
}

async function saveAntiRaidConfig(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.antiRaid.threshold = parseInt(interaction.fields.getTextInputValue('threshold'));
  guildConfig.antiRaid.window = parseInt(interaction.fields.getTextInputValue('window'));
  guildConfig.antiRaid.minAge = parseInt(interaction.fields.getTextInputValue('min_age'));
  saveConfig(configData);
  return replyAndAutoDelete(interaction, { content: "✅ Configuration Anti-Raid sauvegardée !", flags: 64 });
}

function buildAntiSpamModal(settings) {
  return new ModalBuilder().setCustomId('modal_antispam_settings').setTitle('Anti-Spam').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_messages').setLabel('Max Messages').setValue(String(settings.maxMessages)).setStyle(TextInputStyle.Short)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('max_duplicates').setLabel('Max Doublons').setValue(String(settings.maxDuplicates)).setStyle(TextInputStyle.Short)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('timeout_duration').setLabel('Durée Sourdine (min)').setValue(String(settings.timeoutDuration)).setStyle(TextInputStyle.Short))
  );
}

async function saveAntiSpamConfig(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.antiSpam.maxMessages = parseInt(interaction.fields.getTextInputValue('max_messages'));
  guildConfig.antiSpam.maxDuplicates = parseInt(interaction.fields.getTextInputValue('max_duplicates'));
  guildConfig.antiSpam.timeoutDuration = parseInt(interaction.fields.getTextInputValue('timeout_duration'));
  saveConfig(configData);
  return replyAndAutoDelete(interaction, { content: "✅ Configuration Anti-Spam sauvegardée !", flags: 64 });
}

function buildVerificationModal(settings) {
  return new ModalBuilder().setCustomId('modal_verification_settings').setTitle('Captcha').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('role_id').setLabel('ID Rôle Membre').setValue(settings.roleId || '').setStyle(TextInputStyle.Short)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('channel_id').setLabel('ID Salon Captcha').setValue(settings.channelId || '').setStyle(TextInputStyle.Short))
  );
}

async function saveVerificationConfig(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.verification.roleId = interaction.fields.getTextInputValue('role_id');
  guildConfig.verification.channelId = interaction.fields.getTextInputValue('channel_id');
  saveConfig(configData);
  return replyAndAutoDelete(interaction, { content: "✅ Configuration Captcha sauvegardée !", flags: 64 });
}

async function sendUserVerificationPanel(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
  }
  const guildConfig = getGuildConfig(interaction.guildId);
  const channel = await interaction.guild.channels.fetch(guildConfig.verification.channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return replyAndAutoDelete(interaction, { content: "❌ Salon introuvable ou invalide.", flags: 64 });

  const oldMessages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
  if (oldMessages) {
    const oldPanels = oldMessages.filter(message =>
      message.author?.id === interaction.client.user.id &&
      message.components?.some(row => row.components?.some(component => component.customId === 'verify_start'))
    );
    for (const message of oldPanels.values()) {
      await message.delete().catch(() => {});
    }
  }

  const embed = new EmbedBuilder()
    .setTitle("🛡️ Portail de Vérification")
    .setDescription(
      "### Accès sécurisé\n" +
      "> Lance le mini-jeu ci-dessous pour prouver que tu es humain et obtenir l'accès au serveur.\n\n" +
      "**Déroulé :**\n" +
      "┣ Une cible visuelle te sera donnée.\n" +
      "┣ Clique sur le bon symbole parmi les choix proposés.\n" +
      "┗ Le rôle membre est attribué automatiquement après réussite."
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setColor(guildConfig.globalEmbedColor)
    .setFooter({ text: "U-Bot Security • Vérification interactive" })
    .setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify_start').setLabel('Commencer').setEmoji('🧩').setStyle(ButtonStyle.Success)
  );
  const panelMessage = await channel.send(withGuildBanner(guildConfig, { embeds: [embed], components: [row] }, 'verification-panel-banner'));
  guildConfig.verification.panelMessageId = panelMessage.id;
  saveConfig(configData);
  return replyAndAutoDelete(interaction, { content: "✅ Panel envoyé.", flags: 64 });
}

async function sendUserDmSafetyPanel(interaction) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 64 }).catch(() => {});
  }
  const guildConfig = getGuildConfig(interaction.guildId);
  const embed = new EmbedBuilder()
    .setTitle("📩 Sécurité DM")
    .setDescription(
      "### Prévention des messages privés suspects\n" +
      "> Discord ne permet pas à un bot de bloquer techniquement les DMs entre membres. Ce module applique donc la protection disponible : prévention, consignes claires et signalement rapide.\n\n" +
      "**Pour désactiver les MPs du serveur :**\n" +
      "┣ Clique sur le nom du serveur en haut à gauche.\n" +
      "┣ Ouvre **Paramètres de confidentialité**.\n" +
      "┣ Décoche **Messages privés**.\n" +
      "┗ Décoche aussi **Demandes de messages** si l'option est visible.\n\n" +
      "**Règles de sécurité :**\n" +
      "┣ Le staff ne demande jamais ton mot de passe ni ton code 2FA.\n" +
      "┣ Ne clique pas sur les liens Nitro, crypto ou recrutement reçus en MP.\n" +
      "┗ Signale tout message suspect à l'équipe de modération."
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setColor("#2B2D31")
    .setFooter({ text: "U-Bot Security • DM Lock" })
    .setTimestamp();
  await interaction.channel.send(withGuildBanner(guildConfig, { embeds: [embed] }, 'dm-safety-banner'));
  return replyAndAutoDelete(interaction, { content: "✅ Infos envoyées.", flags: 64 });
}

async function saveGlobalColorConfig(interaction) {
  const color = interaction.fields.getTextInputValue('color_hex').trim();
  const guildConfig = getGuildConfig(interaction.guildId);
  if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
    return replyAndAutoDelete(interaction, { content: "❌ Code couleur HEX invalide.", flags: 64 });
  }
  guildConfig.globalEmbedColor = color;
  saveConfig(configData);
  return replyAndAutoDelete(interaction, { content: `✅ Couleur mise à jour : \`${color}\``, flags: 64 });
}

function buildGlobalColorModal(currentColor) {
  return new ModalBuilder()
    .setCustomId('modal_set_global_color')
    .setTitle('Couleur des Embeds')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('color_hex')
          .setLabel('Code couleur HEX (ex: #FF0000)')
          .setPlaceholder('Ex: #5865F2')
          .setValue(currentColor || '#5865F2')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

async function sendHelpPanel(interaction) {
  const { commands } = require('../deploy-commands');
  const guildConfig = getGuildConfig(interaction.guildId);

  const categories = {
    "🛡️ Protection": ['config_protection'],
    "🎫 Tickets": ['config_ticket', 'modif_config_ticket'],
    "📜 Logs": ['set_logs'],
    "👋 Accueil": ['set_entrée'],
    "📈 Niveaux": ['set_xp', 'rank', 'leaderboard'],
    "📡 Live System": ['config_live', 'modif_config_live', 'test_live'],
    "🤖 IA & Automatisation": ['set_ia', 'annonce'],
    "🤖 Configuration": ['set_config', 'help']
  };

  const embed = new EmbedBuilder()
    .setTitle("📚 Centre d'Aide & Commandes")
    .setDescription(
      `### 🛰️ Guide Opérationnel\n` +
      `> *Voici la liste complète des outils disponibles. Le bot est actuellement en version \`2.9.16\`. Chaque commande est optimisée pour une gestion fluide de votre communauté.*\n\n` +
      `**💡 Astuce :** Toutes les commandes ci-dessous sont réservées aux administrateurs.`
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setFooter({ text: "U-Bot System • Support & Sécurité", iconURL: interaction.client.user.displayAvatarURL() })
    .setTimestamp();

  // Parcours des catégories pour remplir l'embed dynamiquement
  for (const [catName, cmdList] of Object.entries(categories)) {
    let categoryContent = "";
    
    commands.forEach(cmd => {
      const data = cmd.toJSON();
      if (cmdList.includes(data.name)) {
        // Résumé concis basé sur le nom de la commande
        const summaries = {
          'config_protection': 'Hub central Anti-Raid/Spam/Captcha.',
          'config_ticket': 'Initialiser le système de support.',
          'modif_config_ticket': 'Editer les salons et rôles support.',
          'config_live': 'Ajouter des alertes Twitch/YT/TikTok.',
          'modif_config_live': 'Gérer les chaînes surveillées.',
          'test_live': 'Simuler une alerte en direct.',
          'set_logs': 'Activer les logs ultra-détaillés.',
          'set_entrée': 'Configurer l\'accueil et les membres.',
          'set_xp': 'Gérer le système d\'XP et niveaux.',
          'rank': 'Voir son profil d\'XP.',
          'leaderboard': 'Voir le classement général.',
          'set_config': 'Changer le nom et l\'image/couleur du bot.',
          'help': 'Afficher ce menu d\'assistance.'
        };
        
        categoryContent += `┣ \`/${data.name}\` : ${summaries[data.name] || data.description}\n`;
      }
    });

    if (categoryContent) {
      embed.addFields({ 
        name: catName, 
        value: categoryContent.replace(/┣(?=[^┣]*$)/, "┗"), // Remplace le dernier symbole pour le design
        inline: false 
      });
    }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Support Officiel')
      .setURL('https://discord.gg/example') // Remplace par ton lien
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setCustomId('prot_hub_back')
      .setLabel('Dashboard Sécurité')
      .setEmoji('🛡️')
      .setStyle(ButtonStyle.Secondary)
  );

  return replyAndAutoDelete(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row], flags: 64 }, 'help-banner'));
}

async function sendLogsConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.detailedLogs;

  const embed = new EmbedBuilder()
    .setTitle("🛰️ U-BOT | Logging Protocol")
    .setDescription(
      "### 📜 Système de Logs Ultra-Détaillés\n" +
      "> *Surveillez chaque action effectuée sur votre serveur avec une précision chirurgicale.*\n\n" +
      "**✨ Modules de Surveillance**\n" +
      "┣ 📜 **Messages** : Suppressions et modifications.\n" +
      "┣ 👥 **Membres** : Arrivées, départs, profils et rôles.\n" +
      "┣ 🛡️ **Modération** : Bannissements et actions Staff (Audit Logs).\n" +
      "┗ ⚙️ **Serveur** : Salons, permissions et webhooks.\n\n" +
      "**📊 État du système**\n" +
      `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
      `┗ 📂 Catégorie : ${settings.categoryId ? `<#${settings.categoryId}>` : '`❌ Non configuré`'}`
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('logs_toggle_status')
      .setLabel(settings.enabled ? 'Désactiver' : 'Activer')
      .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('logs_setup_channels')
      .setLabel('🛠️ Créer Catégorie & Salons')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(settings.enabled && settings.categoryId !== null),
    new ButtonBuilder()
      .setCustomId('prot_hub_back')
      .setLabel('Retour')
      .setStyle(ButtonStyle.Secondary)
  );

  return sendOrUpdatePanel(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row], flags: 64 }, 'logs-banner'));
}

async function toggleLogsStatus(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.detailedLogs.enabled = !guildConfig.detailedLogs.enabled;
  saveConfig(configData);
  return sendLogsConfigPanel(interaction);
}

async function setupLogsChannels(interaction) {
  const guild = interaction.guild;
  const guildConfig = getGuildConfig(guild.id);
  await interaction.deferReply({ flags: 64 });

  try {
    let category = guild.channels.cache.get(guildConfig.detailedLogs.categoryId);
    if (!category) {
      category = await guild.channels.create({
        name: '🛰️-ubot-logs',
        type: ChannelType.GuildCategory,
        permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }]
      });
      guildConfig.detailedLogs.categoryId = category.id;
    }

    const channels = [
      { key: 'message', name: '📜-messages' },
      { key: 'member', name: '👥-membres' },
      { key: 'mod', name: '🛡️-moderation' },
      { key: 'server', name: '⚙️-serveur' }
    ];

    for (const chan of channels) {
      let existing = guild.channels.cache.get(guildConfig.detailedLogs.channels[chan.key]);
      if (!existing) {
        existing = await guild.channels.create({ name: chan.name, type: ChannelType.GuildText, parent: category.id });
        guildConfig.detailedLogs.channels[chan.key] = existing.id;
      }
    }

    saveConfig(configData);
    return interaction.editReply({ content: "✅ Catégorie et salons de logs créés avec succès ! Pensez à activer le système." });
  } catch (err) {
    return interaction.editReply({ content: "❌ Erreur lors de la création des salons. Vérifiez mes permissions." });
  }
}

async function sendEntranceConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.entrance;

  const embed = new EmbedBuilder()
    .setTitle("👋 U-BOT | Entrance Protocol")
    .setDescription(
      "### 🚀 Gestion des Flux de Membres\n" +
      "> *Automatisez l'accueil, l'attribution des rôles et le monitoring de votre population.*\n\n" +
      "**✨ Fonctionnalités**\n" +
      "┣ 📝 **Accueil/Départ** : Messages et images personnalisés.\n" +
      "┣ 🎭 **Auto-Role** : Attribution automatique à l'arrivée.\n" +
      "┣ ⚖️ **Règlement** : Validation par bouton (Gatekeeping).\n" +
      "┗ 🖼️ **Image d'accueil** : Fond personnalisé téléchargé localement.\n\n" +
      "**📊 État du système**\n" +
      `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
      `┣ 🖼️ Image : ${settings.welcomeImage ? '`🟢 ON`' : '`🔴 OFF`'}\n` +
      `┣ 🎭 Auto-Roles : \`${settings.autoRoles.length}\` configurés\n` +
      `┗ ⚖️ Règlement : ${settings.rulesEnabled ? '`🟢 Actif`' : '`🔴 Off`'}`
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entrance_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('entrance_setup_welcome').setLabel('📝 Textes').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('entrance_setup_roles').setLabel('🎭 Rôles & Salons').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );

  const rowRules = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('entrance_toggle_rules').setLabel(settings.rulesEnabled ? 'Rules: ON' : 'Rules: OFF').setStyle(settings.rulesEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entrance_toggle_image').setLabel(settings.welcomeImage ? 'Image: ON' : 'Image: OFF').setStyle(settings.welcomeImage ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('entrance_setup_rules').setLabel('⚖️ Règlement').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('entrance_send_rules').setLabel('📤 Envoyer Règlement').setStyle(ButtonStyle.Danger).setDisabled(!settings.rulesEnabled || !settings.rulesChannelId)
  );

  return sendOrUpdatePanel(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row, rowRules], flags: 64 }, 'entrance-banner'));
}

async function toggleEntranceStatus(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.entrance.enabled = !guildConfig.entrance.enabled;
  saveConfig(configData);
  return sendEntranceConfigPanel(interaction);
}

function buildEntranceTextModal(settings) {
  return new ModalBuilder()
    .setCustomId('modal_entrance_texts')
    .setTitle('Textes Accueil & Départ')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('welcome_text').setLabel('Message de Bienvenue').setValue(settings.welcomeText).setStyle(TextInputStyle.Paragraph).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('leave_text').setLabel('Message de Départ').setValue(settings.leaveText).setStyle(TextInputStyle.Paragraph).setRequired(true))
    );
}

function buildEntranceRolesModal(settings) {
  return new ModalBuilder()
    .setCustomId('modal_entrance_channels')
    .setTitle('Salons & Rôles')
    .addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('welcome_chan').setLabel('ID Salon Bienvenue').setValue(settings.welcomeChannel || '').setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('auto_roles').setLabel('IDs Rôles auto (séparés par ,)').setValue(settings.autoRoles.join(',')).setStyle(TextInputStyle.Short).setRequired(false)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('welcome_bg').setLabel('URL Fond Image (700x250)').setValue(settings.welcomeImageBg || '').setStyle(TextInputStyle.Short).setRequired(false))
    );
}

async function sendXPConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.xp;

  const embed = new EmbedBuilder()
    .setTitle("📈 U-BOT | Leveling Protocol")
    .setDescription(
      "### 🚀 Système d'Engagement & Niveaux\n" +
      "> *Récompensez l'activité de vos membres avec un système de progression complet.*\n\n" +
      "**✨ Fonctionnalités**\n" +
      "┣ 📊 **Progression** : XP dynamique par message.\n" +
      "┣ 🏆 **Leaderboard** : Classement mondial du serveur.\n" +
      "┣ 🎖️ **Prestige** : Système de réinitialisation avec bonus.\n" +
      "┗ 🃏 **Cartes Profil** : Cartes générées dynamiquement.\n\n" +
      "**📊 État actuel**\n" +
      `┣ 📡 État : ${settings.enabled ? '`🟢 Activé`' : '`🔴 Désactivé`'}\n` +
      `┣ ⏱️ Cooldown : \`${settings.cooldown}s\`\n` +
      `┗ 👥 Joueurs : \`${settings.users ? Object.keys(settings.users).length : 0}\``
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('xp_toggle_status').setLabel(settings.enabled ? 'Désactiver' : 'Activer').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );

  return sendOrUpdatePanel(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [row], flags: 64 }, 'xp-banner'));
}

async function toggleXPStatus(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.xp.enabled = !guildConfig.xp.enabled;
  saveConfig(configData);
  return sendXPConfigPanel(interaction);
}

async function sendAIConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.ai;

  const embed = new EmbedBuilder()
    .setTitle("🤖 U-BOT | AI & Automation Protocol")
    .setDescription(
      "### 🧠 Intelligence Artificielle Intégrée\n" +
      "> *Automatisez les tâches redondantes et améliorez l'expérience utilisateur grâce à l'IA.*\n\n" +
      "**✨ Modules Disponibles**\n" +
      `┣ 📡 **Module Global** : ${settings.enabled ? '`🟢 ACTIVÉ`' : '`🔴 DÉSACTIVÉ`'}\n` +
      `┣ 💬 **Chat IA** : ${settings.chatEnabled ? '`🟢 ON`' : '`🔴 OFF`'}\n` +
      `┣ 🌍 **Traduction Auto** : ${settings.autoTranslate ? '`🟢 ON`' : '`🔴 OFF`'}\n` +
      `┣ ✍️ **Correction Ortho** : ${settings.spellCheck ? '`🟢 ON`' : '`🔴 OFF`'}\n` +
      `┗ 💡 **Suggestions Staff** : ${settings.staffSuggestions ? '`🟢 ON`' : '`🔴 OFF`'}\n\n` +
      "**📊 Salon IA** : " + (settings.aiChannel ? `<#${settings.aiChannel}>` : '`Non défini`')
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(settings.enabled ? guildConfig.globalEmbedColor : "#2B2D31")
    .setTimestamp();

  const rowMaster = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_toggle_status').setLabel(settings.enabled ? 'Désactiver le module' : 'Activer le module').setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ai_set_channel').setLabel('Définir Salon IA').setStyle(ButtonStyle.Primary)
  );

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_toggle_chat').setLabel('Chat IA').setStyle(settings.chatEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_toggle_translate').setLabel('Traduction').setStyle(settings.autoTranslate ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_toggle_ortho').setLabel('Correction').setStyle(settings.spellCheck ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_toggle_staff').setLabel('Suggestions Staff').setStyle(settings.staffSuggestions ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );

  return sendOrUpdatePanel(interaction, withGuildBanner(guildConfig, { embeds: [embed], components: [rowMaster, row1, row2], flags: 64 }, 'ai-banner'));
}

async function toggleAISetting(interaction, key) {
  const guildConfig = getGuildConfig(interaction.guildId);
  guildConfig.ai[key] = !guildConfig.ai[key];
  saveConfig(configData);
  return sendAIConfigPanel(interaction);
}

module.exports = {
  // Core & Tickets
  getGuildConfig,
  getFullConfig,
  saveConfig,
  sendLog,
  withGuildBanner,
  sendConfigPanel,
  sendEditConfigPanel,
  buildGlobalColorModal,
  replyAndAutoDelete,
  // Live System
  sendLiveConfigPanel,
  buildLiveConfigModal,
  saveLiveConfig,
  sendLiveEditList,
  handleLiveEditSelect,
  handleLiveDelete,
  // Protection Hub
  sendProtectionConfigPanel,
  sendAntiRaidConfigPanel,
  sendAntiSpamConfigPanel,
  sendVerificationConfigPanel,
  sendDmLockConfigPanel,
  buildAntiRaidModal,
  saveAntiRaidConfig,
  buildAntiSpamModal,
  saveAntiSpamConfig,
  buildVerificationModal,
  saveVerificationConfig,
  sendUserVerificationPanel,
  sendUserDmSafetyPanel,
  // Help System
  sendHelpPanel,
  sendLogsConfigPanel,
  sendEntranceConfigPanel,
  sendXPConfigPanel,
  toggleXPStatus,
  sendAIConfigPanel,
  toggleAISetting,
  saveGlobalColorConfig,
  CONFIG_MESSAGE_DELETE_DELAY_MS, // Keep this one, it's a constant
  handleButtons,
  handleModal,
  handleMessage,
  handleMessageDelete,
  updateStatsMessage,
  showStaffStats,
  resumeTicketState,
  cleanupLegacyTicketPanels, // Export de la nouvelle fonction
  refreshActiveTicketControls, // Export de la nouvelle fonction
  sendBotNamePanel,
  startVisualTimer
};
