const fs = require('fs');
const path = require('path');
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
  InteractionResponseFlags
} = require('discord.js');

const configPath = path.join(__dirname, '../Data/config.json');

const defaultConfig = {
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
  pendingClosures: {}
};

/* ========================= */
function loadConfig() {
  const configDir = path.dirname(configPath);

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    return { ...defaultConfig };
  }

  const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  return {
    ...defaultConfig,
    ...data,
    categories: data.categories || {},
    roles: data.roles || {},
    panelMessages: data.panelMessages || {},
    panelOptions: data.panelOptions || {},
    claims: data.claims || {},
    ticketCount: data.ticketCount || {},
    ticketOwners: data.ticketOwners || {},
    ticketOpenTime: data.ticketOpenTime || {},
    staffStats: data.staffStats || {},
    pendingClosures: data.pendingClosures || {},
    stats: {
      ...defaultConfig.stats,
      ...(data.stats || {})
    }
  };
}

function saveConfig(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
}

const configData = loadConfig();
const TICKET_DELETE_DELAY_MS = 30 * 60 * 1000;
const CONFIG_MESSAGE_DELETE_DELAY_MS = 3 * 60 * 1000;
const PENDING_CLOSE_EXPIRE_MS = 10 * 60 * 1000;
const pendingTicketCreations = new Map();

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

function getTicketCount(userId) {
  return Number(configData.ticketCount[userId] || 0);
}

function setTicketCount(userId, value) {
  if (value <= 0) {
    delete configData.ticketCount[userId];
    return;
  }

  configData.ticketCount[userId] = value;
}

function getStaffStats(userId) {
  return configData.staffStats[userId] || { claimed: 0, closed: 0 };
}

