const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const configSystem = require('./configsystem');

let createCanvas, loadImage;
try {
  // Tentative d'importation de canvas (ou @napi-rs/canvas si sur Replit)
  ({ createCanvas, loadImage } = require('canvas'));
} catch (e) {
  console.error("⚠️ Erreur : La dépendance 'canvas' est absente ou mal installée. npm install canvas");
}

class EntranceSystem {
  constructor(client) {
    this.client = client;
    console.log('👋 Système d\'Entrée initialisé');
  }

  async handleMemberJoin(member) {
    const guildConfig = configSystem.getGuildConfig(member.guild.id);
    const settings = guildConfig.entrance;
    if (!settings?.enabled) return;

    const memberCount = member.guild.memberCount;

    // 1. Auto-Role
    if (settings.autoRoles.length > 0) {
      for (const roleId of settings.autoRoles) {
        const role = member.guild.roles.cache.get(roleId);
        if (role) await member.roles.add(role).catch(() => {});
      }
    }

    // 2. Message de bienvenue
    if (settings.welcomeChannel) {
      const channel = member.guild.channels.cache.get(settings.welcomeChannel);
      if (channel) {
        const text = settings.welcomeText
          .replace('{user}', `${member.user}`)
          .replace('{server}', member.guild.name)
          .replace('{count}', `**${memberCount}**`);

        const embed = new EmbedBuilder()
          .setTitle(`🌟 Bienvenue chez nous !`)
          .setDescription(text)
          .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
          .setImage(guildConfig.globalEmbedBanner)
          .setColor(guildConfig.globalEmbedColor)
          .setTimestamp();

        const payload = { content: `${member.user}`, embeds: [embed] };

        if (settings.welcomeImage) {
            const imageBuffer = await this.generateWelcomeImage(member, guildConfig);
            const attachment = new AttachmentBuilder(imageBuffer, { name: 'welcome.png' });
            embed.setImage('attachment://welcome.png');
            payload.files = [attachment];
        }

        await channel.send(payload).catch(() => {});
      }
    }

    // 3. DM Automatique
    if (settings.welcomeDm) {
      await member.send(`Bienvenue sur **${member.guild.name}** !`).catch(() => {});
    }

    // 4. Update Stats
    this.updateMemberCount(member.guild);
  }

  async handleMemberRemove(member) {
    const guildConfig = configSystem.getGuildConfig(member.guild.id);
    const settings = guildConfig.entrance;
    if (!settings?.enabled || !settings.welcomeChannel) return;

    const channel = member.guild.channels.cache.get(settings.welcomeChannel);
    if (channel) {
      const text = settings.leaveText
        .replace('{user}', `${member.user.tag}`)
        .replace('{count}', `**${member.guild.memberCount}**`);

      const embed = new EmbedBuilder()
        .setDescription(`👋 ${text}`)
        .setColor("#FF4500");

      await channel.send({ embeds: [embed] }).catch(() => {});
    }

    this.updateMemberCount(member.guild);
  }

  async generateWelcomeImage(member, guildConfig) {
    const canvas = createCanvas(700, 250);
    const ctx = canvas.getContext('2d');

    // Fond (Utilise l'image configurée, ou la bannière globale, ou un gris sombre par défaut)
    const bgUrl = guildConfig.entrance.welcomeImageBg || guildConfig.globalEmbedBanner || 'https://i.imgur.com/8P9pX8L.png';
    try {
        const background = await loadImage(bgUrl);
        ctx.drawImage(background, 0, 0, canvas.width, canvas.height);
    } catch (e) {
        ctx.fillStyle = '#23272a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Filtre sombre pour lisibilité
    ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Avatar circulaire
    ctx.save();
    ctx.beginPath();
    ctx.arc(125, 125, 80, 0, Math.PI * 2, true);
    ctx.closePath();
    ctx.clip();
    const avatar = await loadImage(member.user.displayAvatarURL({ extension: 'png', size: 256 }));
    ctx.drawImage(avatar, 45, 45, 160, 160);
    ctx.restore();

    // Bordure avatar (couleur globale du bot)
    ctx.strokeStyle = guildConfig.globalEmbedColor || '#5865F2';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(125, 125, 80, 0, Math.PI * 2, true);
    ctx.stroke();

    // Textes
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 35px sans-serif';
    ctx.fillText('BIENVENUE', 250, 100);

    ctx.font = '45px sans-serif';
    ctx.fillText(member.user.username.toUpperCase(), 250, 155);

    ctx.font = '22px sans-serif';
    ctx.fillText(`Nous sommes désormais ${member.guild.memberCount} membres !`, 250, 200);

    return canvas.toBuffer();
  }

  async updateMemberCount(guild) {
    const guildConfig = configSystem.getGuildConfig(guild.id);
    const statsChanId = guildConfig.entrance.statsChannel;
    if (!statsChanId) return;

    const channel = guild.channels.cache.get(statsChanId);
    if (channel) {
      // On utilise un format propre pour le nom du salon
      const name = `👥 Membres: ${guild.memberCount}`;
      if (channel.name !== name) {
        await channel.setName(name).catch(() => {});
      }
    }
  }

  async sendRulesPanel(interaction) {
    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const settings = guildConfig.entrance;
    
    const channel = await interaction.guild.channels.fetch(settings.rulesChannelId).catch(() => null);
    if (!channel) return interaction.reply({ content: "❌ Salon de règlement introuvable.", flags: 64 });

    const embed = new EmbedBuilder()
      .setTitle(`📜 Règlement du serveur ${interaction.guild.name}`)
      .setDescription(settings.rulesText)
      .setImage(guildConfig.globalEmbedBanner)
      .setColor(guildConfig.globalEmbedColor)
      .setFooter({ text: "Cliquez sur le bouton ci-dessous pour accepter" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('entrance_accept_rules')
        .setLabel('Accepter le règlement')
        .setEmoji('✅')
        .setStyle(ButtonStyle.Success)
    );

    await channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: "✅ Panel de règlement envoyé !", flags: 64 });
  }

  async handleRulesAcceptance(interaction) {
    const guildConfig = configSystem.getGuildConfig(interaction.guildId);
    const settings = guildConfig.entrance;

    if (!settings.rulesRoleId) return interaction.reply({ content: "❌ Rôle de règlement non configuré.", flags: 64 });

    const role = interaction.guild.roles.cache.get(settings.rulesRoleId);
    if (!role) return interaction.reply({ content: "❌ Rôle introuvable sur le serveur.", flags: 64 });

    try {
      if (interaction.member.roles.cache.has(role.id)) {
        return interaction.reply({ content: "ℹ️ Vous avez déjà accepté le règlement.", flags: 64 });
      }

      await interaction.member.roles.add(role);
      return interaction.reply({ content: "✅ Règlement accepté ! Bienvenue parmi nous.", flags: 64 });
    } catch (err) {
      console.error("Rules Acceptance Error:", err);
      return interaction.reply({ content: "❌ Je n'ai pas pu vous donner le rôle. Vérifiez mes permissions.", flags: 64 });
    }
  }
}

module.exports = EntranceSystem;