const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { fetch } = require('undici');
const configSystem = require('./configsystem');

let createCanvas, loadImage;
try {
  ({ createCanvas, loadImage } = require('@napi-rs/canvas'));
} catch (e) {
  console.error("XP System: @napi-rs/canvas introuvable, les cartes de profil seront desactivees. Lancez `npm install @napi-rs/canvas` sur Replit.");
}

class XPSystem {
  constructor(client) {
    this.client = client;
    console.log('XP System initialise');
  }

  async handleMessage(message) {
    if (!message.guild || message.author.bot) return;

    const guildConfig = configSystem.getGuildConfig(message.guild.id);
    const settings = guildConfig.xp;
    if (!settings?.enabled) return;

    if (!settings.users) settings.users = {};
    const userData = settings.users[message.author.id] || {
      xp: 0,
      level: 0,
      prestige: 0,
      badges: [],
      lastMessage: 0
    };

    const now = Date.now();
    const cooldownMs = (settings.cooldown || 60) * 1000;
    if (now - userData.lastMessage < cooldownMs) return;

    const [min, max] = settings.xpRange || [15, 25];
    const gain = Math.floor(Math.random() * (max - min + 1)) + min;

    userData.xp += gain;
    userData.lastMessage = now;

    let xpNeeded = this.getXPForLevel(userData.level);
    while (userData.xp >= xpNeeded) {
      userData.level++;
      userData.xp -= xpNeeded;
      xpNeeded = this.getXPForLevel(userData.level);
      this.sendLevelUp(message, userData.level);
    }

    settings.users[message.author.id] = userData;
    configSystem.saveConfig(configSystem.getFullConfig());
  }

  getXPForLevel(level) {
    return (level + 1) * (level + 1) * 100;
  }

  getTotalScore(data = {}) {
    const level = Number(data.level || 0);
    const prestige = Number(data.prestige || 0);
    const currentXp = Number(data.xp || 0);
    let total = prestige * 1000000 + currentXp;

    for (let i = 0; i < level; i++) total += this.getXPForLevel(i);
    return total;
  }

  getSortedUsers(guildConfig) {
    return Object.entries(guildConfig.xp?.users || {})
      .map(([id, data]) => ({ id, ...data, score: this.getTotalScore(data) }))
      .sort((a, b) => b.score - a.score);
  }

  getRank(guildConfig, userId) {
    const users = this.getSortedUsers(guildConfig);
    const index = users.findIndex(user => user.id === userId);
    return index === -1 ? users.length + 1 : index + 1;
  }

