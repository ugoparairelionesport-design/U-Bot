const { EmbedBuilder } = require('discord.js');
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

    for (let i = 0; i < level; i++) {
      total += this.getXPForLevel(i);
    }

    return total;
  }

  getRank(guildConfig, userId) {
    const users = Object.entries(guildConfig.xp?.users || {})
      .map(([id, data]) => ({ id, ...data, score: this.getTotalScore(data) }))
      .sort((a, b) => b.score - a.score);

    const index = users.findIndex(user => user.id === userId);
    return index === -1 ? users.length + 1 : index + 1;
  }

  getCardTheme(level = 0) {
    if (level >= 50) return { accent: '#F59E0B', glow: '#7C2D12', name: 'LEGEND' };
    if (level >= 30) return { accent: '#A855F7', glow: '#3B0764', name: 'ELITE' };
    if (level >= 15) return { accent: '#06B6D4', glow: '#164E63', name: 'VETERAN' };
    if (level >= 5) return { accent: '#22C55E', glow: '#14532D', name: 'ACTIVE' };
    return { accent: '#5865F2', glow: '#1E1B4B', name: 'ROOKIE' };
  }

  async sendLevelUp(message, level) {
    const guildConfig = configSystem.getGuildConfig(message.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('🎉 Niveau supérieur')
      .setDescription(`${message.author} passe au niveau **${level}**.`)
      .setColor(guildConfig.globalEmbedColor || '#FFD166')
      .setThumbnail(message.author.displayAvatarURL({ extension: 'png', size: 128 }))
      .setTimestamp();

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
    if (!createCanvas || !member || !member.user) return null;

    const settings = guildConfig.xp || {};
    const userData = settings.users?.[member.id] || { xp: 0, level: 0, prestige: 0, badges: [] };
    const xpNeeded = this.getXPForLevel(userData.level);
    const progress = Math.max(0, Math.min(1, (userData.xp || 0) / (xpNeeded || 100)));
    const percent = Math.round(progress * 100);
    const rank = this.getRank(guildConfig, member.id);
    const theme = this.getCardTheme(userData.level);

    const canvas = createCanvas(1100, 420);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createLinearGradient(0, 0, 1100, 420);
    gradient.addColorStop(0, '#111318');
    gradient.addColorStop(0.55, '#1C1F27');
    gradient.addColorStop(1, theme.glow);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (guildConfig.globalEmbedBanner) {
      try {
        const bg = await loadImage(guildConfig.globalEmbedBanner);
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      } catch (_) {}
    }

    ctx.save();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 6;
    ctx.roundRect(26, 26, canvas.width - 52, canvas.height - 52, 28);
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = theme.accent;
    ctx.shadowBlur = 28;
    ctx.fillStyle = '#171A21';
    ctx.roundRect(60, 70, 270, 270, 34);
    ctx.fill();
    ctx.restore();

    try {
      const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 256 });
      const avatar = await loadImage(avatarUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(195, 205, 106, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(avatar, 89, 99, 212, 212);
      ctx.restore();
    } catch (_) {
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(195, 205, 106, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = 'bold 70px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(member.user.username || '?').slice(0, 2).toUpperCase(), 195, 230);
      ctx.textAlign = 'left';
    }

    const username = String(member.displayName || member.user.username || 'MEMBRE').toUpperCase();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 48px sans-serif';
    ctx.fillText(username.slice(0, 22), 380, 122);

    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText(`LEVEL ${userData.level || 0}`, 380, 172);

    ctx.fillStyle = '#D6DAE5';
    ctx.font = '24px sans-serif';
    const prestigeText = Number(userData.prestige || 0) > 0 ? `   PRESTIGE ${userData.prestige}` : '';
    ctx.fillText(`#${rank} / ${member.guild.memberCount} membres   ${theme.name}${prestigeText}`, 380, 210);

    const barX = 380;
    const barY = 260;
    const barW = 620;
    const barH = 38;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
    ctx.roundRect(barX, barY, barW, barH, 19);
    ctx.fill();

    ctx.fillStyle = theme.accent;
    ctx.roundRect(barX, barY, Math.max(24, barW * progress), barH, 19);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${userData.xp || 0} / ${xpNeeded} XP`, barX + barW / 2, barY + 26);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#AEB6C7';
    ctx.font = '22px sans-serif';
    ctx.fillText(`${percent}% vers le niveau ${(userData.level || 0) + 1}`, barX, 335);

    ctx.fillStyle = theme.accent;
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText('U-BOT LEVELING', 790, 78);

    return canvas.toBuffer('image/png');
  }

  async getLeaderboard(guild) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const users = Object.entries(guildConfig.xp?.users || {})
      .map(([id, data]) => ({ id, ...data, score: this.getTotalScore(data) }))
      .sort((a, b) => b.score - a.score);

    const topUsers = users.slice(0, 15);
    const medals = ['🥇', '🥈', '🥉'];
    const description = topUsers.map((user, index) => {
      const xpNeeded = this.getXPForLevel(user.level || 0);
      const percent = Math.round(((user.xp || 0) / xpNeeded) * 100);
      const rankIcon = medals[index] || `#${index + 1}`;
      const prestige = Number(user.prestige || 0) > 0 ? ` • Prestige ${user.prestige}` : '';
      return `${rankIcon} <@${user.id}> • Niveau **${user.level || 0}**${prestige}\n` +
        `XP: \`${user.xp || 0}/${xpNeeded}\` • Progression: \`${percent}%\``;
    }).join('\n\n');

    const embed = new EmbedBuilder()
      .setTitle(`🏆 Classement XP - ${guild.name}`)
      .setDescription(description || 'Aucune donne XP enregistree pour le moment.')
      .addFields(
        { name: 'Membres classes', value: `\`${users.length}/${guild.memberCount}\``, inline: true },
        { name: 'Top affiche', value: `\`${topUsers.length}\``, inline: true },
        { name: 'Systeme', value: guildConfig.xp?.enabled ? '`Actif`' : '`Desactive`', inline: true }
      )
      .setColor(guildConfig.globalEmbedColor || '#5865F2')
      .setThumbnail(guild.iconURL({ dynamic: true }) || this.client.user.displayAvatarURL())
      .setFooter({ text: `Leaderboard actualise • ${users.length}/${guild.memberCount} membres suivis` })
      .setTimestamp();

    if (guildConfig.globalEmbedBanner) embed.setImage(guildConfig.globalEmbedBanner);
    return embed;
  }
}

module.exports = XPSystem;
