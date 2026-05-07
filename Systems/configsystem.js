const fs = require('fs');
const path = require('path');
console.log('🚀 [configsystem.js] Loading version 2.8.71...');
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
  staffStats: {},
  pendingClosures: {},
  pendingDeletions: {},
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

function getGuildConfig(guildId) {
  if (!configData.guilds) configData.guilds = {};
  if (!configData.guilds[guildId]) {
    configData.guilds[guildId] = JSON.parse(JSON.stringify(defaultGuildSettings));
    saveConfig(configData);
  } else {
    // Migration : s'assure que tous les nouveaux champs de defaultGuildSettings existent
    let modified = false;
    for (const key in defaultGuildSettings) {
      if (configData.guilds[guildId][key] === undefined) {
        configData.guilds[guildId][key] = JSON.parse(JSON.stringify(defaultGuildSettings[key]));
        modified = true;
      }
    }

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
  let lastSecond = -1;
  const updateFooter = async () => {
    try {
      if (!message || !message.editable) return;
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
    if (Date.now() >= deleteAt) {
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

async function replyAndAutoDelete(interaction, payload) {
  let message = null;
  try {
    if (interaction.deferred || interaction.replied) {
      message = await interaction.followUp(payload);
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
    console.warn('SAFE REPLY ERROR:', err?.message || err);
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

/* ========================= */
function formatDate() {
  const d = new Date();
  return `${d.getDate()}-${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
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

  const maxLength = 100;
  const baseName = channelName.slice(0, maxLength - suffix.length - 1).replace(/-+$/g, '');
  return `${baseName}-${suffix}`;
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

function getPanelOptionFromChannel(channel) {
  if (!channel || !channel.guildId) return null;
  const guildConfig = getGuildConfig(channel.guildId);
  // On cherche l'option qui correspond au début du nom du salon (ex: "general-ticket-")
  return Object.keys(guildConfig.categories).find(option => channel.name.startsWith(`${option}-`)) || null;
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

  await channel.send({ embeds: [embed] }).catch(() => {});
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

function buildStatsPayload(guildId) {
  const guildConfig = getGuildConfig(guildId);
  const embed = new EmbedBuilder()
    .setTitle("📊 Statistiques")
    .addFields(
      { name: "🎫 Ouverts", value: `${guildConfig.stats.opened || 0}`, inline: true },
      { name: "🔒 Fermés", value: `${guildConfig.stats.closed || 0}`, inline: true }
    )
    .setColor(guildConfig.globalEmbedColor)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('refresh_stats')
      .setLabel('🔄 Refresh')
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
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

  const payload = buildStatsPayload(guild.id);

  if (guildConfig.statsMessageId) {
    const existingMessage = await channel.messages.fetch(guildConfig.statsMessageId).catch(() => null);

    if (existingMessage) {
      await existingMessage.edit(payload).catch(() => {});
      return;
    }
  }

  const message = await channel.send(payload).catch(() => null);

  if (message) {
    guildConfig.statsMessageId = message.id;
    saveConfig(configData);
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
  const ticketId = String(guildConfig.stats.opened).padStart(4, '0');
  const channelName = `${choice}-${ticketId}`;

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
  setTicketCount(interaction.guildId, interaction.user.id, getTicketCount(interaction.guildId, interaction.user.id) + 1);
  saveConfig(configData);

  const embed = new EmbedBuilder()
    .setTitle(`🎫 Ticket - ${choice}`)
    .setDescription(`Bienvenue ${interaction.user},\n\nLe staff a été notifié de votre demande.\n\n**Raison :** ${openingReason || "Aucune raison fournie"}`)
    .addFields(
      { name: "Utilisateur", value: `${interaction.user}`, inline: true },
      { name: "Numéro", value: `#${ticketId}`, inline: true }
    )
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Prendre en charge').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
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
            if (guildConfig.pendingDeletions) delete guildConfig.pendingDeletions[channel.id];
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
          console.log(`🛡️ [TICKETS] Adoption du ticket orphelin : #${channel.name}`);
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
                         cleanObj(guildConfig.claims) + 
                         cleanObj(guildConfig.pendingClosures) + 
                         cleanObj(guildConfig.pendingDeletions);

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

  return replyAndAutoDelete(interaction, {
    embeds: [embed],
    components: [row],
    flags: 64
  });
}

/* ========================= */
async function handleButtons(interaction) {
  try {
    const guildConfig = getGuildConfig(interaction.guildId);

    // RÉPONSE PRIORITAIRE : On traite le bouton AVANT toute lecture de fichier
    if (interaction.customId === 'bot_name_set_btn') {
      return await handleBotNameButtonClick(interaction);
    }

    if (interaction.customId === 'logs_toggle_status') return await toggleLogsStatus(interaction);
    if (interaction.customId === 'logs_setup_channels') return await setupLogsChannels(interaction);

    if (interaction.customId === 'entrance_toggle_status') return await toggleEntranceStatus(interaction);
    if (interaction.customId === 'entrance_toggle_rules') return await toggleEntranceRules(interaction);
    if (interaction.customId === 'entrance_toggle_image') return await toggleEntranceImage(interaction);
    if (interaction.customId === 'entrance_setup_welcome') return await interaction.showModal(buildEntranceTextModal(guildConfig.entrance));
    if (interaction.customId === 'entrance_setup_roles') return await interaction.showModal(buildEntranceRolesModal(guildConfig.entrance));
    if (interaction.customId === 'entrance_setup_rules') return await interaction.showModal(buildEntranceRulesModal(guildConfig.entrance));
    if (interaction.customId === 'entrance_send_rules') return await interaction.client.entranceSystem.sendRulesPanel(interaction);

    if (interaction.customId === 'xp_toggle_status') return await toggleXPStatus(interaction);

    if (interaction.customId === 'prot_hub_back') {
      return await sendProtectionConfigPanel(interaction);
    }

    if (interaction.customId === 'prot_hub_antiraid') {
      return await sendAntiRaidConfigPanel(interaction);
    }

    if (interaction.customId === 'prot_hub_antispam') {
      return await sendAntiSpamConfigPanel(interaction);
    }

    if (interaction.customId === 'prot_hub_captcha') {
      return await sendVerificationConfigPanel(interaction);
    }

    if (interaction.customId === 'prot_hub_dmlock') {
      return await sendDmLockConfigPanel(interaction);
    }

    if (interaction.customId === 'global_banner_set_btn' || interaction.customId === 'prot_banner_set_btn') {
      const guildConfig = getGuildConfig(interaction.guildId);
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_set_global_banner')
          .setTitle('Image de fond des Embeds')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('banner_url')
                .setLabel('URL de l\'image (Bannière large)')
                .setPlaceholder('Collez le lien direct de votre image ici')
                .setValue(guildConfig.globalEmbedBanner || '')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
            )
          )
      );
    }

    if (interaction.customId === 'global_color_set_btn') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_set_global_color')
          .setTitle('Couleur des Embeds')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('color_hex')
                .setLabel('Code couleur HEX (ex: #FF0000)')
                .setPlaceholder('Ex: #5865F2')
                .setValue(guildConfig.globalEmbedColor || '#5865F2')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    // Gestion des boutons et menus de sélection spécifiques
    switch (interaction.customId) {
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
      
        if (selected === 'logs') return interaction.showModal(buildChannelIdModal('modal_edit_logs', 'Modifier logs', 'Nouvel ID salon logs'));
        if (selected === 'stats') return interaction.showModal(buildChannelIdModal('modal_edit_stats', 'Modifier stats', 'Nouvel ID salon stats'));
        if (selected === 'options_panel') {
          const embed = new EmbedBuilder().setTitle("🎫 Gestion des options").setDescription("Ajoutez ou supprimez des types de tickets.").setColor(guildConfig.globalEmbedColor);
          const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('panel_opt_add').setLabel('Ajouter').setStyle(ButtonStyle.Success).setEmoji('➕'), new ButtonBuilder().setCustomId('panel_opt_remove').setLabel('Supprimer').setStyle(ButtonStyle.Danger).setEmoji('➖'));
          return replyAndAutoDelete(interaction, { embeds: [embed], components: [row], flags: 64 });
        }
        if (selected === 'category') {
          return interaction.showModal(new ModalBuilder().setCustomId('modal_edit_category').setTitle('Modifier catégorie').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('option_name').setLabel('Nom exact de l’option').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('category_id').setLabel('Nouvel ID catégorie').setStyle(TextInputStyle.Short).setRequired(true))));
        }
        if (selected === 'role') {
          return interaction.showModal(new ModalBuilder().setCustomId('modal_edit_role').setTitle('Modifier rôle').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('option_name').setLabel('Nom exact de l’option').setStyle(TextInputStyle.Short).setRequired(true)), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('roles').setLabel('Nouveaux rôles (@role ou IDs)').setStyle(TextInputStyle.Short).setRequired(false))));
        }
        break;
      }

      case 'bot_name_set_btn':
        return await handleBotNameButtonClick(interaction);
      
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

      case 'global_banner_set_btn':
      case 'prot_banner_set_btn': // Ancien ID pour compatibilité
        return interaction.showModal(new ModalBuilder().setCustomId('modal_set_global_banner').setTitle('Image de fond des Embeds').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('banner_url').setLabel('URL de l\'image (Bannière large)').setPlaceholder('Collez le lien direct de votre image ici').setValue(guildConfig.globalEmbedBanner || '').setStyle(TextInputStyle.Short).setRequired(false))));

      case 'global_color_set_btn':
        return interaction.showModal(new ModalBuilder().setCustomId('modal_set_global_color').setTitle('Couleur des Embeds').addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('color_hex').setLabel('Code couleur HEX (ex: #FF0000)').setPlaceholder('Ex: #5865F2').setValue(guildConfig.globalEmbedColor || '#5865F2').setStyle(TextInputStyle.Short).setRequired(true))));

      case 'refresh_stats':
      await interaction.deferUpdate();
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
      const options = Object.keys(guildConfig.categories);
      if (options.length === 0) return replyAndAutoDelete(interaction, { content: "❌ Aucune option à supprimer.", flags: 64 });
      const menu = new StringSelectMenuBuilder()
        .setCustomId('panel_opt_remove_select')
        .setPlaceholder('Sélectionnez l\'option à supprimer')
        .addOptions(options.map(opt => ({ label: opt, value: opt })));
      return replyAndAutoDelete(interaction, { content: "Sélectionnez l'option à supprimer définitivement :", components: [new ActionRowBuilder().addComponents(menu)], flags: 64 });

      case 'panel_opt_remove_select': {
        if (!interaction.isStringSelectMenu()) break; // S'assurer que c'est bien un menu
      const optionToRemove = interaction.values[0];
      delete guildConfig.categories[optionToRemove];
      delete guildConfig.roles[optionToRemove];
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: `✅ L'option **${optionToRemove}** a été supprimée du système.`, flags: 64 });
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
        guildConfig.claims[interaction.channel.id] = interaction.user.id;
        guildConfig.ticketOpenTime[interaction.channel.id] = Date.now(); 
        incrementStaffStat(interaction.guildId, interaction.user.id, 'claimed');
        saveConfig(configData);
        const staffStats = getStaffStats(interaction.guildId, interaction.user.id);
        await sendLog(interaction.guild, new EmbedBuilder().setTitle("🛠️ Ticket claim").addFields(buildTicketContextFields(interaction, [{ name: "Claims staff", value: `${staffStats.claimed}`, inline: true }, { name: "Tickets fermés staff", value: `${staffStats.closed}`, inline: true }])).setColor(guildConfig.globalEmbedColor).setTimestamp());
        return replyAndAutoDelete(interaction, {
          embeds: [new EmbedBuilder().setTitle("🛠️ Claim").setDescription(`${interaction.user} a pris en charge ce ticket.\n\nUn membre de l'équipe est désormais assigné à votre demande.`).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).setImage(guildConfig.globalEmbedBanner).setColor(guildConfig.globalEmbedColor).setFooter({ text: "Merci de patienter pendant le traitement." }).setTimestamp()],
          flags: 64
        });
      }

      case 'unclaim_ticket': {
        if (!canManageTicket(interaction)) return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket.", flags: 64 });
        const previousClaim = guildConfig.claims[interaction.channel.id];
        delete guildConfig.claims[interaction.channel.id];
        saveConfig(configData);
        await sendLog(interaction.guild, new EmbedBuilder().setTitle("♻️ Ticket libéré").addFields(buildTicketContextFields(interaction, [{ name: "Claim précédent", value: previousClaim ? `<@${previousClaim}>` : "Aucun", inline: true }])).setColor(guildConfig.globalEmbedColor).setTimestamp());
        return replyAndAutoDelete(interaction, {
          embeds: [new EmbedBuilder().setTitle("♻️ Libéré").setDescription(`${interaction.user}`).setThumbnail(interaction.user.displayAvatarURL({ dynamic: true })).setImage(guildConfig.globalEmbedBanner).setColor(guildConfig.globalEmbedColor)],
          flags: 64
        });
      }

      case 'save_close_archive':
        if (!canManageTicket(interaction)) return replyAndAutoDelete(interaction, { content: "❌ Tu n'es pas autorisé à gérer ce ticket.", flags: 64 });
        const pendingCloseSave = guildConfig.pendingClosures[interaction.channel.id];
        if (!pendingCloseSave) return replyAndAutoDelete(interaction, { content: "❌ Aucune fermeture en attente.", flags: 64 });
        if (pendingCloseSave.expiresAt && pendingCloseSave.expiresAt < Date.now()) {
          delete guildConfig.pendingClosures[interaction.channel.id];
          saveConfig(configData);
          return replyAndAutoDelete(interaction, { content: "❌ La demande de fermeture a expiré.", flags: 64 });
        }
        if (pendingCloseSave.archiveSavedAt) return replyAndAutoDelete(interaction, { content: "❌ L'archive a déjà été sauvegardée.", flags: 64 });
        const archiveResult = await saveTicketArchive(interaction.guild, interaction.channel, interaction.user);
        if (!archiveResult.ok) return replyAndAutoDelete(interaction, { content: archiveResult.reason, flags: 64 });
        pendingCloseSave.archiveSavedAt = Date.now();
        pendingCloseSave.archivedBy = interaction.user.id;
        saveConfig(configData);
        return replyAndAutoDelete(interaction, { content: "✅ Archive sauvegardée.", flags: 64 });

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

      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_close_ticket')
          .setTitle('Fermer ticket')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('close_reason')
                .setLabel('Raison de fermeture (optionnelle)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
            )
          )
      );

      case 'confirm_close_ticket': {
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
        return replyAndAutoDelete(interaction, { content: "❌ La demande de fermeture a expiré.", flags: 64 });
      }

      if (pendingClose.userId !== interaction.user.id) {
        return replyAndAutoDelete(interaction, { content: "❌ Seul le modérateur ayant lancé la fermeture peut la confirmer", flags: 64 });
      }

      await interaction.reply({ content: "🔒 Fermeture...", flags: 64 });
      await interaction.channel.setName(getClosingChannelName(interaction.channel.name)).catch(() => {});

      const ownerId = guildConfig.ticketOwners[interaction.channel.id];
      const claimedBy = guildConfig.claims[interaction.channel.id];
      const openedAt = guildConfig.ticketOpenTime[interaction.channel.id];
      const deleteAt = Date.now() + TICKET_DELETE_DELAY_MS;
      const durationMinutes = openedAt ? Math.max(1, Math.round((Date.now() - openedAt) / 60000)) : null;

      guildConfig.stats.closed = (guildConfig.stats.closed || 0) + 1;
      
      guildConfig.pendingDeletions[interaction.channel.id] = deleteAt;
      if (ownerId) {
        setTicketCount(interaction.guildId, ownerId, getTicketCount(interaction.guildId, ownerId) - 1);
      }

      incrementStaffStat(interaction.guildId, interaction.user.id, 'closed');
      delete guildConfig.claims[interaction.channel.id];
      delete guildConfig.ticketOwners[interaction.channel.id];
      delete guildConfig.ticketOpenTime[interaction.channel.id];
      delete guildConfig.pendingClosures[interaction.channel.id];
      saveConfig(configData);
      await updateStatsMessage(interaction.guild);

      const staffStats = getStaffStats(interaction.guildId, interaction.user.id);

      await sendMessageWithTimer(
        interaction.channel,
        {
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
        },
        TICKET_DELETE_DELAY_MS
      );

      await sendLog(
        interaction.guild,
        new EmbedBuilder()
          .setTitle("🔒 Ticket fermé")
          .addFields(
            { name: "Salon", value: `${interaction.channel.name}`, inline: true },
            { name: "Fermé par", value: `${interaction.user}`, inline: true },
            { name: "Claim", value: claimedBy ? `<@${claimedBy}>` : "Aucun", inline: true },
            { name: "Créateur", value: ownerId ? `<@${ownerId}>` : "Inconnu", inline: true },
            { name: "Durée", value: durationMinutes ? `${durationMinutes} min` : "Inconnue", inline: true },
            { name: "Raison", value: pendingClose.reason || "Aucune", inline: false },
            { name: "Archive", value: pendingClose.archiveSavedAt ? `Oui par <@${pendingClose.archivedBy}>` : "Non", inline: true },
            { name: "Claims staff", value: `${staffStats.claimed}`, inline: true },
            { name: "Tickets fermés staff", value: `${staffStats.closed}`, inline: true }
          )
          .setColor(guildConfig.globalEmbedColor)
          .setTimestamp()
      );

      setTimeout(() => {
        delete guildConfig.pendingDeletions[interaction.channel.id];
        saveConfig(configData);
        interaction.channel.delete().catch(() => {});
      }, TICKET_DELETE_DELAY_MS);
      break;
    }

    case 'save_close_archive': {
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

      if (pendingClose.archiveSavedAt) {
        return replyAndAutoDelete(interaction, { content: "❌ L'archive a déjà été sauvegardée", flags: 64 });
      }

      const archiveResult = await saveTicketArchive(interaction.guild, interaction.channel, interaction.user);

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
    if (!interaction.replied && !interaction.deferred && interaction.isButton()) {
        return replyAndAutoDelete(interaction, { content: "⚠️ Bouton non reconnu ou en cours de déploiement.", flags: 64 });
    }
  } catch (err) {
    console.error("BUTTON ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      replyAndAutoDelete(interaction, {
        content: "❌ Une erreur est survenue",
        flags: 64
      }).catch(() => {});
    }
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

  return replyAndAutoDelete(interaction, { embeds: [embed], components: [row], flags: 64 });
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

  return interaction.update({ embeds: [embed], components: [row] });
}

