// Bot Discord - Ticket System
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { Client, GatewayIntentBits, Partials, Events, PermissionsBitField, AttachmentBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

console.log('🚀 [index.js] Loading version 2.9.17');

const configSystem = require('./Systems/configsystem');
const LiveSystem = require('./Systems/livesystem');
const LogSystem = require('./Systems/logsystem');
const EntranceSystem = require('./Systems/entrancesystem');
const VerificationSystem = require('./Systems/verificationsystem');
const XPSystem = require('./Systems/xpsystem');
const AntiRaidSystem = require('./Systems/antiraid');
const AntiSpamSystem = require('./Systems/antispam');
const DmLockSystem = require('./Systems/dmlock');
const AISystem = require('./Systems/aisystem');

const { commands, deployCommands } = require('./deploy-commands');

require('dotenv').config();

console.log('🚀 Lancement du bot en cours...');

// Serveur de maintien en vie pour Replit (24/7)
const server = http.createServer((req, res) => {
  // Route pour servir les images (assets)
  if (req.url.startsWith('/assets/')) {
    const urlPath = decodeURIComponent(req.url.split('?')[0]); // On retire le paramètre de version ?v=...
    const filePath = path.normalize(path.join(__dirname, 'Data', urlPath.substring(1)));
    const assetsRoot = path.join(__dirname, 'Data', 'assets');

    const relativeAssetPath = path.relative(assetsRoot, filePath);
    if (relativeAssetPath.startsWith('..') || path.isAbsolute(relativeAssetPath)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('Forbidden');
    }
    
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const fileBuffer = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'application/octet-stream';

      if (ext === '.png' || fileBuffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) {
        contentType = 'image/png';
      } else if (['.jpg', '.jpeg'].includes(ext) || (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8 && fileBuffer[2] === 0xFF)) {
        contentType = 'image/jpeg';
      } else if (ext === '.gif' || fileBuffer.subarray(0, 3).toString() === 'GIF') {
        contentType = 'image/gif';
      } else if (ext === '.webp' || fileBuffer.subarray(8, 12).toString() === 'WEBP') {
        contentType = 'image/webp';
      }

      console.log(`🖼️ [HTTP] Service de l'image : ${urlPath} (${contentType})`);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable'
      });
      return res.end(fileBuffer);
    } else {
      console.warn(`⚠️ [HTTP] Image non trouvée : ${filePath}`);
    }
  }

  res.writeHead(200, { 'Content-Type': 'text/plain' });
  // Petit log pour confirmer le ping d'UptimeRobot dans la console
  console.log(`📶 Ping reçu d'UptimeRobot à ${new Date().toLocaleTimeString()}`);
  const uptime = Math.floor(process.uptime());
  console.log(`DEBUG: REPL_SLUG = ${process.env.REPL_SLUG}`);
  console.log(`DEBUG: REPL_OWNER = ${process.env.REPL_OWNER}`);
  const minutes = Math.floor(uptime / 60);
  const hours = Math.floor(minutes / 60);
  
  res.write(`U-Bot System
-------------------
Statut : Connecte (OK)
Sync : Bot synchronise
Uptime : ${hours}h ${minutes % 60}m ${uptime % 60}s`);
  res.end();
});

server.listen(8080, () => {
  console.log('🌐 Serveur HTTP prêt sur le port 8080');
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('❌ CRITICAL: Le port 8080 est déjà utilisé. Une autre instance du bot est probablement en cours d\'exécution.');
    process.exit(1); // On arrête cette instance pour éviter les doublons
  } else {
    console.error('❌ Erreur serveur HTTP:', err);
  }
});

const CONFIG_MESSAGE_DELETE_DELAY_MS = 3 * 60 * 1000;

/* ========================= */
// CLIENT

