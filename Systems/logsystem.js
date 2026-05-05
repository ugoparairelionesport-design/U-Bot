const { EmbedBuilder, AuditLogEvent, Events } = require('discord.js');
const configSystem = require('./configsystem');

class LogSystem {
  constructor(client) {
    this.client = client;
    console.log('📜 Système de Logs Ultra-Détaillés initialisé');
  }

  getLogChannel(guild, type) {
    const config = configSystem.getGuildConfig(guild.id);
    if (!config.detailedLogs?.enabled || !config.detailedLogs.channels[type]) return null;
    return guild.channels.cache.get(config.detailedLogs.channels[type]);
  }

  async handleMessageDelete(message) {
    if (!message.guild || message.author?.bot) return;
    const channel = this.getLogChannel(message.guild, 'message');
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🗑️ Message Supprimé')
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL() })
      .addFields(
        { name: 'Auteur', value: `<@${message.author.id}>`, inline: true },
        { name: 'Salon', value: `<#${message.channelId}>`, inline: true },
        { name: 'Contenu', value: message.content?.slice(0, 1000) || '*[Fichier ou Embed]*' }
      )
      .setColor('#FF0000')
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMessageUpdate(oldMsg, newMsg) {
    if (!oldMsg.guild || oldMsg.author?.bot || oldMsg.content === newMsg.content) return;
    const channel = this.getLogChannel(oldMsg.guild, 'message');
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('📝 Message Édité')
      .setURL(newMsg.url)
      .setAuthor({ name: oldMsg.author.tag, iconURL: oldMsg.author.displayAvatarURL() })
      .addFields(
        { name: 'Avant', value: oldMsg.content?.slice(0, 1000) || '*Vide*' },
        { name: 'Après', value: newMsg.content?.slice(0, 1000) || '*Vide*' }
      )
      .setColor('#FFA500')
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberJoin(member) {
    const channel = this.getLogChannel(member.guild, 'member');
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('📥 Nouveau Membre')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`${member.user} vient de rejoindre le serveur.`)
      .addFields(
        { name: 'Compte créé le', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: 'ID', value: `\`${member.id}\``, inline: true }
      )
      .setColor('#00FF00')
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberRemove(member) {
    const channel = this.getLogChannel(member.guild, 'member');
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('📤 Départ Membre')
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(`${member.user.tag} a quitté le serveur.`)
      .addFields({ name: 'ID', value: `\`${member.id}\`` })
      .setColor('#FF4500')
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleGuildBan(ban) {
    const channel = this.getLogChannel(ban.guild, 'mod');
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setTitle('🔨 Bannissement')
      .setAuthor({ name: ban.user.tag, iconURL: ban.user.displayAvatarURL() })
      .addFields(
        { name: 'Utilisateur', value: `${ban.user}`, inline: true },
        { name: 'Raison', value: ban.reason || 'Aucune raison fournie' }
      )
      .setColor('#8B0000')
      .setTimestamp();

    await channel.send({ embeds: [embed] }).catch(() => {});
  }

  async handleMemberUpdate(oldMember, newMember) {
    const channel = this.getLogChannel(newMember.guild, 'member');
    if (!channel) return;

    // Rôles
    if (oldMember.roles.cache.size !== newMember.roles.cache.size) {
      const added = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
      const removed = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));
      
      if (added.size || removed.size) {
        const embed = new EmbedBuilder()
          .setTitle('🛡️ Mise à jour Rôles')
          .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() })
          .setDescription(`${newMember.user}`)
          .setColor('#5865F2')
          .setTimestamp();

        if (added.size) embed.addFields({ name: '➕ Ajouté', value: added.map(r => `<@&${r.id}>`).join(', ') });
        if (removed.size) embed.addFields({ name: '➖ Retiré', value: removed.map(r => `<@&${r.id}>`).join(', ') });

        await channel.send({ embeds: [embed] }).catch(() => {});
      }
    }

    // Pseudo
    if (oldMember.nickname !== newMember.nickname) {
      const embed = new EmbedBuilder()
        .setTitle('👤 Changement Surnom')
        .setAuthor({ name: newMember.user.tag, iconURL: newMember.user.displayAvatarURL() })
        .addFields(
          { name: 'Ancien', value: `\`${oldMember.nickname || oldMember.user.username}\``, inline: true },
          { name: 'Nouveau', value: `\`${newMember.nickname || newMember.user.username}\``, inline: true }
        )
        .setColor('#3498DB')
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async handleChannelUpdate(oldChan, newChan) {
    const channel = this.getLogChannel(newChan.guild, 'server');
    if (!channel) return;

    if (oldChan.name !== newChan.name) {
      const embed = new EmbedBuilder()
        .setTitle('📂 Salon Renommé')
        .addFields(
          { name: 'Ancien Nom', value: `\`${oldChan.name}\``, inline: true },
          { name: 'Nouveau Nom', value: `\`${newChan.name}\``, inline: true }
        )
        .setColor('#9B59B6')
        .setTimestamp();
      await channel.send({ embeds: [embed] }).catch(() => {});
    }
  }

  async handleAuditLogEntry(entry, guild) {
    const logChannel = this.getLogChannel(guild, 'mod');
    if (!logChannel) return;

    const { action, executor, target } = entry;
    
    // On ne log que les actions staff spécifiques demandées
    const importantActions = [
        AuditLogEvent.ChannelDelete,
        AuditLogEvent.RoleDelete,
        AuditLogEvent.WebhookDelete,
        AuditLogEvent.MemberKick,
        AuditLogEvent.MemberPrune
    ];

    if (!importantActions.includes(action)) return;

    const actionNames = {
        [AuditLogEvent.ChannelDelete]: '🗑️ Salon Supprimé',
        [AuditLogEvent.RoleDelete]: '🗑️ Rôle Supprimé',
        [AuditLogEvent.WebhookDelete]: '⚓ Webhook Supprimé',
        [AuditLogEvent.MemberKick]: '👢 Membre Expulsé',
        [AuditLogEvent.MemberPrune]: '🧹 Purge Inactifs'
    };

    const embed = new EmbedBuilder()
        .setTitle(actionNames[action])
        .addFields(
            { name: 'Action par', value: `${executor}`, inline: true },
            { name: 'Cible', value: `\`${target?.id || 'Inconnu'}\``, inline: true }
        )
        .setColor('#2F3136')
        .setTimestamp();

    await logChannel.send({ embeds: [embed] }).catch(() => {});
  }
}

module.exports = LogSystem;