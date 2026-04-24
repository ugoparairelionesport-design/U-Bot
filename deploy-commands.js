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
    .setDescription('Afficher les statistiques du staff tickets')
].map(cmd => cmd.toJSON());

async function deployCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    console.log('Deployement des commandes...');
    console.log(`Nombre de commandes: ${commands.length}`);
    console.log(`Token present: ${!!process.env.TOKEN}`);
    console.log(`Client ID: ${process.env.CLIENT_ID}`);

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT: Le deployement prend trop de temps (>30s)')), 30000);
    });

    const route = process.env.GUILD_ID
      ? Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
      : Routes.applicationCommands(process.env.CLIENT_ID);

    if (process.env.GUILD_ID) {
      console.log(`Deployement des commandes dans le serveur ${process.env.GUILD_ID}`);
    } else {
      console.log('Deployement des commandes globales');
    }

    const deployPromise = rest.put(route, { body: commands });
    const result = await Promise.race([deployPromise, timeoutPromise]);

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