const client = new Client({ // Ligne 71
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildInvites // Nécessaire pour l'Anti-Raid Pro
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.commands = new Map();
client.configSystem = configSystem;

try {
  client.logSystem = new LogSystem(client);
  client.entranceSystem = new EntranceSystem(client);
  client.xpSystem = new XPSystem(client);
  client.liveSystem = new LiveSystem(client);
  client.antiRaid = new AntiRaidSystem(client);
  client.antiSpam = new AntiSpamSystem(client); // Correction: AntiSpamSystem était mal importé
  client.verification = new VerificationSystem(client);
  client.dmLock = new DmLockSystem(client);
  client.aiSystem = new AISystem(client);
} catch (err) {
  console.error('❌ Erreur lors de l\'initialisation des systèmes:', err);
}

/* ========================= */
// READY

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot en ligne : ${client.user.tag}`);
  console.log(`🌍 Serveur(s) : ${client.guilds.cache.size}`);
  console.log(`📋 Total des commandes configurées : ${commands.length}`);

  try {
    if (client.configSystem && typeof client.configSystem.resumeTicketState === 'function') {
      for (const guild of client.guilds.cache.values()) {
        client.configSystem.getGuildConfig(guild.id);
      }

      await client.configSystem.resumeTicketState(client);
      if (typeof client.configSystem.cleanupLegacyTicketPanels === 'function') {
        const deletedPanels = await client.configSystem.cleanupLegacyTicketPanels(client);
        if (deletedPanels > 0) {
          console.log(`🧹 ${deletedPanels} ancien(s) panel(s) ticket supprimé(s).`);
        }
      }
      if (typeof client.configSystem.refreshActiveTicketControls === 'function') {
        const updatedTickets = await client.configSystem.refreshActiveTicketControls(client);
        if (updatedTickets > 0) {
          console.log(`🧩 ${updatedTickets} ticket(s) actif(s) mis à jour avec les nouveaux boutons.`);
        }
      }
    } else {
      console.warn("⚠️ resumeTicketState n'est pas encore disponible (chargement...)");
    }
  } catch (err) {
    console.error("❌ CRITICAL: Échec de la restauration des tickets :", err.message);
  }

  // Vérification initiale des lives au démarrage
  if (client.liveSystem) {
    client.liveSystem.checkAllLives().catch(err => console.error("❌ Erreur check live initial:", err));
  }

  // Déploiement automatique des commandes au démarrage. Désactivable avec AUTO_DEPLOY=false.
  if (process.env.AUTO_DEPLOY !== 'false') {
    await deployCommands().catch(console.error);
  }
});

/* ========================= */
// INTERACTIONS

client.on('interactionCreate', async interaction => {
  try {
    const isCommand = interaction.isChatInputCommand();
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
        const type = interaction.isButton() ? 'Bouton' : 'Menu';
        console.log(`🔘 ${type} cliqué : ${interaction.customId}`);
    }

    /* ===== COMMANDES ===== */
    if (interaction.isChatInputCommand()) {
      // Liste des commandes nécessitant des permissions Administrateur
      const adminCommands = ['config_ticket', 'modif_config_ticket', 'config_live', 'modif_config_live', 'test_live', 'config_protection', 'set_config', 'help'];
      console.log(`⚡ Command: /${interaction.commandName} by ${interaction.user.tag}`);
      
      if (adminCommands.includes(interaction.commandName)) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          await interaction.reply({
            content: "❌ Vous n'avez pas les permissions (Administrateur) pour utiliser cette commande.",
            flags: 64
          });
          return setTimeout(() => interaction.deleteReply().catch(() => {}), 300000);
        }
      }

      if (interaction.commandName === 'help') {
        return client.configSystem.sendHelpPanel(interaction);
      }

      if (interaction.commandName === 'config_protection') {
        return client.configSystem.sendProtectionConfigPanel(interaction);
      }

      if (interaction.commandName === 'set_logs') {
        return client.configSystem.sendLogsConfigPanel(interaction);
      }

      if (interaction.commandName === 'set_entrée') {
        return client.configSystem.sendEntranceConfigPanel(interaction);
      }

      if (interaction.commandName === 'set_xp') {
        return client.configSystem.sendXPConfigPanel(interaction);
      }

      if (interaction.commandName === 'set_ia') {
        return client.configSystem.sendAIConfigPanel(interaction);
      }

      if (interaction.commandName === 'annonce') {
        // Ouvre le modal pour la création d'annonce
        return client.aiSystem.showAnnouncementModal(interaction);
      }

      if (interaction.commandName === 'rank') {
        const member = interaction.options.getMember('membre') || interaction.member;
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        const buffer = await client.xpSystem.generateProfileCard(member, guildConfig);
        if (!buffer) return interaction.reply({ content: "❌ Impossible de générer la carte (Canvas manquant).", flags: 64 });
        const attachment = new AttachmentBuilder(buffer, { name: 'rank.png' });
        return interaction.reply({ files: [attachment] });
      }

      if (interaction.commandName === 'leaderboard') {
        const payload = await client.xpSystem.getLeaderboardPayload(interaction.guild);
        return interaction.reply(payload);
      }

      if (interaction.commandName === 'config_ticket') {
        return client.configSystem.sendConfigPanel(interaction);
      }

      if (interaction.commandName === 'modif_config_ticket') {
        return client.configSystem.sendEditConfigPanel(interaction);
      }

      if (interaction.commandName === 'set_config') {
        const guild = interaction.guild;
        if (!guild) return;

        if (interaction.user.id !== guild.ownerId) {
          return await interaction.reply({
            content: "❌ Seul le propriétaire (Fonda) du serveur peut utiliser cette commande.",
            flags: 64
          });
        }
        return await client.configSystem.sendBotNamePanel(interaction);
      }

      if (interaction.commandName === 'config_live') {
        return client.configSystem.sendLiveConfigPanel(interaction);
      }

      if (interaction.commandName === 'modif_config_live') {
        return client.configSystem.sendLiveEditList(interaction);
      }

      if (interaction.commandName === 'test_live') {
        await interaction.deferReply({ flags: 64 });
        const platform = interaction.options.getString('plateforme');
        const url = interaction.options.getString('url');
        const salon = interaction.options.getChannel('salon');
        const text = interaction.options.getString('message') || "Ceci est un test de notification live !";
        const role = interaction.options.getRole('role');

        const testLiveObj = {
          platform,
          url,
          text,
          channelId: salon.id,
          roleId: role ? role.id : null,
          isLive: false,
          lastMessageId: null
        };

        if (client.liveSystem) {
          await client.liveSystem.sendLiveNotification(interaction.guild, testLiveObj, "🔴 TITRE DE LIVE AUTOMATIQUE (TEST)");
          return await interaction.editReply({ content: `✅ Notification de test envoyée dans <#${salon.id}> !` });
        } else {
          return await interaction.editReply({ content: "❌ Système Live non initialisé." });
        }
      }
    }

    /* ===== BUTTON / SELECT ===== */
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      // On délègue TOUTE la gestion des boutons au ConfigSystem pour éviter les doubles exécutions
      return await client.configSystem.handleButtons(interaction);
    }

    /* ===== MODAL ===== */
    if (interaction.isModalSubmit()) {
      if (interaction.customId.startsWith('modal_live_config_')) {
        const platform = interaction.customId.replace('modal_live_config_', '');
        return client.configSystem.saveLiveConfig(interaction, platform);
      }
      if (interaction.customId === 'modal_antiraid_settings') {
        return client.configSystem.saveAntiRaidConfig(interaction);
      }
      if (interaction.customId === 'modal_antispam_settings') {
        return client.configSystem.saveAntiSpamConfig(interaction);
      }
      if (interaction.customId === 'modal_verification_settings') {
        return client.configSystem.saveVerificationConfig(interaction);
      }
      if (interaction.customId === 'modal_verify_code') {
        return client.verification.handleModalSubmit(interaction);
      }
      if (interaction.customId === 'modal_ai_channel') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        guildConfig.ai.aiChannel = interaction.fields.getTextInputValue('channel_id').trim();
        client.configSystem.saveConfig(client.configSystem.getFullConfig());
        return client.configSystem.sendAIConfigPanel(interaction);
      }
      if (interaction.customId === 'modal_create_announcement') {
        // Gère la soumission du modal d'annonce
        return client.aiSystem.handleAnnouncementModalSubmit(interaction);
      }

      return await client.configSystem.handleModal(interaction);
    }

  } catch (err) {
    console.error("❌ INTERACTION ERROR:", err);

    // On ne répond pas par une erreur si l'interaction a déjà été traitée (évite le spam d'erreurs inutiles)
    if (err.code === 40060 || err.message?.includes('already been acknowledged')) return;
  }
});