async function safeInteractionReply(interaction, payload, deferred = false) {
  try {
    let message = null;
    
    if (deferred || interaction.deferred) {
      const { flags, ...editPayload } = payload;
      message = await interaction.editReply(editPayload);
    } else if (!interaction.replied) {
      message = await interaction.reply(payload);
    } else {
      message = await interaction.followUp(payload);
    }

    // Auto-delete messages with ephemeral flag after 5 minutes
    if (message && payload.flags === 64) {
      setTimeout(() => {
        message.delete().catch(() => {});
      }, 300000); // 5 minutes
    }

    return message;
  } catch (err) {
    console.warn('SAFE REPLY ERROR:', err?.message || err);
    try {
      const message = await interaction.followUp(payload);
      if (message && payload.flags === 64) {
        setTimeout(() => {
          message.delete().catch(() => {});
        }, 300000);
      }
      return message;
    } catch (_) {
      return null;
    }
  }
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

function incrementStaffStat(userId, key) {
  const current = getStaffStats(userId);
  configData.staffStats[userId] = {
    ...current,
    [key]: Number(current[key] || 0) + 1
  };
}

function getPanelOptionFromChannel(channel) {
  if (!channel) return null;

  return Object.keys(configData.categories).find(option => channel.name.startsWith(`${option}-`)) || null;
}

function hasConfiguredModRole(interaction) {
  const option = getPanelOptionFromChannel(interaction.channel);
  if (!option) return false;

  const roleIds = getRoleIds(configData.roles[option]);
  if (!roleIds.length) return false;

  return roleIds.some(roleId => interaction.member?.roles?.cache?.has(roleId));
}

function canManageTicket(interaction) {
  return hasConfiguredModRole(interaction) ||
    interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageChannels);
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

async function sendLog(guild, embed) {
  if (!configData.logsChannel) return;

  const channel = await guild.channels.fetch(configData.logsChannel).catch(() => null);
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
    let lastSecond = -1;
    
    const timerInterval = setInterval(async () => {
      try {
        const timeRemaining = deleteAt - Date.now();
        if (timeRemaining <= 0) {
          clearInterval(timerInterval);
          return;
        }
        
        const currentSecond = Math.floor(timeRemaining / 1000);
        
        // Only update if seconds changed
        if (currentSecond !== lastSecond) {
          lastSecond = currentSecond;
          const minutes = Math.floor(timeRemaining / 60000);
          const seconds = Math.floor((timeRemaining % 60000) / 1000);
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
    }, 250);
    
    return message;
  } catch (err) {
    console.error("ERROR sending message with timer:", err);
    return null;
  }
}

function buildTicketContextFields(interaction, extraFields = []) {
  const ownerId = configData.ticketOwners[interaction.channel?.id];
  const claimedBy = configData.claims[interaction.channel?.id];
  const openedAt = configData.ticketOpenTime[interaction.channel?.id];
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

function buildStatsPayload() {
  const embed = new EmbedBuilder()
    .setTitle("📊 Statistiques")
    .addFields(
      { name: "🎫 Ouverts", value: `${configData.stats.opened}`, inline: true },
      { name: "🔒 Fermés", value: `${configData.stats.closed}`, inline: true }
    )
    .setColor("#5865F2")
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

async function replyAndAutoDelete(interaction, payload, delay = CONFIG_MESSAGE_DELETE_DELAY_MS) {
  await interaction.reply(payload);

  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, delay);
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
  if (!configData.statsChannel) return;

  const channel = await guild.channels.fetch(configData.statsChannel).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildText) return;

  const payload = buildStatsPayload();

  if (configData.statsMessageId) {
    const existingMessage = await channel.messages.fetch(configData.statsMessageId).catch(() => null);

    if (existingMessage) {
      await existingMessage.edit(payload).catch(() => {});
      return;
    }
  }

  const message = await channel.send(payload).catch(() => null);

  if (message) {
    configData.statsMessageId = message.id;
    saveConfig(configData);
  }
}

async function showStaffStats(interaction) {
  const entries = Object.entries(configData.staffStats)
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

  return interaction.reply({
    embeds: [
      new EmbedBuilder()
        .setTitle("📈 Statistiques staff")
        .setDescription(description)
        .setColor("#5865F2")
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
  if (!configData.logsChannel) {
    return { ok: false, reason: "❌ Aucun salon logs configuré" };
  }

  const logsChannel = await guild.channels.fetch(configData.logsChannel).catch(() => null);
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
        .setColor("#5865F2")
        .setTimestamp()
    ],
    files: [attachment]
  }).catch(() => null);

  return { ok: true };
}

async function createTicketFromChoice(interaction, choice, openingReason = '') {
  const categoryId = configData.categories[choice];
  const roleIds = getRoleIds(configData.roles[choice]);

  let deferred = false;
  try {
    await interaction.deferReply({ flags: InteractionResponseFlags.Ephemeral });
    deferred = true;
  } catch (_) {}

  const respond = async payload => safeInteractionReply(interaction, payload, deferred);

  if (!categoryId) {
    return respond({ content: "❌ Catégorie introuvable", flags: 64 });
  }

  if (getTicketCount(interaction.user.id) >= 3) {
    return respond({ content: "❌ Max 3 tickets", flags: 64 });
  }

  const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

  if (!category || category.type !== ChannelType.GuildCategory) {
    return respond({ content: `❌ Catégorie invalide pour l'option ${choice}`, flags: 64 });
  }

  if (roleIds.some(roleId => !interaction.guild.roles.cache.get(roleId))) {
    return respond({ content: `❌ Rôle de modération invalide pour l'option ${choice}`, flags: 64 });
  }

  const perms = [
    {
      id: interaction.guild.roles.everyone.id,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AttachFiles,
        PermissionsBitField.Flags.EmbedLinks
      ]
    }
  ];

  for (const roleId of roleIds) {
    if (interaction.guild.roles.cache.get(roleId)) {
      perms.push({
        id: roleId,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory
        ]
      });
    }
  }

  const channel = await interaction.guild.channels.create({
    name: `${choice}-${interaction.user.username}-${formatDate()}`,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: perms
  });

  configData.stats.opened++;
  configData.ticketOwners[channel.id] = interaction.user.id;
  configData.ticketOpenTime[channel.id] = Date.now();
  setTicketCount(interaction.user.id, getTicketCount(interaction.user.id) + 1);
  saveConfig(configData);
  await updateStatsMessage(interaction.guild);

  const mentions = roleIds.map(roleId => `<@&${roleId}>`).join(' ');

  await channel.send({
    content: `<@${interaction.user.id}> ${mentions}`.trim(),
    allowedMentions: {
      users: [interaction.user.id],
      roles: roleIds
    },
    embeds: [
      new EmbedBuilder()
        .setTitle("🎫 Support Actif")
        .setDescription(`${interaction.user}`)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
    ],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('claim_ticket').setLabel('🛠️ Claim').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('unclaim_ticket').setLabel('♻️ Libérer').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('add_user').setLabel('➕ Ajouter').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('close_ticket').setLabel('🔒 Fermer').setStyle(ButtonStyle.Danger)
      )
    ]
  });

  await channel.send({
    embeds: [
      new EmbedBuilder()
        .setTitle("✨ Bienvenue")
        .setDescription(
          `Bonjour ${interaction.user},\n\n` +
          "Ton ticket a bien été ouvert.\n" +
          `${mentions ? `L'équipe de modération concernée ${mentions} a été notifiée.\n` : ""}` +
          `${openingReason ? `Raison d'ouverture : ${openingReason}\n\n` : ""}` +
          "Merci d'expliquer ta demande avec le plus de détails possible afin que l'équipe puisse te répondre dans les meilleures conditions."
        )
        .setColor("#5865F2")
        .setTimestamp()
    ]
  });

  await sendLog(
    interaction.guild,
    new EmbedBuilder()
      .setTitle("🎫 Ticket ouvert")
      .addFields(
        { name: "Salon", value: `${channel.name}`, inline: true },
        { name: "ID Salon", value: `${channel.id}`, inline: true },
        { name: "Option", value: `${choice}`, inline: true },
        { name: "Créateur", value: `${interaction.user}`, inline: true },
        { name: "Catégorie", value: `${category.name}`, inline: true },
        { name: "Rôles notifiés", value: mentions || "Aucun", inline: false },
        { name: "Raison d'ouverture", value: openingReason || "Aucune", inline: false }
      )
      .setColor("#5865F2")
      .setTimestamp()
  );

  return respond({ content: "✅ Ticket créé", flags: 64 });
}

