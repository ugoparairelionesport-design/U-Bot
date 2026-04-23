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
    .setDescription('Mettre à jour le panneau de statistiques'),

  new SlashCommandBuilder()
    .setName('staff_stats')
    .setDescription('Afficher les statistiques du staff tickets'),

  new SlashCommandBuilder()
    .setName('maintenance')
    .setDescription('Commandes de maintenance du bot')
    .addStringOption(option =>
      option.setName('action')
        .setDescription('Action à effectuer')
        .setRequired(true)
        .addChoices(
          { name: 'status', value: 'status' },
          { name: 'reload', value: 'reload' },
          { name: 'toggle_mode', value: 'toggle_mode' }
        )
    )

].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('⏳ Déploiement...');
    console.log(`📋 Nombre de commandes: ${commands.length}`);
    console.log(`🔑 Token présent: ${!!process.env.TOKEN}`);
    console.log(`🆔 Client ID: ${process.env.CLIENT_ID}`);

    console.log('📤 Envoi des commandes à Discord...');

    // Timeout de 30 secondes
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('TIMEOUT: Le déploiement prend trop de temps (>30s)')), 30000);
    });

    const deployPromise = rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commands }
    );

    const result = await Promise.race([deployPromise, timeoutPromise]);

    console.log(`✅ Commandes déployées avec succès: ${result.length} commandes`);
  } catch (error) {
    console.error('❌ Erreur lors du déploiement:');
    console.error('Type:', error.constructor.name);
    console.error('Message:', error.message);

    if (error.code) console.error('Code Discord:', error.code);
    if (error.status) console.error('Status HTTP:', error.status);
    if (error.response) {
      console.error('Réponse Discord:', JSON.stringify(error.response.data, null, 2));
    }

    console.error('\n🔍 Causes possibles:');
    console.error('• Token invalide ou expiré');
    console.error('• Permissions insuffisantes du bot');
    console.error('• Rate limit Discord (trop de déploiements)');
    console.error('• Problème réseau');

    process.exit(1);
  }
})();

// Exporter les commandes pour le système de maintenance
module.exports = { commands };