/* ========================= */
// MESSAGES

client.on('messageCreate', async message => {
  try {
    if (await client.configSystem.handleMessage(message)) return;
    await client.xpSystem?.handleMessage(message);
    await client.aiSystem?.handleMessage(message);
    if (client.antiSpam) {
      await client.antiSpam.handleMessage(message);
    }
  } catch (err) {
    console.error("❌ MESSAGE ERROR:", err);
  }
});

client.on('messageDelete', message => client.logSystem?.handleMessageDelete(message));
client.on('messageUpdate', (oldM, newM) => client.logSystem?.handleMessageUpdate(oldM, newM));

client.on(Events.GuildMemberAdd, async member => {
  try {
    client.entranceSystem?.handleMemberJoin(member);
    client.logSystem?.handleMemberJoin(member);
    if (client.antiRaid) {
      await client.antiRaid.handleMemberJoin(member);
    }
    if (client.dmLock) {
      await client.dmLock.handleMemberJoin(member);
    }
  } catch (err) {
    console.error("❌ GUILD MEMBER ADD ERROR:", err);
  }
});

client.on(Events.GuildMemberRemove, member => {
    client.entranceSystem?.handleMemberRemove(member);
    client.logSystem?.handleMemberRemove(member);
});

client.on(Events.GuildBanAdd, ban => client.logSystem?.handleGuildBan(ban));
client.on(Events.GuildMemberUpdate, (oldM, newM) => client.logSystem?.handleMemberUpdate(oldM, newM));
client.on(Events.ChannelUpdate, (oldC, newC) => client.logSystem?.handleChannelUpdate(oldC, newC));