  async loadRemoteImage(url) {
    if (!url || !loadImage) return null;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': 'U-Bot/2.9.17 Canvas' } });
      if (!response.ok) return null;
      const buffer = Buffer.from(await response.arrayBuffer());
      return await loadImage(buffer);
    } catch (_) {
      return null;
    }
  }

  drawAvatarFallback(ctx, x, y, radius, label, color = '#5AD7FF') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#061016';
    ctx.font = `bold ${Math.floor(radius * 0.65)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(label || '?').slice(0, 2).toUpperCase(), x, y + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  async drawAvatar(ctx, user, x, y, radius) {
    const avatarUrl = user?.displayAvatarURL?.({ extension: 'png', size: 256 });
    const avatar = await this.loadRemoteImage(avatarUrl);

    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.clip();

    if (avatar) {
      ctx.drawImage(avatar, x - radius, y - radius, radius * 2, radius * 2);
    } else {
      ctx.restore();
      this.drawAvatarFallback(ctx, x, y, radius, user?.username || '?');
      return;
    }

    ctx.restore();
  }

  async sendLevelUp(message, level) {
    const guildConfig = configSystem.getGuildConfig(message.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('Niveau superieur')
      .setDescription(`${message.author} passe au niveau **${level}**.`)
      .setColor(guildConfig.globalEmbedColor || '#FFD166')
      .setThumbnail(message.author.displayAvatarURL({ extension: 'png', size: 128 }))
      .setTimestamp();

    if (guildConfig.globalEmbedBanner) embed.setImage(guildConfig.globalEmbedBanner);

    const targetChannel = guildConfig.xp?.levelUpChannel
      ? await message.guild.channels.fetch(guildConfig.xp.levelUpChannel).catch(() => null)
      : message.channel;

    if (targetChannel?.isTextBased()) {
      await targetChannel.send({ content: `${message.author}`, embeds: [embed] })
        .then(m => setTimeout(() => m.delete().catch(() => {}), 15000))
        .catch(() => {});
    }
  }

  async generateProfileCard(member, guildConfig) {
    if (!createCanvas || !member?.user) return null;

    const userData = guildConfig.xp?.users?.[member.id] || { xp: 0, level: 0, prestige: 0, badges: [] };
    const xpNeeded = this.getXPForLevel(userData.level);
    const progress = Math.max(0, Math.min(1, (userData.xp || 0) / (xpNeeded || 100)));
    const percent = Math.round(progress * 100);
    const rank = this.getRank(guildConfig, member.id);

    const canvas = createCanvas(980, 280);
    const ctx = canvas.getContext('2d');
    const accent = '#5AD7FF';
    const orange = '#FF9900';

    ctx.fillStyle = '#070A0C';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#101518';
    ctx.roundRect(18, 18, canvas.width - 36, canvas.height - 36, 18);
    ctx.fill();

    ctx.strokeStyle = '#202A30';
    ctx.lineWidth = 2;
    ctx.roundRect(18, 18, canvas.width - 36, canvas.height - 36, 18);
    ctx.stroke();

    await this.drawAvatar(ctx, member.user, 145, 140, 88);
    ctx.fillStyle = orange;
    ctx.beginPath();
    ctx.arc(205, 202, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#070A0C';
    ctx.lineWidth = 5;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 34px sans-serif';
    ctx.fillText(String(member.displayName || member.user.username).toUpperCase().slice(0, 18), 282, 92);

    ctx.fillStyle = '#AAB3BC';
    ctx.font = '22px sans-serif';
    ctx.fillText(`${userData.xp || 0} / ${xpNeeded} XP`, 282, 138);

    ctx.fillStyle = '#4D555B';
    ctx.roundRect(282, 176, 560, 30, 15);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.roundRect(282, 176, Math.max(24, 560 * progress), 30, 15);
    ctx.fill();

    ctx.fillStyle = '#DDE4EA';
    ctx.font = '20px sans-serif';
    ctx.fillText(`${percent}% vers le niveau ${(userData.level || 0) + 1}`, 282, 232);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '20px sans-serif';
    ctx.fillText('RANK', 704, 76);
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(`#${rank}`, 762, 78);

    ctx.fillStyle = accent;
    ctx.font = '24px sans-serif';
    ctx.fillText('LEVEL', 835, 78);
    ctx.font = 'bold 54px sans-serif';
    ctx.fillText(String(userData.level || 0), 912, 78);

    return canvas.toBuffer('image/png');
  }

  async generateLeaderboardCard(guild, users) {
    if (!createCanvas) return null;

    const rows = Math.min(10, users.length);
    const width = 980;
    const rowHeight = 132;
    const canvas = createCanvas(width, rows ? 70 + rows * rowHeight : 220);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#070A0C';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`Classement XP - ${guild.name}`, 34, 44);

    if (!rows) {
      ctx.fillStyle = '#AAB3BC';
      ctx.font = '22px sans-serif';
      ctx.fillText('Aucune donnee XP enregistree pour le moment.', 34, 126);
      return canvas.toBuffer('image/png');
    }

    for (let i = 0; i < rows; i++) {
      const user = users[i];
      const member = await guild.members.fetch(user.id).catch(() => null);
      const discordUser = member?.user || await this.client.users.fetch(user.id).catch(() => null);
      const xpNeeded = this.getXPForLevel(user.level || 0);
      const progress = Math.max(0, Math.min(1, (user.xp || 0) / xpNeeded));
      const y = 70 + i * rowHeight;

      ctx.fillStyle = i === 0 ? '#101B20' : '#101518';
      ctx.roundRect(24, y, width - 48, rowHeight - 16, 16);
      ctx.fill();

      await this.drawAvatar(ctx, discordUser, 86, y + 58, 42);
      ctx.fillStyle = '#FF9900';
      ctx.beginPath();
      ctx.arc(116, y + 88, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(`#${i + 1} ${member?.displayName || discordUser?.username || 'Membre inconnu'}`.slice(0, 30), 150, y + 46);

      ctx.fillStyle = '#AAB3BC';
      ctx.font = '18px sans-serif';
      ctx.fillText(`${user.xp || 0} / ${xpNeeded} XP`, 150, y + 80);

      ctx.fillStyle = '#4D555B';
      ctx.roundRect(150, y + 96, 520, 18, 9);
      ctx.fill();
      ctx.fillStyle = '#5AD7FF';
      ctx.roundRect(150, y + 96, Math.max(18, 520 * progress), 18, 9);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(`#${i + 1}`, 730, y + 62);
      ctx.fillStyle = '#5AD7FF';
      ctx.font = 'bold 42px sans-serif';
      ctx.fillText(String(user.level || 0), 880, y + 62);
      ctx.fillStyle = '#AAB3BC';
      ctx.font = '16px sans-serif';
      ctx.fillText('RANK', 728, y + 88);
      ctx.fillText('LEVEL', 860, y + 88);
    }

    return canvas.toBuffer('image/png');
  }

  async getLeaderboardPayload(guild) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const users = this.getSortedUsers(guildConfig);
    const topUsers = users.slice(0, 10);
    const buffer = await this.generateLeaderboardCard(guild, topUsers);

    const embed = new EmbedBuilder()
      .setTitle(`Classement XP - ${guild.name}`)
      .setDescription(`Membres classes : **${users.length}/${guild.memberCount}**`)
      .setColor(guildConfig.globalEmbedColor || '#5AD7FF')
      .setFooter({ text: `Leaderboard actualise • ${users.length}/${guild.memberCount} membres suivis` })
      .setTimestamp();

    const botAvatar = this.client.user?.displayAvatarURL?.();
    if (botAvatar) embed.setThumbnail(botAvatar);

    const payload = { embeds: [embed] };
    if (buffer) {
      payload.files = [new AttachmentBuilder(buffer, { name: 'leaderboard.png' })];
      embed.setImage('attachment://leaderboard.png');
    } else if (guildConfig.globalEmbedBanner) {
      embed.setImage(guildConfig.globalEmbedBanner);
    }

    payload.components = [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('xp_leaderboard_refresh')
          .setLabel('Refresh')
          .setEmoji('🔄')
          .setStyle(ButtonStyle.Secondary)
      )
    ];

    return payload;
  }

  async getLeaderboard(guild) {
    const payload = await this.getLeaderboardPayload(guild);
    return payload.embeds[0];
  }
}

module.exports = XPSystem;
