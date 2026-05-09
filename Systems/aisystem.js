const { EmbedBuilder, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { fetch } = require('undici');
const configSystem = require('./configsystem');

class AISystem {
  constructor(client) {
    this.client = client;
    console.log('🤖 Système IA & Automatisation initialisé');
  }

  async handleMessage(message) {
    if (!message.guild || message.author.bot) return;
    
    const guildConfig = configSystem.getGuildConfig(message.guild.id);
    const settings = guildConfig.ai;
    
    // Vérification du switch global (Master Switch)
    if (!settings?.enabled) return;

    // 1. Logique de Chat IA (si mentionné ou dans le salon dédié)
    const isMentioned = message.mentions.has(this.client.user);
    const isAiChannel = settings.aiChannel && (message.channel.id === settings.aiChannel);

    if (settings.chatEnabled && (isMentioned || isAiChannel)) {
      // On ignore les messages vides (stickers, images sans texte)
      if (!message.content && !isMentioned) return;
      
      console.log(`🤖 [IA] Message détecté dans #${message.channel.name} (Mention: ${isMentioned}, Salon Dédié: ${isAiChannel})`);
      return await this.processAIChat(message);
    }

    // 2. Correction Orthographique (si activé et message assez long)
    if (settings.spellCheck && message.content.length > 20 && !message.content.startsWith('/')) {
      await this.processSpellCheck(message);
    }
  }

  async processAIChat(message) {
    try {
      await message.channel.sendTyping();

      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) {
        return message.reply("❌ Erreur : La clé `GROQ_API_KEY` est manquante dans les secrets du bot.");
      }

      // Nettoyage du prompt (retrait de la mention du bot)
      const mentionRegex = new RegExp(`<@!?${this.client.user.id}>`, 'g');
      const prompt = message.content.replace(mentionRegex, '').trim();
      
      if (!prompt) return; // Ne rien faire si le message est vide après nettoyage

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "Tu es U-Bot, un assistant Discord intelligent, poli et utile. Réponds de manière concise." },
            { role: "user", content: prompt }
          ]
        })
      });

      const data = await response.json();
      const aiReply = data.choices?.[0]?.message?.content;

      if (!aiReply) throw new Error("Réponse vide de Groq");

      // Discord limite les messages à 2000 caractères
      await message.reply(aiReply.length > 2000 ? aiReply.substring(0, 1997) + "..." : aiReply);

    } catch (err) {
      console.error("❌ AI CHAT ERROR:", err);
      message.reply("🧠 Désolé, mon cerveau a eu une petite surchauffe. Réessaie dans un instant !");
    }
  }

  async generateEventIdeas(guild) {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return "❌ Clé API manquante.";

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "Tu es un organisateur d'événements Discord créatif." },
            { role: "user", content: `Génère 3 idées d'événements engageantes pour le serveur "${guild.name}".` }
          ]
        })
      });

      const data = await response.json();
      return data.choices?.[0]?.message?.content || "❌ Échec de la génération.";
    } catch (err) {
      console.error("AI EVENT GEN ERROR:", err);
      return "❌ Erreur lors de la génération d'idées d'événements.";
    }
  }

  async summarizeConversation(channel) {
    try {
      const messages = await channel.messages.fetch({ limit: 50 });
      const textToSummarize = messages
        .filter(m => !m.author.bot && m.content.length > 2)
        .map(m => `${m.author.username}: ${m.content}`)
        .reverse()
        .join('\n');

      if (!textToSummarize) return "❌ Pas assez de messages récents pour résumer.";

      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return "❌ Clé API manquante.";

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "Tu es un assistant chargé de résumer les conversations de manière concise avec des listes à puces." },
            { role: "user", content: `Résume cette discussion :\n\n${textToSummarize}` }
          ]
        })
      });

      const data = await response.json();
      const summary = data.choices?.[0]?.message?.content;

      return summary || "❌ Échec du résumé.";
    } catch (err) {
      console.error("AI SUMMARIZE ERROR:", err);
      return "❌ Erreur lors du résumé de la conversation.";
    }
  }

  async processSpellCheck(message) {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) return;

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [
            { role: "system", content: "Tu es un correcteur d'orthographe. Si le texte contient des fautes, renvoie uniquement la version corrigée sans aucun commentaire. Si le texte est déjà correct, renvoie le mot 'CORRECT'." },
            { role: "user", content: message.content }
          ]
        })
      });

      const data = await response.json();
      const result = data.choices?.[0]?.message?.content;

      if (result && result !== "CORRECT" && result.toLowerCase() !== message.content.toLowerCase()) {
        // On propose la correction discrètement
        const embed = new EmbedBuilder()
          .setAuthor({ name: "Suggestion d'orthographe", iconURL: this.client.user.displayAvatarURL() })
          .setDescription(`*Correction suggérée pour <@${message.author.id}> :*\n\n> ${result}`)
          .setColor("#5865F2");

        const reply = await message.reply({ embeds: [embed] });
        // Auto-suppression après 15 secondes pour ne pas polluer
        setTimeout(() => reply.delete().catch(() => {}), 15000);
      }
    } catch (err) {
      console.error("AI SPELLCHECK ERROR:", err);
    }
  }

  async checkGrammar(text) { // Maintenu pour compatibilité
    return text;
  }

  async showAnnouncementModal(interaction) {
    const modal = new ModalBuilder()
      .setCustomId('modal_create_announcement')
      .setTitle('Créer une Annonce avec l\'IA')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('announcement_content')
            .setLabel('Contenu principal de l\'annonce')
            .setPlaceholder('Ex: Nouvelle mise à jour du bot, événement à venir, etc.')
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('keywords')
            .setLabel('Mots-clés supplémentaires (optionnel)')
            .setPlaceholder('Ex: #mise-a-jour, #event, #important')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('mention_role_id')
            .setLabel('ID du rôle à mentionner (optionnel)')
            .setPlaceholder('Ex: 123456789012345678 (laisser vide pour aucune mention)')
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
        )
      );

    await interaction.showModal(modal);
  }

  async handleAnnouncementModalSubmit(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const content = interaction.fields.getTextInputValue('announcement_content');
    const keywords = interaction.fields.getTextInputValue('keywords');
    const mentionRoleId = interaction.fields.getTextInputValue('mention_role_id');

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return interaction.editReply("❌ Erreur : La clé `GROQ_API_KEY` est manquante dans les secrets du bot.");
    }

    let prompt = `Crée une annonce Discord très esthétique et engageante. Utilise des formats Discord comme le gras, le souligné, les italiques, les blocs de code, les citations, et des emojis pertinents. Le ton doit être professionnel mais amical.
    Contenu principal: "${content}"`;

    if (keywords) {
      prompt += `\n\nMots-clés à intégrer: ${keywords}`;
    }

    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: prompt }]
        })
      });

      const data = await response.json();
      const aiAnnouncement = data.choices?.[0]?.message?.content;

      if (!aiAnnouncement) throw new Error("Réponse vide de Groq pour l'annonce.");

      let finalAnnouncement = aiAnnouncement;
      if (mentionRoleId) {
        finalAnnouncement = `<@&${mentionRoleId}>\n\n` + finalAnnouncement;
      }

      // Proposer l'annonce à l'utilisateur pour qu'il puisse la copier/coller
      await interaction.editReply({
        content: `✅ Voici l'annonce générée par l'IA. Copiez-collez-la dans le salon de votre choix :\n\n${finalAnnouncement}`,
        ephemeral: true
      });

    } catch (err) {
      console.error("❌ AI ANNOUNCEMENT ERROR:", err);
      await interaction.editReply("🧠 Désolé, mon cerveau a eu une petite surchauffe lors de la création de l'annonce. Réessaie dans un instant !");
    }
  }
}

module.exports = AISystem;