function cleanupConfigState(client) {
  let changed = false;

  for (const [option, categoryId] of Object.entries(configData.categories)) {
    const category = client.channels.cache.get(categoryId);

    if (!category || category.type !== ChannelType.GuildCategory) {
      delete configData.categories[option];
      delete configData.roles[option];
      changed = true;
    }
  }

  for (const option of Object.keys(configData.roles)) {
    if (!configData.categories[option]) {
      delete configData.roles[option];
      changed = true;
      continue;
    }

    const validRoleIds = getRoleIds(configData.roles[option]).filter(roleId =>
      client.guilds.cache.some(guild => guild.roles.cache.has(roleId))
    );

    if (validRoleIds.length !== getRoleIds(configData.roles[option]).length) {
      configData.roles[option] = validRoleIds;
      changed = true;
    }
  }

  for (const [channelId] of Object.entries(configData.panelMessages)) {
    const channel = client.channels.cache.get(channelId);

    if (!channel || channel.type !== ChannelType.GuildText) {
      delete configData.panelMessages[channelId];
      changed = true;
    }
  }

  for (const channelId of Object.keys(configData.panelOptions)) {
    if (!configData.panelMessages[channelId]) {
      delete configData.panelOptions[channelId];
      changed = true;
    }
  }

  if (changed) {
    saveConfig(configData);
  }
}

