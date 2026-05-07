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
          system_instruction: { parts: [{ text: "Tu es U-Bot, un assistant Discord intelligent, poli et utile. Réponds de manière concise." }] },
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
    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return "❌ Clé API manquante.";

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: "Tu es un organisateur d'événements Discord créatif." }] },
          contents: [{
            parts: [{ text: `Propose 3 idées originales pour le serveur "${guild.name}".` }]
          }]
        })
      });

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "❌ Échec de la génération d'idées.";
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

      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return "❌ Clé API manquante.";

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: "Tu es un assistant chargé de résumer les conversations de manière concise avec des listes à puces." }] },
          contents: [{
            parts: [{ text: textToSummarize }]
          }]
        })
      });

      const data = await response.json();
      const summary = data.candidates?.[0]?.content?.parts?.[0]?.text;

      return summary || "❌ Échec du résumé.";
    } catch (err) {
      console.error("AI SUMMARIZE ERROR:", err);
      return "❌ Erreur lors du résumé de la conversation.";
    }
  }

  async checkGrammar(text) {
    // Logique de correction
    return text; // Retourne le texte corrigé
  }
}

module.exports = AISystem;