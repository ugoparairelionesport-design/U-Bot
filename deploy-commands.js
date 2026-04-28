const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const commands = [
  new SlashCommandBuilder()
    .setName('config_ticket')
    .setDescription('Ouvrir le panel de configuration'),

  new SlashCommandBuilder()
    .setName('modif_config_ticket')
    .setDescription('Modifier la configuration'),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Mettre a jour le panneau de statistiques'),

  new SlashCommandBuilder()
    .setName('staff_stats')
    .setDescription('Afficher les statistiques du staff tickets'),

  new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Ouvrir le panneau de maintenance (Admin uniquement)'),

  new SlashCommandBuilder()
    .setName('set_config')
    .setDescription('Personnaliser le bot sur ce serveur (nom, etc.)')
].map(cmd => cmd.toJSON());

async function deployCommands() {
  const token = process.env.DISCORD_TOKEN || process.env.TOKEN;
  const clientId = process.env.CLIENT_ID;

  if (!token || !clientId) {
    console.error('❌ Erreur: TOKEN (ou DISCORD_TOKEN) ou CLIENT_ID manquant dans les Secrets/Env');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(token);

  try {
    console.log('Deployement des commandes...');
    console.log(`Nombre de commandes: ${commands.length}`);
    console.log(`Token present: ${!!token}`);
    console.log(`Client ID: ${clientId}`);

    // Note: Pour que le bot apparaisse dans la liste des membres, 
    // assurez-vous d'utiliser le scope 'bot' lors de l'invitation.
    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    if (process.env.GUILD_ID) {
      console.log(`Deployement des commandes dans le serveur ${process.env.GUILD_ID}`);
    } else {
      console.log('Deployement des commandes globales');
    }

    const result = await rest.put(route, { body: commands });

    console.log(`Commandes deployees avec succes: ${result.length}`);
    return result;
  } catch (error) {
    console.error('Erreur lors du deployement des commandes:');
    console.error('Type:', error.constructor.name);
    console.error('Message:', error.message);

    if (error.code) console.error('Code Discord:', error.code);
    if (error.status) console.error('Status HTTP:', error.status);
    if (error.response) {
      console.error('Reponse Discord:', JSON.stringify(error.response.data, null, 2));
    }

    throw error;
  }
}

if (require.main === module) {
  deployCommands().catch(() => {
    process.exit(1);
  });
}

module.exports = { commands, deployCommands };
