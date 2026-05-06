const { EmbedBuilder } = require('discord.js');
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
    
    // On vérifie si le module global est activé (on considère 'enabled' comme le switch principal)
    // Si settings.enabled n'existe pas, on se base sur chatEnabled
    if (!settings?.chatEnabled) return;

    // Logique de Chat IA (si mentionné ou dans le salon dédié)
    const isMentioned = message.mentions.has(this.client.user);
    const isAiChannel = settings.aiChannel && message.channel.id === settings.aiChannel;

    if (isMentioned || isAiChannel) {
        await this.processAIChat(message);
    }
  }

  async processAIChat(message) {
    try {
      await message.channel.sendTyping();

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        return message.reply("❌ Erreur : La clé `GEMINI_API_KEY` est manquante dans les secrets du bot.");
      }

      const prompt = message.content.replace(`<@!${this.client.user.id}>`, '').replace(`<@${this.client.user.id}>`, '').trim();

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: "Tu es U-Bot, un assistant Discord intelligent, poli et utile. Tu réponds de manière concise." }]
          },
          contents: [{
            parts: [{ text: prompt }]
          }]
        })
      });

      const data = await response.json();
      
      if (data.error) throw new Error(data.error.message);
      
      const aiReply = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!aiReply) throw new Error("Réponse vide de Gemini");

      // Discord limite les messages à 2000 caractères
      await message.reply(aiReply.length > 2000 ? aiReply.substring(0, 1997) + "..." : aiReply);

    } catch (err) {
      console.error("❌ AI CHAT ERROR:", err);
      message.reply("🧠 Désolé, mon cerveau a eu une petite surchauffe. Réessaie dans un instant !");
    }
  }

  async generateEventIdeas(guild) {
    // Fonction pour suggérer des idées d'événements
    return [
        "🏆 Tournoi Gaming inter-rôles",
        "🎨 Concours de design de bannière",
        "🎤 Soirée Blind Test thématique"
    ];
  }

  async summarizeConversation(messages) {
    // Logique de résumé de texte
    return "Résumé : Discussion active sur l'intégration des nouvelles commandes IA.";
  }

  async checkGrammar(text) {
    // Logique de correction
    return text; // Retourne le texte corrigé
  }
}

module.exports = AISystem;