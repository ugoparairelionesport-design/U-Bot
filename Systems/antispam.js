const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const configSystem = require('./configsystem');

class AntiSpamSystem {
  constructor(client) {
    this.client = client;
    this.users = new Map(); // key: guildId_userId, value: { messages: [], lastContent: string, duplicateCount: number }
    console.log('🚫 Système Anti-Spam initialisé');
  }

  async handleMessage(message) {
    if (!message.guild || message.author.bot) return;

    const guildConfig = configSystem.getGuildConfig(message.guild.id);
    const settings = guildConfig.antiSpam;

    if (!settings?.enabled) return;

    const now = Date.now();
    const key = `${message.guild.id}_${message.author.id}`;
    let userData = this.users.get(key) || { messages: [], lastContent: '', duplicateCount: 0 };

    const windowMs = Math.max(1, settings.window || 5) * 1000;
    const rawContent = String(message.content || '').trim();
    const cleanContent = rawContent
      .toLowerCase()
      .replace(/[*_`~|>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    userData.messages = userData.messages.filter(m => now - m.time < windowMs);
    userData.messages.push({ time: now, content: cleanContent, messageId: message.id });

    let violation = null;

    if (userData.messages.length > (settings.maxMessages || 5)) {
      violation = 'Flood (trop de messages)';
    }

    if (cleanContent && cleanContent === userData.lastContent && cleanContent.length > 2) {
      userData.duplicateCount += 1;
    } else {
      userData.duplicateCount = 1;
    }

    if (cleanContent && userData.duplicateCount >= (settings.maxDuplicates || 3)) {
      violation = 'Répétition de messages';
    }

    userData.lastContent = cleanContent;

    const lines = rawContent
      .split(/\n+/)
      .map(line => line.toLowerCase().replace(/[*_`~|>]/g, '').trim())
      .filter(line => line.length > 1);

    if (lines.length >= (settings.maxDuplicates || 3)) {
      const counts = new Map();
      for (const line of lines) counts.set(line, (counts.get(line) || 0) + 1);
      if ([...counts.values()].some(count => count >= (settings.maxDuplicates || 3))) {
        violation = 'Répétition excessive dans un message';
      }
    }

    const links = message.content.match(/https?:\/\/[^\s]+/gi);
    if (links && links.length > (settings.maxLinks || 2)) {
      violation = 'Spam de liens';
    }

    this.users.set(key, userData);

    if (violation) {
      await this.applySanction(message, violation, settings, userData);
      this.resetUser(message.guild.id, message.author.id);
    }
  }

  async deleteRecentSpamMessages(message, userData) {
    const { channel, author } = message;
    const botMember = message.guild.members.me;

    if (!botMember || !channel.permissionsFor(botMember).has(PermissionsBitField.Flags.ManageMessages)) {
      return;
    }

    const messageIds = [...new Set(userData.messages.map(m => m.messageId).filter(Boolean))];
    const messages = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!messages) return;

    const deletableMessages = messages.filter(m =>
      m.author.id === author.id &&
      (messageIds.includes(m.id) || m.id === message.id) &&
      Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
    );

    if (deletableMessages.size > 1) {
      await channel.bulkDelete(deletableMessages, true).catch(() => {});
    } else {
      await message.delete().catch(() => {});
    }
  }

  async applySanction(message, reason, settings, userData) {
    const { member, guild, author, channel } = message;

    try {
      await this.deleteRecentSpamMessages(message, userData);

      const embed = new EmbedBuilder()
        .setTitle('🚫 Protection Anti-Spam')
        .setThumbnail(author.displayAvatarURL())
        .setColor('#FF0000')
        .setTimestamp();

      const action = String(settings.action || 'timeout').toLowerCase();

      switch (action) {
        case 'timeout': {
          const durationMinutes = Math.max(1, settings.timeoutDuration || 10);
          if (!member.moderatable) {
            embed.setDescription(`⚠️ ${author} a déclenché l'anti-spam, mais je ne peux pas le sanctionner.\n**Raison :** ${reason}\n**Action prévue :** timeout ${durationMinutes} min`);
            break;
          }
          await member.timeout(durationMinutes * 60 * 1000, `Anti-Spam: ${reason}`);
          embed.setDescription(`${author} a été mis en sourdine pendant ${durationMinutes} min.\n**Raison :** ${reason}`);
          break;
        }
        case 'kick':
          if (!member.kickable) {
            embed.setDescription(`⚠️ ${author} a déclenché l'anti-spam, mais je ne peux pas l'expulser.\n**Raison :** ${reason}`);
            break;
          }
          await member.kick(`Anti-Spam: ${reason}`);
          embed.setDescription(`${author} a été expulsé.\n**Raison :** ${reason}`);
          break;
        case 'ban':
          if (!member.bannable) {
            embed.setDescription(`⚠️ ${author} a déclenché l'anti-spam, mais je ne peux pas le bannir.\n**Raison :** ${reason}`);
            break;
          }
          await member.ban({ reason: `Anti-Spam: ${reason}` });
          embed.setDescription(`${author} a été banni.\n**Raison :** ${reason}`);
          break;
        default:
          embed.setDescription(`⚠️ ${author}, merci de ralentir. Le spam est interdit.\n**Raison :** ${reason}`);
          await channel.send(configSystem.withGuildBanner(configSystem.getGuildConfig(guild.id), { content: `${author}`, embeds: [embed] }, 'antispam-banner')).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
          await configSystem.sendLog(guild, embed, settings.logChannel);
          return;
      }

      await configSystem.sendLog(guild, embed, settings.logChannel);
      await channel.send(configSystem.withGuildBanner(configSystem.getGuildConfig(guild.id), { embeds: [embed] }, 'antispam-banner')).then(m => setTimeout(() => m.delete().catch(() => {}), 10000)).catch(() => {});
    } catch (err) {
      console.error('❌ Erreur lors de la sanction Anti-Spam:', err.message);
    }
  }

  resetUser(guildId, userId) {
    this.users.delete(`${guildId}_${userId}`);
  }
}

module.exports = AntiSpamSystem;
