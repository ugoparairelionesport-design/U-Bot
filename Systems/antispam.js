const { EmbedBuilder, PermissionsBitField } = require('discord.js');
const configSystem = require('./configsystem');

class AntiSpamSystem {
  constructor(client) {
    this.client = client;
    this.users = new Map(); // key: guildId_userId, value: { messages: [], lastContent: string, count: number }
    console.log('🚫 Système Anti-Spam initialisé');
  }

  async handleMessage(message) {
    if (!message.guild || message.author.bot || message.member?.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;

    const guildConfig = configSystem.getGuildConfig(message.guild.id);
    const settings = guildConfig.antiSpam;

    if (!settings?.enabled) return;

    const now = Date.now();
    const key = `${message.guild.id}_${message.author.id}`;
    let userData = this.users.get(key) || { messages: [], lastContent: '', duplicateCount: 0 };

    // Nettoyage des vieux messages (fenêtre glissante)
    const windowMs = (settings.window || 5) * 1000;
    userData.messages = userData.messages.filter(m => now - m.time < windowMs);
    userData.messages.push({ time: now, content: message.content });

    let violation = null;

    // 1. Détection de Flood (Débit)
    if (userData.messages.length > (settings.maxMessages || 5)) {
      violation = "Flood (Trop de messages)";
    }

    // 2. Détection de Répétition (Doublons)
    if (message.content === userData.lastContent && message.content.length > 3) {
      userData.duplicateCount++;
      if (userData.duplicateCount >= (settings.maxDuplicates || 3)) {
        violation = "Répétition de messages";
      }
    } else {
      userData.duplicateCount = 0;
    }
    userData.lastContent = message.content;

    // 3. Détection de Link Spam
    const links = message.content.match(/https?:\/\/[^\s]+/g);
    if (links && links.length > (settings.maxLinks || 3)) {
      violation = "Spam de liens";
    }

    this.users.set(key, userData);

    if (violation) {
      await this.applySanction(message, violation, settings);
    }
  }

  async applySanction(message, reason, settings) {
    const { member, guild, author, channel } = message;

    try {
      // Supprimer les messages de flood
      if (channel.permissionsFor(this.client.user).has(PermissionsBitField.Flags.ManageMessages)) {
        await message.delete().catch(() => {});
      }

      const embed = new EmbedBuilder()
        .setTitle('🚫 Protection Anti-Spam')
        .setThumbnail(author.displayAvatarURL())
        .setColor('#FF0000')
        .setTimestamp();

      switch (settings.action) {
        case 'timeout':
          const duration = (settings.timeoutDuration || 10) * 60 * 1000;
          await member.timeout(duration, `Anti-Spam: ${reason}`);
          embed.setDescription(`${author} a été mis en sourdine pendant ${settings.timeoutDuration} min.\n**Raison :** ${reason}`);
          break;
        case 'kick':
          await member.kick(`Anti-Spam: ${reason}`);
          embed.setDescription(`${author} a été expulsé.\n**Raison :** ${reason}`);
          break;
        case 'ban':
          await member.ban({ reason: `Anti-Spam: ${reason}` });
          embed.setDescription(`${author} a été banni.\n**Raison :** ${reason}`);
          break;
        default: // warn
          embed.setDescription(`⚠️ ${author}, merci de ralentir. Le spam est interdit.\n**Raison :** ${reason}`);
          await channel.send({ content: `${author}`, embeds: [embed] }).then(m => setTimeout(() => m.delete().catch(() => {}), 10000));
          return; // Pas besoin de log complet pour un simple warn
      }

      await configSystem.sendLog(guild, embed, settings.logChannel);
    } catch (err) {
      console.error("❌ Erreur lors de la sanction Anti-Spam:", err.message);
    }
  }

  resetUser(guildId, userId) {
    this.users.delete(`${guildId}_${userId}`);
  }
}

module.exports = AntiSpamSystem;