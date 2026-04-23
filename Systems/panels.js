const {
  ActionRowBuilder,
  StringSelectMenuBuilder
} = require('discord.js');

async function sendPanel(interaction, config) {
  const conf = config[interaction.guildId];

  if (!conf || !conf.panels) {
    return interaction.reply({ content: "❌ Aucun panel", flags: 64 });
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('panel_select')
    .setPlaceholder('Choisis ton ticket');

  conf.panels.forEach(p => {
    menu.addOptions({
      label: p.name,
      value: p.value
    });
  });

  const row = new ActionRowBuilder().addComponents(menu);

  await interaction.channel.send({
    content: "🎛️ Panel tickets",
    components: [row]
  });

  await interaction.reply({ content: "✅ Panel envoyé", flags: 64 });
}

async function handlePanelSelect(interaction, config) {
  const type = interaction.values[0];
  const { createTicket } = require('./tickets');
  return createTicket(interaction, config, type);
}

module.exports = { sendPanel, handlePanelSelect };