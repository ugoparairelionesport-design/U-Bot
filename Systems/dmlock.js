const { EmbedBuilder } = require('discord.js');
const configSystem = require('./configsystem');

class DmLockSystem {
  constructor(client) {
    this.client = client;
    console.log('📩 Système DM Lock initialisé');
  }

  async handleMemberJoin(member) {
    const guildConfig = configSystem.getGuildConfig(member.guild.id);
    const settings = guildConfig.dmLock;

    if (!settings?.enabled) return;

    const embed = new EmbedBuilder()
      .setTitle(`🛡️ Sécurité : protégez vos MPs sur ${member.guild.name}`)
      .setDescription(
        `Bonjour **${member.user.username}**,\n\n` +
        `Discord ne permet pas aux bots de couper automatiquement les MPs entre membres. Pour votre sécurité, désactivez manuellement les messages privés provenant de ce serveur.\n\n` +
        `**Pourquoi ?**\n` +
        `Les arnaqueurs utilisent les DMs pour envoyer des liens de phishing, de faux bots, des offres Nitro ou des arnaques crypto.\n\n` +
        `**Comment faire ?**\n` +
        `1. Cliquez sur le nom du serveur en haut à gauche.\n` +
        `2. Ouvrez **Paramètres de confidentialité**.\n` +
        `3. Décochez **Messages privés**.\n` +
        `4. Décochez aussi **Demandes de messages** si l'option est visible.`
      )
      .setColor('#ED4245')
      .setThumbnail(member.guild.iconURL({ dynamic: true }))
      .setFooter({ text: 'U-Bot Security Protocol • Protection DM' })
      .setTimestamp();

    try {
      await member.send({ embeds: [embed] });
      const logEmbed = new EmbedBuilder()
        .setTitle('📩 DM Lock : alerte envoyée')
        .setDescription(`Un message de prévention a été envoyé à ${member.user} (${member.user.tag}).`)
        .setColor('#5865F2')
        .setTimestamp();

      await configSystem.sendLog(member.guild, logEmbed, settings.logChannel);
    } catch (_) {
      console.log(`ℹ️ [DM-LOCK] Message non envoyé à ${member.user.tag} (DMs déjà fermés ou bloqués).`);
    }
  }

  async sendSafetyPanel(channel) {
    const embed = new EmbedBuilder()
      .setTitle('🛡️ Centre de Prévention des Arnaques (DMs)')
      .setDescription(
        '**Attention aux messages privés suspects !**\n\n' +
        '• ❌ Le staff ne vous demandera jamais votre mot de passe ou un code 2FA.\n' +
        '• ❌ Ne cliquez jamais sur des liens promettant du Nitro gratuit.\n' +
        '• ❌ Méfiez-vous des offres crypto, recrutement ou cadeaux reçues en MP.\n\n' +
        'Pour une sécurité maximale : cliquez sur le nom du serveur, ouvrez **Paramètres de confidentialité**, puis décochez **Messages privés** et **Demandes de messages** si l\'option est visible.'
      )
      .setColor('#2B2D31')
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }
}

module.exports = DmLockSystem;