async function resumeTicketState(client) {
  const refreshedTicketOwners = {};
  const refreshedTicketOpenTime = {};
  const refreshedClaims = {};
  const refreshedTicketCount = {};
  const refreshedPendingClosures = {};
  let changed = false;

  for (const [channelId, ownerId] of Object.entries(configData.ticketOwners)) {
    const channel = await client.channels.fetch(channelId).catch(() => null);

    if (!channel || channel.type !== ChannelType.GuildText) {
      changed = true;
      continue;
    }

    refreshedTicketOwners[channelId] = ownerId;
    refreshedTicketOpenTime[channelId] = configData.ticketOpenTime[channelId] || Date.now();
    refreshedTicketCount[ownerId] = Number(refreshedTicketCount[ownerId] || 0) + 1;

    if (configData.claims[channelId]) {
      refreshedClaims[channelId] = configData.claims[channelId];
    }

    if (configData.pendingClosures[channelId]) {
      refreshedPendingClosures[channelId] = configData.pendingClosures[channelId];
    }
  }

  if (JSON.stringify(refreshedTicketOwners) !== JSON.stringify(configData.ticketOwners)) changed = true;
  if (JSON.stringify(refreshedTicketOpenTime) !== JSON.stringify(configData.ticketOpenTime)) changed = true;
  if (JSON.stringify(refreshedClaims) !== JSON.stringify(configData.claims)) changed = true;
  if (JSON.stringify(refreshedTicketCount) !== JSON.stringify(configData.ticketCount)) changed = true;
  if (JSON.stringify(refreshedPendingClosures) !== JSON.stringify(configData.pendingClosures)) changed = true;

  if (changed) {
    configData.ticketOwners = refreshedTicketOwners;
    configData.ticketOpenTime = refreshedTicketOpenTime;
    configData.claims = refreshedClaims;
    configData.ticketCount = refreshedTicketCount;
    configData.pendingClosures = refreshedPendingClosures;
    saveConfig(configData);
  }

  cleanupConfigState(client);
}

