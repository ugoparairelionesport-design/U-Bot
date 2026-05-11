const { EmbedBuilder, AuditLogEvent } = require('discord.js');
const configSystem = require('./configsystem');

class LogSystem {
  constructor(client) {
    this.client = client;
    console.log('LogSystem initialise');
  }

  getLogChannel(guild, type) {
    const config = configSystem.getGuildConfig(guild.id);
    if (!config.detailedLogs?.enabled || !config.detailedLogs.channels[type]) return null;
    return guild.channels.cache.get(config.detailedLogs.channels[type]);
  }

  trim(value, max = 1000) {
    const text = String(value || '').trim();
    if (!text) return '*Aucun contenu texte*';
    return text.length > max ? `${text.slice(0, max - 3)}...` : text;
  }

  baseEmbed(guild, title, color) {
    return new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .setFooter({ text: `${guild.name} • Logs detailles`, iconURL: guild.iconURL({ dynamic: true }) || undefined })
      .setTimestamp();
  }

  async handleMessageDelete(message) {
    if (!message.guild || message.author?.bot) return;
    const channel = this.getLogChannel(message.guild, 'message');
    if (!channel) return;

    const embed = this.baseEmbed(message.guild, '🗑 Message supprime', '#ED4245')
      .setAuthor({ name: message.author?.tag || 'Auteur inconnu', iconURL: message.author?.displayAvatarURL?.({ dynamic: true }) })
      .setThumbnail(message.author?.displayAvatarURL?.({ dynamic: true }))
      .addFields(
        { name: 'Auteur', value: message.author ? `${message.author}\n\`${message.author.id}\`` : '`Inconnu`', inline: true },
        { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
        { name: 'Pieces jointes', value: `\`${message.attachments?.size || 0}\``, inline: true },
        { name: 'Contenu', value: this.trim(message.content), inline: false }
      );

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMessageUpdate(oldMsg, newMsg) {
    if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
    const channel = this.getLogChannel(oldMsg.guild, 'message');
    if (!channel) return;

    const embed = this.baseEmbed(oldMsg.guild, '✏️ Message modifie', '#FEE75C')
      .setURL(newMsg.url)
      .setAuthor({ name: oldMsg.author?.tag || 'Auteur inconnu', iconURL: oldMsg.author?.displayAvatarURL?.({ dynamic: true }) })
      .setThumbnail(oldMsg.author?.displayAvatarURL?.({ dynamic: true }))
      .addFields(
        { name: 'Auteur', value: oldMsg.author ? `${oldMsg.author}\n\`${oldMsg.author.id}\`` : '`Inconnu`', inline: true },
        { name: 'Salon', value: `<#${oldMsg.channelId}>`, inline: true },
        { name: 'Message', value: `[Ouvrir](${newMsg.url})`, inline: true },
        { name: 'Avant', value: this.trim(oldMsg.content), inline: false },
        { name: 'Apres', value: this.trim(newMsg.content), inline: false }
      );

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberJoin(member) {
    const channel = this.getLogChannel(member.guild, 'member');
    if (!channel) return;

    const accountAgeDays = Math.floor((Date.now() - member.user.createdTimestamp) / 86400000);
    const embed = this.baseEmbed(member.guild, '📥 Membre rejoint', '#57F287')
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Membre', value: `${member.user}\n\`${member.id}\``, inline: true },
        { name: 'Compte cree', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'Age du compte', value: `\`${accountAgeDays} jour(s)\``, inline: true },
        { name: 'Population', value: `\`${member.guild.memberCount} membres\``, inline: true }
      );

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberRemove(member) {
    const channel = this.getLogChannel(member.guild, 'member');
    if (!channel) return;

    const embed = this.baseEmbed(member.guild, '📤 Membre parti', '#F97316')
      .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Membre', value: `${member.user.tag}\n\`${member.id}\``, inline: true },
        { name: 'Population', value: `\`${member.guild.memberCount} membres\``, inline: true }
      );

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleGuildBan(ban) {
    const channel = this.getLogChannel(ban.guild, 'mod');
    if (!channel) return;

    const embed = this.baseEmbed(ban.guild, '🔨 Membre banni', '#B91C1C')
      .setAuthor({ name: ban.user.tag, iconURL: ban.user.displayAvatarURL({ dynamic: true }) })
      .setThumbnail(ban.user.displayAvatarURL({ dynamic: true }))
      .addFields(
        { name: 'Utilisateur', value: `${ban.user}\n\`${ban.user.id}\``, inline: true },
        { name: 'Raison', value: this.trim(ban.reason || 'Aucune raison fournie', 800), inline: false }
      );

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberUpdate(oldMember, newMember) {
    const channel = this.getLogChannel(newMember.guild, 'member');
    if (!channel) return;

    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      const added = newMember.roles.cache.filter(role => !oldMember.roles.cache.has(role.id));
      const removed = oldMember.roles.cache.filter(role => !newMember.roles.cache.has(role.id));

      if (added.size || removed.size) {
        const embed = this.baseEmbed(newMember.guild, '🛡 Roles mis a jour', '#5865F2')
          .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
          .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
          .addFields({ name: 'Membre', value: `${newMember.user}\n\`${newMember.id}\``, inline: false });

        if (added.size) embed.addFields({ name: 'Roles ajoutes', value: added.map(r => `<@&${r.id}>`).join(', '), inline: false });
        if (removed.size) embed.addFields({ name: 'Roles retires', value: removed.map(r => `<@&${r.id}>`).join(', '), inline: false });

        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }

    if (oldMember.nickname !== newMember.nickname) {
      const embed = this.baseEmbed(newMember.guild, '👤 Surnom modifie', '#38BDF8')
        .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL({ dynamic: true }) })
        .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
        .addFields(
          { name: 'Membre', value: `${newMember.user}\n\`${newMember.id}\``, inline: false },
          { name: 'Avant', value: `\`${oldMember.nickname || oldMember.user.username}\``, inline: true },
          { name: 'Apres', value: `\`${newMember.nickname || newMember.user.username}\``, inline: true }
        );

      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async handleChannelUpdate(oldChan, newChan) {
    const channel = this.getLogChannel(newChan.guild, 'server');
    if (!channel) return;

    if (oldChan.name !== newChan.name) {
      const embed = this.baseEmbed(newChan.guild, '📁 Salon renomme', '#A855F7')
        .addFields(
          { name: 'Avant', value: `\`${oldChan.name}\``, inline: true },
          { name: 'Apres', value: `\`${newChan.name}\``, inline: true },
          { name: 'Salon', value: `<#${newChan.id}>`, inline: false }
        );

      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async handleAuditLogEntry(entry, guild) {
    const logChannel = this.getLogChannel(guild, 'mod');
    if (!logChannel) return;

    const { action, executor, target } = entry;
    const actionNames = {
      [AuditLogEvent.ChannelDelete]: '🗑 Salon supprime',
      [AuditLogEvent.RoleDelete]: '🗑 Role supprime',
      [AuditLogEvent.WebhookDelete]: '⚓ Webhook supprime',
      [AuditLogEvent.MemberKick]: '👢 Membre expulse',
      [AuditLogEvent.MemberPrune]: '🧹 Purge membres inactifs'
    };

    if (!actionNames[action]) return;

    const embed = this.baseEmbed(guild, actionNames[action], '#2B2D31')
      .setAuthor({ name: executor?.tag || 'Action systeme', iconURL: executor?.displayAvatarURL?.({ dynamic: true }) })
      .addFields(
        { name: 'Action par', value: executor ? `${executor}\n\`${executor.id}\`` : '`Inconnu`', inline: true },
        { name: 'Cible', value: `\`${target?.id || 'Inconnue'}\``, inline: true }
      );

    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = LogSystem;
