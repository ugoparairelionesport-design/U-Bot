// Bot Discord - Ticket System
const http = require('http');
console.log('🚀 [index.js] Loading version 2.2.7...');
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField,
  Events
} = require('discord.js');

const configSystem = require('./Systems/configsystem');
const MaintenanceSystem = require('./Systems/maintenance');
const LiveSystem = require('./Systems/livesystem');
const AntiRaidSystem = require('./Systems/antiraid');
const AntiSpamSystem = require('./Systems/antispam');
const VerificationSystem = require('./Systems/verificationsystem');
const DmLockSystem = require('./Systems/dmlock');

const { commands, deployCommands } = require('./deploy-commands');

require('dotenv').config();

console.log('🚀 Lancement du bot en cours...');

// Serveur de maintien en vie pour Replit (24/7)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  // Petit log pour confirmer le ping d'UptimeRobot dans la console
  console.log(`📶 Ping reçu d'UptimeRobot à ${new Date().toLocaleTimeString()}`);
  const uptime = Math.floor(process.uptime());
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
    console.warn('⚠️ Port 8080 déjà utilisé. Le bot continue sans démarrer un nouveau serveur HTTP.');
  } else {
    console.error('❌ Erreur serveur HTTP:', err);
  }
});

const CONFIG_MESSAGE_DELETE_DELAY_MS = 3 * 60 * 1000;

/* ========================= */
// CLIENT

