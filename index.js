// Bot Discord - Ticket System
const http = require('http');
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

const { deployCommands } = require('./deploy-commands');

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
Sync : Bot synchronise et a jour
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
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel, Partials.Message]
});

client.commands = new Map();
client.configSystem = configSystem;

console.log('📡 Initialisation du serveur HTTP sur le port 8080...');

try {
  client.maintenance = new MaintenanceSystem(client);
} catch (err) {
  console.error('❌ Erreur lors de l\'initialisation de la maintenance:', err);
}

/* ========================= */
// READY

client.once(Events.ClientReady, async () => {
  console.log(`✅ Bot en ligne : ${client.user.tag}`);
  console.log(`🌍 Serveur(s) : ${client.guilds.cache.size}`);

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
      const adminCommands = ['maintenance', 'config_ticket', 'modif_config_ticket', 'stats', 'set_config'];
      
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
client.login(process.env.TOKEN).catch(err => console.error("❌ ECHEC LOGIN:", err));