async function handleLiveDelete(interaction, url) {
  try {
    const guildConfig = getGuildConfig(interaction.guildId);
    const index = guildConfig.liveConfigs.findIndex(l => l.url === url);
    if (index !== -1) {
      guildConfig.liveConfigs.splice(index, 1);
      saveConfig(configData);
      return await interaction.update({ content: `✅ Configuration supprimée pour **${url}**.`, embeds: [], components: [], flags: 64 });
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
    // RÉPONSE PRIORITAIRE : Traitement du formulaire de nom
    if (interaction.customId === 'modal_set_bot_nickname') {
      return await handleSetBotNicknameModal(interaction);
    }

    if (interaction.customId === 'modal_set_global_banner') {
      await interaction.deferReply({ flags: 64 });
      const url = interaction.fields.getTextInputValue('banner_url').trim();

      if (!url) {
        guildConfig.globalEmbedBanner = null;
        saveConfig(configData);
        return interaction.editReply({ content: "🗑️ L'image d'embed a été supprimée." });
      }

      try {
        // Téléchargement de l'image
        const response = await fetch(url);
        if (!response.ok) throw new Error("Impossible de télécharger l'image");
        
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Création du dossier assets pour le serveur
        const assetsDir = path.join(__dirname, '../Data/assets', interaction.guildId);
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

        // Sauvegarde locale (on utilise l'extension d'origine ou .png par défaut)
        const filePath = path.join(assetsDir, 'banner.png');
        fs.writeFileSync(filePath, buffer);

        // Construction de l'URL publique hébergée par le bot
        // Replit fournit l'URL via les variables d'environnement
        const replName = process.env.REPL_SLUG;
        const replOwner = process.env.REPL_OWNER;
        
        if (replName && replOwner) {
          const publicUrl = `https://${replName}.${replOwner}.replit.app/assets/${interaction.guildId}/banner.png?v=${Date.now()}`;
          guildConfig.globalEmbedBanner = publicUrl;
          saveConfig(configData);
          return interaction.editReply({ content: "✅ Image téléchargée et sauvegardée localement ! Elle ne disparaîtra plus, même si vous supprimez le message d'origine." });
        } else {
          // Si hors Replit, on garde l'URL d'origine
          guildConfig.globalEmbedBanner = url;
          saveConfig(configData);
          return interaction.editReply({ content: "✅ Image enregistrée (URL directe)." });
        }
      } catch (err) {
        console.error("❌ Erreur téléchargement bannière:", err);
        return interaction.editReply({ content: "❌ Erreur : Impossible de récupérer l'image. Assurez-vous que le lien est direct (finit par .png, .jpg...).", flags: 64 });
      }
    }

    if (interaction.customId === 'modal_set_global_color') {
      const color = interaction.fields.getTextInputValue('color_hex').trim();

      // Validation simple du format HEX
      if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
        return replyAndAutoDelete(interaction, { content: "❌ Code couleur HEX invalide. Utilisez le format #RRGGBB.", flags: 64 });
      }

      guildConfig.globalEmbedColor = color;
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: `✅ La couleur des embeds a été mise à jour en \`${color}\` !`, flags: 64 });
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

      const existingPanelMessageId = guildConfig.panelMessages[channelId];
      if (existingPanelMessageId) {
        const existingPanel = await channel.messages.fetch(existingPanelMessageId).catch(() => null);

        if (existingPanel) {
          return replyAndAutoDelete(interaction, { content: "❌ Un panel existe déjà dans ce salon", flags: 64 });
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

      const panelMessage = await channel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle("🎫 Tickets")
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setImage(guildConfig.globalEmbedBanner)
            .setColor(guildConfig.globalEmbedColor)
        ],
        components: [new ActionRowBuilder().addComponents(menu)]
      });

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

      await interaction.deferReply({ flags: 64 });
      return executeTicketCreation(interaction, pendingCreation.choice, openingReason);
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

      await interaction.channel.permissionOverwrites.edit(id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      }).catch(() => {});

      await interaction.channel.send({
        content: `<@${member.id}>`,
        allowedMentions: {
          users: [member.id]
        },
        embeds: [
          new EmbedBuilder()
            .setTitle("➕ Membre ajouté")
            .setDescription(`${member.user} a été ajouté à ce ticket.`)
            .setThumbnail(interaction.client.user.displayAvatarURL())
            .setImage(guildConfig.globalEmbedBanner)
            .setColor(guildConfig.globalEmbedColor)
        ]
      }).catch(() => {});

      await sendLog(
        interaction.guild,
        new EmbedBuilder()
          .setTitle("➕ Membre ajouté")
          .addFields(
            buildTicketContextFields(interaction, [
              { name: "Membre ajouté", value: `${member.user}`, inline: true },
              { name: "ID Membre", value: `${member.id}`, inline: true }
            ])
          )
          .setColor(guildConfig.globalEmbedColor)
          .setTimestamp()
      );

      return replyAndAutoDelete(interaction, { content: "✅ Ajouté", flags: 64 });
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

      return replyAndAutoDelete(interaction, {
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
      });
    }
  } catch (err) {
    console.error("MODAL ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      replyAndAutoDelete(interaction, {
        content: "❌ Une erreur est survenue",
        flags: 64
      }).catch(() => {});
    }
  }
}