// Audit Logs Handler
client.on(Events.GuildAuditLogEntryCreate, (entry, guild) => {
    client.logSystem?.handleAuditLogEntry(entry, guild);
});

// Tracking des invitations pour l'Anti-Raid
client.on(Events.InviteCreate, async invite => {
    if (client.antiRaid) {
        const guildInvites = client.antiRaid.invitesCache.get(invite.guild.id) || new Map();
        guildInvites.set(invite.code, invite.uses);
        client.antiRaid.invitesCache.set(invite.guild.id, guildInvites);
    }
});

client.on(Events.InviteDelete, async invite => {
    if (client.antiRaid) {
        client.antiRaid.invitesCache.get(invite.guild.id)?.delete(invite.code);
    }
});

/* ========================= */
// ANTI-CRASH GLOBAL

process.on('unhandledRejection', err => {
  console.error("UNHANDLED REJECTION:", err);
});

process.on('uncaughtException', err => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

// CLEANUP
process.on('SIGINT', () => {
  console.log('\n🛑 Arrêt du bot demandé...');
  server.close();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du bot demandé...');
  server.close();
  client.destroy();
  process.exit(0);
});

// Maintien en vie du processus pour éviter l'exit code 0 sur Replit
setInterval(() => {}, 1000 * 60 * 60);

/* ========================= */
// LOGIN

console.log('⚙️ Connexion a Discord en cours...');
const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
client.login(token).catch(err => console.error("❌ ECHEC LOGIN:", err));
