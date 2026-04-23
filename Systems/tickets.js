const {
  ChannelType,
  PermissionsBitField,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

function getClosingChannelName(channelName) {
  const suffix = 'fermeture-en-cours';
  if (channelName.includes(suffix)) return channelName;

  const maxLength = 100;
  const baseName = channelName.slice(0, maxLength - suffix.length - 1).replace(/-+$/g, '');
  return `${baseName}-${suffix}`;
}

async function createTicket(interaction, config, type = "default") {
  const guild = interaction.guild;
  const conf = config[guild.id];

  if (!conf || !conf.ticketCategories) {
    return interaction.reply({ content: "❌ Config tickets manquante", flags: 64 });
  }

  const categoryId = conf.ticketCategories[type] || conf.ticketCategories.default;
  const category = guild.channels.cache.get(categoryId);

  const channel = await guild.channels.create({
    name: `ticket-${interaction.user.username}`,
    type: ChannelType.GuildText,
    parent: categoryId,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages
        ]
      }
    ]
  });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket_close')
      .setLabel('🔒 Fermer')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `🎫 Ticket ${type} ouvert par ${interaction.user}`,
    components: [row]
  });

  if (conf.logsChannel) {
    const logChannel = guild.channels.cache.get(conf.logsChannel);
    logChannel?.send(`📩 Ticket créé : ${channel} (${interaction.user.tag})`);
  }

  await interaction.reply({
    content: `✅ Ticket : ${channel}`,
    flags: 64
  });
}

async function closeTicket(interaction, config) {
  const conf = config[interaction.guild.id];

  if (conf.logsChannel) {
    const logChannel = interaction.guild.channels.cache.get(conf.logsChannel);
    logChannel?.send(`🔒 Ticket fermé : ${interaction.channel.name}`);
  }

  await interaction.reply({ content: "Fermeture...", flags: 64 });
  await interaction.channel.setName(getClosingChannelName(interaction.channel.name)).catch(() => {});

  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 3000);
}

module.exports = { createTicket, closeTicket };