const client = new Client({
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

// Initialisation de la maintenance AVANT tout le reste (important pour le redémarrage rapide)
try {
  client.maintenance = new MaintenanceSystem(client);
  client.liveSystem = new LiveSystem(client);
  client.antiRaid = new AntiRaidSystem(client);
  client.antiSpam = new AntiSpamSystem(client);
  client.verification = new VerificationSystem(client);
  client.dmLock = new DmLockSystem(client);
} catch (err) {
  console.error('❌ Erreur lors de l\'initialisation de la maintenance:', err);
}

/* ========================= */
// READY

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot en ligne : ${client.user.tag}`);
  console.log(`🌍 Serveur(s) : ${client.guilds.cache.size}`);
  console.log(`📋 Total des commandes configurées : ${commands.length}`);

  try {
    if (client.configSystem && typeof client.configSystem.resumeTicketState === 'function') {
      await client.configSystem.resumeTicketState(client);
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

  // Déploiement automatique des commandes au démarrage si nécessaire
  if (process.env.AUTO_DEPLOY === 'true') {
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
      const adminCommands = ['maintenance', 'config_ticket', 'modif_config_ticket', 'stats', 'config_live', 'modif_config_live', 'test_live', 'staff_stats', 'config_protection', 'set_config'];
      console.log(`⚡ Command: /${interaction.commandName} by ${interaction.user.tag}`);
      
      if (adminCommands.includes(interaction.commandName)) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return interaction.reply({
            content: "❌ Vous n'avez pas les permissions (Administrateur) pour utiliser cette commande.",
            flags: 64
          });
        }
      }

      if (interaction.commandName === 'maintenance') {
        if (client.maintenance) {
          return client.maintenance.handleMaintenanceCommand(interaction);
        } else {
          return await interaction.reply({
            content: "❌ Système de maintenance non initialisé.",
            flags: 64
          });
        }
      }

      if (interaction.commandName === 'config_protection') {
        return client.configSystem.sendProtectionConfigPanel(interaction);
      }

      if (interaction.commandName === 'config_ticket') {
        return client.configSystem.sendConfigPanel(interaction);
      }

      if (interaction.commandName === 'stats') {
        await interaction.deferReply({ flags: 64 });
        await client.configSystem.updateStatsMessage(interaction.guild);
        return interaction.editReply({
          content: "📊 Stats mises à jour",
        });
      }

      if (interaction.commandName === 'staff_stats') {
        return client.configSystem.showStaffStats(interaction);
      }

      if (interaction.commandName === 'modif_config_ticket') {
        return client.configSystem.sendEditConfigPanel(interaction);
      }

      if (interaction.commandName === 'set_config') {
        const guild = interaction.guild;
        if (!guild) return;

        // On récupère l'ID du propriétaire de manière sécurisée
        const ownerId = guild.ownerId || (await guild.fetch().catch(() => ({}))).ownerId;

        if (interaction.user.id !== ownerId) {
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
      if (interaction.customId.startsWith('maintenance_') && client.maintenance) {
        return await client.maintenance.handleButton(interaction);
      }
      
      if (interaction.customId === 'prot_hub_back') {
        return client.configSystem.sendProtectionConfigPanel(interaction);
      }

      if (interaction.customId === 'prot_hub_antiraid') {
        return client.configSystem.sendAntiRaidConfigPanel(interaction);
      }

      if (interaction.customId === 'prot_hub_antispam') {
        return client.configSystem.sendAntiSpamConfigPanel(interaction);
      }

      if (interaction.customId === 'prot_hub_captcha') {
        return client.configSystem.sendVerificationConfigPanel(interaction);
      }

      if (interaction.customId === 'prot_hub_dmlock') {
        return client.configSystem.sendDmLockConfigPanel(interaction);
      }

      if (interaction.customId.startsWith('live_config_')) {
        const platform = interaction.customId.replace('live_config_', '');
        return interaction.showModal(client.configSystem.buildLiveConfigModal(platform));
      }

      if (interaction.customId === 'live_edit_select') {
        const url = interaction.values[0];
        return client.configSystem.handleLiveEditSelect(interaction, url);
      }

      if (interaction.customId.startsWith('live_btn_edit_')) {
        const url = interaction.customId.replace('live_btn_edit_', '');
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        const live = guildConfig.liveConfigs.find(l => l.url === url);
        if (!live) return interaction.reply({ content: "❌ Configuration introuvable.", flags: 64 });
        return interaction.showModal(client.configSystem.buildLiveConfigModal(live.platform, live));
      }

      if (interaction.customId.startsWith('live_btn_del_')) {
        const url = interaction.customId.replace('live_btn_del_', '');
        return client.configSystem.handleLiveDelete(interaction, url);
      }

      if (interaction.customId === 'antiraid_toggle_status') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        guildConfig.antiRaid.enabled = !guildConfig.antiRaid.enabled;
        client.configSystem.saveConfig(client.configSystem.getFullConfig());
        return client.configSystem.sendAntiRaidConfigPanel(interaction);
      }

      if (interaction.customId === 'antiraid_setup') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        return interaction.showModal(client.configSystem.buildAntiRaidModal(guildConfig.antiRaid));
      }

      if (interaction.customId === 'antiraid_toggle_lockdown') {
        if (client.antiRaid) {
          await client.antiRaid.toggleLockdown(interaction);
          return;
        }
      }

      if (interaction.customId === 'antispam_toggle_status') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        guildConfig.antiSpam.enabled = !guildConfig.antiSpam.enabled;
        client.configSystem.saveConfig(client.configSystem.getFullConfig());
        return client.configSystem.sendAntiSpamConfigPanel(interaction);
      }

      if (interaction.customId === 'antispam_setup') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        return interaction.showModal(client.configSystem.buildAntiSpamModal(guildConfig.antiSpam));
      }

      if (interaction.customId === 'antispam_action_select') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        guildConfig.antiSpam.action = interaction.values[0];
        client.configSystem.saveConfig(client.configSystem.getFullConfig());
        return client.configSystem.sendAntiSpamConfigPanel(interaction);
      }

      if (interaction.customId === 'verify_toggle_status') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        guildConfig.verification.enabled = !guildConfig.verification.enabled;
        client.configSystem.saveConfig(client.configSystem.getFullConfig());
        return client.configSystem.sendVerificationConfigPanel(interaction);
      }

      if (interaction.customId === 'verify_setup') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        return interaction.showModal(client.configSystem.buildVerificationModal(guildConfig.verification));
      }

      if (interaction.customId === 'verify_send_panel') {
        return client.configSystem.sendUserVerificationPanel(interaction);
      }

      if (interaction.customId === 'verify_start') {
        return client.verification.handleVerifyButtonClick(interaction);
      }

      if (interaction.customId === 'verify_enter_code') {
        return client.verification.showCodeModal(interaction);
      }

      if (interaction.customId === 'dmlock_toggle_status') {
        const guildConfig = client.configSystem.getGuildConfig(interaction.guildId);
        guildConfig.dmLock.enabled = !guildConfig.dmLock.enabled;
        client.configSystem.saveConfig(client.configSystem.getFullConfig());
        return client.configSystem.sendDmLockConfigPanel(interaction);
      }

      if (interaction.customId === 'dmlock_send_panel') {
        return client.configSystem.sendUserDmSafetyPanel(interaction);
      }

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
      return await client.configSystem.handleModal(interaction);
    }

  } catch (err) {
    console.error("❌ INTERACTION ERROR:", err);

    if (!interaction.replied && !interaction.deferred) {
      interaction.reply({
        content: "❌ Une erreur est survenue",
        flags: 64
      }).catch(() => {});
    }
  }
});

/* ========================= */
// MESSAGES

client.on('messageCreate', async message => {
  try {
    await client.configSystem.handleMessage(message);
    if (client.antiSpam) {
      await client.antiSpam.handleMessage(message);
    }
  } catch (err) {
    console.error("❌ MESSAGE ERROR:", err);
  }
});

client.on(Events.GuildMemberAdd, async member => {
  try {
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

client.on('messageDelete', async message => {
  try {
    await client.configSystem.handleMessageDelete(message);
  } catch (err) {
    console.error("❌ MESSAGE DELETE ERROR:", err);
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
  if (client.maintenance) client.maintenance.cleanup();
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du bot demandé...');
  server.close();
  if (client.maintenance) client.maintenance.cleanup();
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