/* ========================= */
function sendConfigPanel(interaction) {
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
    .setColor("#5865F2")
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
    if (interaction.isStringSelectMenu()) {
      await resetSelectMenuToPlaceholder(interaction);
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
      const choice = interaction.values[0];
      const categoryId = configData.categories[choice];
      const roleIds = getRoleIds(configData.roles[choice]);

      if (!categoryId) {
        return interaction.reply({ content: "❌ Catégorie introuvable", flags: 64 });
      }

      if (getTicketCount(interaction.user.id) >= 3) {
        return interaction.reply({ content: "❌ Max 3 tickets", flags: 64 });
      }

      const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({ content: `❌ Catégorie invalide pour l'option ${choice}`, flags: 64 });
      }

      if (roleIds.some(roleId => !interaction.guild.roles.cache.get(roleId))) {
        return interaction.reply({ content: `❌ Rôle de modération invalide pour l'option ${choice}`, flags: 64 });
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

    if (interaction.isStringSelectMenu() && interaction.customId === 'modif_select') {
      const selected = interaction.values[0];

      if (selected === 'logs') {
        return interaction.showModal(
          buildChannelIdModal('modal_edit_logs', 'Modifier logs', 'Nouvel ID salon logs')
        );
      }

      if (selected === 'stats') {
        return interaction.showModal(
          buildChannelIdModal('modal_edit_stats', 'Modifier stats', 'Nouvel ID salon stats')
        );
      }

      if (selected === 'category') {
        return interaction.showModal(
          new ModalBuilder()
            .setCustomId('modal_edit_category')
            .setTitle('Modifier catégorie')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('option_name')
                  .setLabel('Nom exact de l’option')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('category_id')
                  .setLabel('Nouvel ID catégorie')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
              )
            )
        );
      }

      if (selected === 'role') {
        return interaction.showModal(
          new ModalBuilder()
            .setCustomId('modal_edit_role')
            .setTitle('Modifier rôle')
            .addComponents(
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('option_name')
                  .setLabel('Nom exact de l’option')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(true)
              ),
              new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                  .setCustomId('roles')
                  .setLabel('Nouveaux rôles (@role ou IDs)')
                  .setStyle(TextInputStyle.Short)
                  .setRequired(false)
              )
            )
        );
      }

      return replyAndAutoDelete(interaction, {
        content: "❌ Option de modification invalide",
        flags: 64
      });
    }

    // Gestion des notes (1 à 5)
    if (interaction.customId.startsWith('rate_')) {
      const score = parseInt(interaction.customId.split('_')[1]);
      return handleRating(interaction, score);
    }

    if (interaction.customId === 'refresh_stats') {
      await interaction.deferUpdate();
      return updateStatsMessage(interaction.guild);
    }

    if (interaction.customId === 'config_logs') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_logs')
          .setTitle('Configurer logs')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('channel_id')
                .setLabel('ID salon logs')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    if (interaction.customId === 'config_stats') {
      return interaction.showModal(
        new ModalBuilder()
          .setCustomId('modal_stats')
          .setTitle('Configurer stats')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('channel_id')
                .setLabel('ID salon stats')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
            )
          )
      );
    }

    if (interaction.customId === 'create_panel') {
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
    }

    if (interaction.customId === 'claim_ticket') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      if (configData.claims[interaction.channel.id]) {
        return interaction.reply({ content: "❌ Déjà pris", flags: 64 });
      }

      configData.claims[interaction.channel.id] = interaction.user.id;
      incrementStaffStat(interaction.user.id, 'claimed');
      saveConfig(configData);

      const staffStats = getStaffStats(interaction.user.id);

      await sendLog(
        interaction.guild,
        new EmbedBuilder()
          .setTitle("🛠️ Ticket claim")
          .addFields(
            buildTicketContextFields(interaction, [
              { name: "Claims staff", value: `${staffStats.claimed}`, inline: true },
              { name: "Tickets fermés staff", value: `${staffStats.closed}`, inline: true }
            ])
          )
          .setColor("Green")
          .setTimestamp()
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("🛠️ Claim")
            .setDescription(
              `${interaction.user} a pris en charge ce ticket.\n\n` +
              "Un membre de l'équipe est désormais assigné à votre demande et reviendra vers vous dans les meilleurs délais."
            )
            .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
            .setColor("Green")
            .setFooter({ text: "Merci de patienter pendant le traitement de votre demande." })
            .setTimestamp()
        ]
      });
    }

    if (interaction.customId === 'unclaim_ticket') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const previousClaim = configData.claims[interaction.channel.id];
      delete configData.claims[interaction.channel.id];
      saveConfig(configData);

      await sendLog(
        interaction.guild,
        new EmbedBuilder()
          .setTitle("♻️ Ticket libéré")
          .addFields(
            buildTicketContextFields(interaction, [
              { name: "Claim précédent", value: previousClaim ? `<@${previousClaim}>` : "Aucun", inline: true }
            ])
          )
          .setColor("Orange")
          .setTimestamp()
      );

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle("♻️ Libéré")
            .setDescription(`${interaction.user}`)
            .setColor("Orange")
        ]
      });
    }

    if (interaction.customId === 'add_user') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

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
    }

    if (interaction.customId === 'close_ticket') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
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
    }

    if (interaction.customId === 'confirm_close_ticket') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const pendingClose = configData.pendingClosures[interaction.channel.id];
      if (!pendingClose) {
        return interaction.reply({ content: "❌ Aucune fermeture en attente", flags: 64 });
      }

      if (pendingClose.expiresAt && pendingClose.expiresAt < Date.now()) {
        delete configData.pendingClosures[interaction.channel.id];
        saveConfig(configData);
        return interaction.reply({ content: "❌ La demande de fermeture a expiré", flags: 64 });
      }

      if (pendingClose.userId !== interaction.user.id) {
        return interaction.reply({ content: "❌ Seul le modérateur ayant lancé la fermeture peut la confirmer", flags: 64 });
      }

      await interaction.reply({ content: "🔒 Fermeture...", flags: 64 });
      await interaction.channel.setName(getClosingChannelName(interaction.channel.name)).catch(() => {});

      const ownerId = configData.ticketOwners[interaction.channel.id];
      const claimedBy = configData.claims[interaction.channel.id];
      const openedAt = configData.ticketOpenTime[interaction.channel.id];
      const durationMinutes = openedAt ? Math.max(1, Math.round((Date.now() - openedAt) / 60000)) : null;

      configData.stats.closed++;

      if (ownerId) {
        setTicketCount(ownerId, getTicketCount(ownerId) - 1);
      }

      incrementStaffStat(interaction.user.id, 'closed');
      delete configData.claims[interaction.channel.id];
      delete configData.ticketOwners[interaction.channel.id];
      delete configData.ticketOpenTime[interaction.channel.id];
      delete configData.pendingClosures[interaction.channel.id];
      saveConfig(configData);
      await updateStatsMessage(interaction.guild);

      const staffStats = getStaffStats(interaction.user.id);

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
              .setColor("Red")
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
          .setColor("Red")
          .setTimestamp()
      );

      setTimeout(() => {
        interaction.channel.delete().catch(() => {});
      }, TICKET_DELETE_DELAY_MS);

      return;
    }

    if (interaction.customId === 'save_close_archive') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const pendingClose = configData.pendingClosures[interaction.channel.id];
      if (!pendingClose) {
        return interaction.reply({ content: "❌ Aucune fermeture en attente", flags: 64 });
      }

      if (pendingClose.expiresAt && pendingClose.expiresAt < Date.now()) {
        delete configData.pendingClosures[interaction.channel.id];
        saveConfig(configData);
        return interaction.reply({ content: "❌ La demande de fermeture a expiré", flags: 64 });
      }

      if (pendingClose.archiveSavedAt) {
        return interaction.reply({ content: "❌ L'archive a déjà été sauvegardée", flags: 64 });
      }

      const archiveResult = await saveTicketArchive(interaction.guild, interaction.channel, interaction.user);

      if (!archiveResult.ok) {
        return interaction.reply({ content: archiveResult.reason, flags: 64 });
      }

      pendingClose.archiveSavedAt = Date.now();
      pendingClose.archivedBy = interaction.user.id;
      saveConfig(configData);

      return interaction.reply({ content: "✅ Archive sauvegardée", flags: 64 });
    }

    if (interaction.customId === 'cancel_close_ticket') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const pendingClose = configData.pendingClosures[interaction.channel.id];
      if (!pendingClose) {
        return interaction.reply({ content: "❌ Aucune fermeture en attente", flags: 64 });
      }

      if (pendingClose.expiresAt && pendingClose.expiresAt < Date.now()) {
        delete configData.pendingClosures[interaction.channel.id];
        saveConfig(configData);
        return interaction.reply({ content: "❌ La demande de fermeture a expiré", flags: 64 });
      }

      delete configData.pendingClosures[interaction.channel.id];
      saveConfig(configData);

      return interaction.reply({ content: "❌ Fermeture annulée", flags: 64 });
    }
  } catch (err) {
    console.error("BUTTON ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({
        content: "❌ Une erreur est survenue",
        flags: 64
      }).catch(() => {});
    }
  }
}