/* ========================= */
async function handleMessage(message) {
  if (!message.guild || message.author.bot) return;

  const guildConfig = getGuildConfig(message.guild.id);
  const ticketOwnerId = guildConfig.ticketOwners[message.channel.id];

  // On vérifie si nous sommes dans un ticket actif
  if (!ticketOwnerId) return;

  const currentName = message.channel.name;
  // On retire uniquement le cercle de statut (🟠 ou 🟢) situé à la fin du nom.
  // On gère les tirets (-) que Discord ajoute automatiquement devant l'émoji.
  const cleanName = currentName.replace(/[-]*[🟠🟢]$/g, '');

  // Identification du staff via les rôles configurés pour cette catégorie
  const option = getPanelOptionFromChannel(message.channel);
  const modRoleIds = option ? getRoleIds(guildConfig.roles[option]) : [];

  const isOwner = message.author.id === ticketOwnerId;
  const isMod = message.member.roles.cache.some(role => modRoleIds.includes(role.id)) || 
                message.member.permissions.has(PermissionsBitField.Flags.Administrator);

  let statusEmoji = '';
  if (isOwner) {
    statusEmoji = '🟠';
  } else if (isMod) {
    statusEmoji = '🟢';
  }

  if (statusEmoji) {
    const newName = `${cleanName}-${statusEmoji}`;
    
    if (newName !== currentName) {
      try {
        await message.channel.setName(newName);
      } catch (err) {
        // On ignore silencieusement les Rate Limits de Discord (2 renommages / 10 min)
      }
    }
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

  return replyAndAutoDelete(interaction, {
    embeds: [embed],
    components: [rowMenu],
    flags: 64
  });
}

/* ========================= */
// PERSONNALISATION DU NOM

async function sendBotNamePanel(interaction) {
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

  return replyAndAutoDelete(interaction, { 
    embeds: [embed], 
    components: [row],
    flags: 64
  });
}

async function handleBotNameButtonClick(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_set_bot_nickname')
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

      return replyAndAutoDelete(interaction, { 
        content: `✅ Le nom du bot a été mis à jour : \`${newNickname || interaction.client.user.username}\``, 
        flags: 64 
      });
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
      "┣ 🤖 **Captcha** : Vérification humaine pour les nouveaux membres.\n" +
      "┗ 📩 **DM Lock** : Prévention contre les scams en messages privés.\n\n" +
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

  return replyAndAutoDelete(interaction, { embeds: [embed], components: [row], flags: 64 });
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
  return interaction.update({ embeds: [embed], components: [row] });
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
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );
  return interaction.update({ embeds: [embed], components: [row] });
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
  return interaction.update({ embeds: [embed], components: [row] });
}

