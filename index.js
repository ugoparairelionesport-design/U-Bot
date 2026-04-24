const http = require('http');
const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  PermissionsBitField
} = require('discord.js');

const configSystem = require('./Systems/configsystem');
const MaintenanceSystem = require('./Systems/maintenance');

const { deployCommands } = require('./deploy-commands');

require('dotenv').config();

// Serveur de maintien en vie pour Replit (24/7)
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.write("Bot is running!");
  res.end();
}).listen(8080);

const CONFIG_MESSAGE_DELETE_DELAY_MS = 3 * 60 * 1000;

/* ========================= */
// CLIENT

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.commands = new Map();
client.configSystem = configSystem;
client.maintenance = null;

/* ========================= */
// READY

client.once('clientReady', async () => {
  console.log('Bot connecte :', client.user.tag);

  client.maintenance = new MaintenanceSystem(client);

  if (process.env.CLIENT_ID) {
    try {
      await deployCommands();
    } catch (error) {
      console.error('❌ ECHEC DEPLOIEMENT COMMANDES AU DEMARRAGE:', error);
    }
  } else {
    console.warn('⚠️ CLIENT_ID absent: deploiement des commandes ignore.');
  }

  await client.configSystem.resumeTicketState(client);
});

/* ========================= */
// INTERACTIONS

client.on('interactionCreate', async interaction => {
  try {
    console.log('⚡ Interaction reçue :', interaction.type, interaction.isChatInputCommand() ? interaction.commandName : 'non-command');

    /* ===== COMMANDES ===== */
    if (interaction.isChatInputCommand()) {
      // Liste des commandes nécessitant des permissions Administrateur
      const adminCommands = ['maintenance', 'config_ticket', 'modif_config_ticket', 'stats'];
      
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
          return interaction.reply({
            content: "❌ Système de maintenance non initialisé.",
            flags: 64
          });
        }
      }

      if (interaction.commandName === 'config_ticket') {
        return client.configSystem.sendConfigPanel(interaction);
      }

      if (interaction.commandName === 'stats') {
        await client.configSystem.updateStatsMessage(interaction.guild);
        return interaction.reply({
          content: "📊 Stats mises à jour",
          flags: 64
        });
      }

      if (interaction.commandName === 'staff_stats') {
        return client.configSystem.showStaffStats(interaction);
      }

      if (interaction.commandName === 'modif_config_ticket') {
        return client.configSystem.sendEditConfigPanel(interaction);
      }
    }

    /* ===== BUTTON / SELECT ===== */
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      // On vérifie d'abord si c'est un bouton du système de maintenance
      if (interaction.customId.startsWith('maintenance_') && client.maintenance) {
        return client.maintenance.handleButton(interaction);
      }
      return client.configSystem.handleButtons(interaction);
    }

    /* ===== MODAL ===== */
    if (interaction.isModalSubmit()) {
      return client.configSystem.handleModal(interaction);
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
  } catch (err) {
    console.error("❌ MESSAGE ERROR:", err);
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
  client.destroy();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Arrêt du bot demandé...');
  client.destroy();
  process.exit(0);
});

/* ========================= */
// LOGIN

client.login(process.env.TOKEN);