/* ========================= */
async function handleModal(interaction) {
  try {
    if (interaction.customId === 'modal_logs') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: "❌ Salon invalide", flags: 64 });
      }

      configData.logsChannel = channelId;
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: "✅ Logs configurés", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_logs') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: "❌ Salon invalide", flags: 64 });
      }

      configData.logsChannel = channelId;
      saveConfig(configData);
      return replyAndAutoDelete(interaction, { content: "✅ Logs modifiés", flags: 64 });
    }

    if (interaction.customId === 'modal_stats') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: "❌ Salon invalide", flags: 64 });
      }

      configData.statsChannel = channelId;
      configData.statsMessageId = null;
      saveConfig(configData);
      await updateStatsMessage(interaction.guild);
      return replyAndAutoDelete(interaction, { content: "✅ Stats configurés", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_stats') {
      const channelId = interaction.fields.getTextInputValue('channel_id');
      const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);

      if (!channel || channel.type !== ChannelType.GuildText) {
        return interaction.reply({ content: "❌ Salon invalide", flags: 64 });
      }

      configData.statsChannel = channelId;
      configData.statsMessageId = null;
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
        return interaction.reply({ content: "❌ Salon invalide", flags: 64 });
      }

      if (!options.length) {
        return interaction.reply({ content: "❌ Aucune option valide", flags: 64 });
      }

      if (options.length !== categoriesInput.length) {
        return interaction.reply({ content: "❌ Le nombre d'options et de catégories doit correspondre", flags: 64 });
      }

      for (const roleId of roleIds) {
        if (!interaction.guild.roles.cache.get(roleId)) {
          return interaction.reply({ content: "❌ Rôle de modération invalide", flags: 64 });
        }
      }

      for (let index = 0; index < categoriesInput.length; index++) {
        const categoryId = categoriesInput[index];
        const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

        if (!category || category.type !== ChannelType.GuildCategory) {
          return interaction.reply({ content: `❌ Catégorie invalide pour l'option ${options[index]}`, flags: 64 });
        }
      }

      const existingPanelMessageId = configData.panelMessages[channelId];
      if (existingPanelMessageId) {
        const existingPanel = await channel.messages.fetch(existingPanelMessageId).catch(() => null);

        if (existingPanel) {
          return replyAndAutoDelete(interaction, { content: "❌ Un panel existe déjà dans ce salon", flags: 64 });
        }
      }

      options.forEach((option, index) => {
        configData.categories[option] = categoriesInput[index];
        configData.roles[option] = roleIds;
      });

      saveConfig(configData);

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Choisir une option')
        .addOptions(options.map(option => ({ label: option, value: option })));

      const panelMessage = await channel.send({
        embeds: [new EmbedBuilder().setTitle("🎫 Tickets")],
        components: [new ActionRowBuilder().addComponents(menu)]
      });

      configData.panelMessages[channelId] = panelMessage.id;
      configData.panelOptions[channelId] = options;
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: "✅ Panel créé", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_category') {
      const optionName = interaction.fields.getTextInputValue('option_name').trim();
      const categoryId = interaction.fields.getTextInputValue('category_id').trim();

      if (!configData.categories[optionName]) {
        return interaction.reply({ content: "❌ Option introuvable", flags: 64 });
      }

      const category = await interaction.guild.channels.fetch(categoryId).catch(() => null);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.reply({ content: "❌ Catégorie invalide", flags: 64 });
      }

      configData.categories[optionName] = categoryId;
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: "✅ Catégorie modifiée", flags: 64 });
    }

    if (interaction.customId === 'modal_edit_role') {
      const optionName = interaction.fields.getTextInputValue('option_name').trim();
      const rolesInput = interaction.fields.getTextInputValue('roles') || "";
      const roleIds = parseRoleIds(rolesInput);

      if (!configData.categories[optionName]) {
        return interaction.reply({ content: "❌ Option introuvable", flags: 64 });
      }

      for (const roleId of roleIds) {
        if (!interaction.guild.roles.cache.get(roleId)) {
          return interaction.reply({ content: "❌ Rôle de modération invalide", flags: 64 });
        }
      }

      configData.roles[optionName] = roleIds;
      saveConfig(configData);

      return replyAndAutoDelete(interaction, { content: "✅ Rôle modifié", flags: 64 });
    }

    if (interaction.customId === 'modal_ticket_opening') {
      const pendingCreation = pendingTicketCreations.get(interaction.user.id);

      if (!pendingCreation) {
        return interaction.reply({ content: "❌ Aucune création de ticket en attente", flags: 64 });
      }

      pendingTicketCreations.delete(interaction.user.id);
      const openingReason = interaction.fields.getTextInputValue('opening_reason').trim();

      return createTicketFromChoice(interaction, pendingCreation.choice, openingReason);
    }

    if (interaction.customId === 'modal_add_user') {
      if (!(await ensureBotPermissions(interaction))) {
        return;
      }

      const id = interaction.fields.getTextInputValue('user_id').trim();
      const member = await interaction.guild.members.fetch(id).catch(() => null);

      if (!member) {
        return interaction.reply({ content: "❌ Utilisateur invalide", flags: 64 });
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
            .setColor("Blue")
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
          .setColor("Blue")
          .setTimestamp()
      );

      return interaction.reply({ content: "✅ Ajouté", flags: 64 });
    }

    if (interaction.customId === 'modal_close_ticket') {
      if (!canManageTicket(interaction)) {
        return interaction.reply({ content: "❌ Tu n'es pas autorisé à gérer ce ticket", flags: 64 });
      }

      const reason = interaction.fields.getTextInputValue('close_reason').trim();
      configData.pendingClosures[interaction.channel.id] = {
        userId: interaction.user.id,
        reason,
        expiresAt: Date.now() + PENDING_CLOSE_EXPIRE_MS
      };
      saveConfig(configData);

      return interaction.reply({
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
            .setColor("Red")
            .setTimestamp()
        ],
        components: [buildCloseConfirmRow()]
      });
    }
  } catch (err) {
    console.error("MODAL ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({
        content: "❌ Une erreur est survenue",
        flags: 64
      }).catch(() => {});
    }
  }
}

