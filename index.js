const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder
} = require('discord.js');

const {
  sendConfigPanel,
  handleButtons,
  handleModal,
  handleMessage,
  handleMessageDelete,
  updateStatsMessage,
  showStaffStats,
  resumeTicketState
} = require('./Systems/configsystem');
const { deployCommands } = require('./deploy-commands');

require('dotenv').config();
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

/* ========================= */
// READY

client.once('clientReady', async () => {
  console.log('Bot connecte :', client.user.tag);

  if (process.env.CLIENT_ID) {
    try {
      await deployCommands();
    } catch (error) {
      console.error('❌ ECHEC DEPLOIEMENT COMMANDES AU DEMARRAGE:', error);
    }
  } else {
    console.warn('⚠️ CLIENT_ID absent: deploiement des commandes ignore.');
  }

  await resumeTicketState(client);
});

/* ========================= */
// INTERACTIONS

client.on('interactionCreate', async interaction => {
  try {
    console.log('⚡ Interaction reçue :', interaction.type, interaction.isChatInputCommand() ? interaction.commandName : 'non-command');

    /* ===== COMMANDES ===== */
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'maintenance') {
        return interaction.reply({
          content: "❌ Cette commande est désactivée.",
          flags: 64
        });
      }

      if (interaction.commandName === 'config_ticket') {
        return sendConfigPanel(interaction);
      }

      if (interaction.commandName === 'stats') {
        await updateStatsMessage(interaction.guild);
        return interaction.reply({
          content: "📊 Stats mises à jour",
          flags: 64
        });
      }

      if (interaction.commandName === 'staff_stats') {
        return showStaffStats(interaction);
      }

      if (interaction.commandName === 'modif_config_ticket') {

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

        return;
      }
    }

    /* ===== BUTTON / SELECT ===== */
    if (interaction.isButton() || interaction.isStringSelectMenu()) {
      return handleButtons(interaction);
    }

    /* ===== MODAL ===== */
    if (interaction.isModalSubmit()) {
      return handleModal(interaction);
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
    await handleMessage(message);
  } catch (err) {
    console.error("❌ MESSAGE ERROR:", err);
  }
});

client.on('messageDelete', async message => {
  try {
    await handleMessageDelete(message);
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