async function sendDmLockConfigPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const settings = guildConfig.dmLock;
  const embed = new EmbedBuilder()
    .setTitle("📩 Module DM Lock & Prévention")
    .setDescription("Alerte les nouveaux membres en message privé pour conseiller de désactiver leurs MPs.\n\n" +
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
  return interaction.update({ embeds: [embed], components: [row] });
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
  const guildConfig = getGuildConfig(interaction.guildId);
  const channel = await interaction.guild.channels.fetch(guildConfig.verification.channelId).catch(() => null);
  const banner = guildConfig.globalEmbedBanner;
  if (!channel || !channel.isTextBased()) return replyAndAutoDelete(interaction, { content: "❌ Salon introuvable ou invalide.", flags: 64 });
  const embed = new EmbedBuilder().setTitle("🛡️ Vérification").setDescription("Cliquez ci-dessous pour accéder au serveur.").setColor(guildConfig.globalEmbedColor).setImage(banner);
  const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('verify_start').setLabel('Vérification').setStyle(ButtonStyle.Success));
  await channel.send({ embeds: [embed], components: [row] });
  return replyAndAutoDelete(interaction, { content: "✅ Panel envoyé.", flags: 64 });
}

async function sendUserDmSafetyPanel(interaction) {
  const guildConfig = getGuildConfig(interaction.guildId);
  const banner = guildConfig.globalEmbedBanner;
  const embed = new EmbedBuilder().setTitle("📩 Sécurité DM").setDescription("Ne cliquez sur aucun lien reçu en MP.").setColor("#2B2D31").setImage(banner);
  await interaction.channel.send({ embeds: [embed] });
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
    "🎫 Tickets": ['config_ticket', 'modif_config_ticket', 'stats', 'staff_stats'],
    "📜 Logs": ['set_logs'],
    "👋 Accueil": ['set_entrée'],
    "📈 Niveaux": ['set_xp', 'rank', 'leaderboard'],
    "📡 Live System": ['config_live', 'modif_config_live', 'test_live'],
    "🛠️ Maintenance": ['maintenance'],
    "🤖 Configuration": ['set_config', 'help']
  };

  const embed = new EmbedBuilder()
    .setTitle("📚 Centre d'Aide & Commandes")
    .setDescription(
      `### 🛰️ Guide Opérationnel\n` +
      `> *Voici la liste complète des outils disponibles. Le bot est actuellement en version \`2.8.24\`. Chaque commande est optimisée pour une gestion fluide de votre communauté.*\n\n` +
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
          'maintenance': 'Gérer les MAJ et le status du bot.',
          'config_protection': 'Hub central Anti-Raid/Spam/Captcha.',
          'config_ticket': 'Initialiser le système de support.',
          'modif_config_ticket': 'Editer les salons et rôles support.',
          'stats': 'Voir les volumes de tickets.',
          'staff_stats': 'Classement d\'activité des modérateurs.',
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

  return replyAndAutoDelete(interaction, { embeds: [embed], components: [row], flags: 64 });
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

  return replyAndAutoDelete(interaction, { embeds: [embed], components: [row], flags: 64 });
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
      "┗ 📊 **Live Stats** : Salon vocal avec compteur de membres.\n\n" +
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

  return replyAndAutoDelete(interaction, { embeds: [embed], components: [row, rowRules], flags: 64 });
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
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('auto_roles').setLabel('IDs Rôles auto (séparés par ,)').setValue(settings.autoRoles.join(',')).setStyle(TextInputStyle.Short)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('stats_chan').setLabel('ID Salon Vocal Stats (Compteur)').setValue(settings.statsChannel || '').setStyle(TextInputStyle.Short)),
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

  return replyAndAutoDelete(interaction, { embeds: [embed], components: [row], flags: 64 });
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
      `┣ 💬 **Chat IA** : ${settings.chatEnabled ? '`🟢 ON`' : '`🔴 OFF`'}\n` +
      `┣ 🌍 **Traduction Auto** : ${settings.autoTranslate ? '`🟢 ON`' : '`🔴 OFF`'}\n` +
      `┣ ✍️ **Correction Ortho** : ${settings.spellCheck ? '`🟢 ON`' : '`🔴 OFF`'}\n` +
      `┗ 💡 **Suggestions Staff** : ${settings.staffSuggestions ? '`🟢 ON`' : '`🔴 OFF`'}\n\n` +
      "**📊 Salon IA** : " + (settings.aiChannel ? `<#${settings.aiChannel}>` : '`Non défini`')
    )
    .setThumbnail(interaction.client.user.displayAvatarURL())
    .setImage(guildConfig.globalEmbedBanner)
    .setColor(guildConfig.globalEmbedColor)
    .setTimestamp();

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_toggle_chat').setLabel('Chat IA').setStyle(settings.chatEnabled ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_toggle_translate').setLabel('Traduction').setStyle(settings.autoTranslate ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_toggle_ortho').setLabel('Correction').setStyle(settings.spellCheck ? ButtonStyle.Success : ButtonStyle.Secondary)
  );

  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ai_toggle_staff').setLabel('Suggestions Staff').setStyle(settings.staffSuggestions ? ButtonStyle.Success : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('ai_set_channel').setLabel('Définir Salon').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('prot_hub_back').setLabel('Retour').setStyle(ButtonStyle.Secondary)
  );

  return replyAndAutoDelete(interaction, { embeds: [embed], components: [row1, row2], flags: 64 });
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
  sendBotNamePanel,
  startVisualTimer
};