/* ========================= */
async function handleMessage() {}

async function handleMessageDelete(message) {
  try {
    if (message.partial) {
      await message.fetch().catch(() => null);
    }

    const panelEntry = Object.entries(configData.panelMessages).find(([, messageId]) => messageId === message.id);

    if (!panelEntry) return;

    const [channelId] = panelEntry;
    const optionNames = Array.isArray(configData.panelOptions[channelId]) ? configData.panelOptions[channelId] : [];

    delete configData.panelMessages[channelId];

    for (const optionName of optionNames) {
      delete configData.categories[optionName];
      delete configData.roles[optionName];
    }

    delete configData.panelOptions[channelId];
    saveConfig(configData);
  } catch (err) {
    console.error("MESSAGE DELETE ERROR:", err);
  }
}

async function sendEditConfigPanel(interaction) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId('modif_select')
    .setPlaceholder('Que veux-tu modifier ?')
    .addOptions([
      { label: 'Logs', value: 'logs', description: 'Modifier le salon des logs', emoji: '📝' },
      { label: 'Catégorie', value: 'category', description: 'Modifier la catégorie d’une option', emoji: '📂' },
      { label: 'Rôle', value: 'role', description: 'Modifier le rôle de modération d’une option', emoji: '🛡️' },
      { label: 'Stats', value: 'stats', description: 'Modifier le salon des statistiques', emoji: '📊' }
    ]);

  const embed = new EmbedBuilder()
    .setTitle("⚙️ Modification de la configuration")
    .setDescription(
      "Utilise le menu ci-dessous pour modifier un élément précis du système de tickets.\n\n" +
      "📝 **Logs** → Modifier le salon des logs\n" +
      "📂 **Catégorie** → Modifier la catégorie liée à une option\n" +
      "🛡️ **Rôle** → Modifier le rôle de modération lié à une option\n" +
      "📊 **Stats** → Modifier le salon des statistiques\n\n" +
      "_Choisis l’élément que tu souhaites mettre à jour._"
    )
    .setColor("#5865F2")
    .setFooter({ text: "Système de tickets Discord" })
    .setTimestamp();

  await interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(menu)],
    flags: 64
  });

  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, CONFIG_MESSAGE_DELETE_DELAY_MS);
}

module.exports = {
  sendConfigPanel,
  sendEditConfigPanel,
  handleButtons,
  handleModal,
  handleMessage,
  handleMessageDelete,
  updateStatsMessage,
  showStaffStats,
  resumeTicketState
};
