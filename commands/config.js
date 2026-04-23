const {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config_ticket')
    .setDescription('Configurer le bot'),

  async execute(interaction) {

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('config_ticket_category')
        .setLabel('📂 Catégorie tickets')
        .setStyle(ButtonStyle.Primary),

      new ButtonBuilder()
        .setCustomId('config_logs')
        .setLabel('📜 Logs')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({
      content: "⚙️ Config bot",
      components: [row],
      flags: 64
    });
  }
};