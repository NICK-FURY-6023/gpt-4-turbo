require('dotenv/config');
const { Client, IntentsBitField } = require('discord.js');
const { Configuration, OpenAIApi } = require('openai');
const logErrors = require('./utils/logErrors'); // Optional: For logging errors

// Initialize the Discord client with necessary intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent, // Required to read message content
  ],
});

// Log a message when the bot is ready
client.on('ready', (c) => console.log(`${c.user.username} is online and ready!`));

// OpenAI API Configuration using your key
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY, // Ensure your OpenAI API key is stored in the environment variables
});
const openai = new OpenAIApi(configuration);

// Define system instructions to guide ChatGPT's responses
const systemMessage =
  "You're a sarcastic chatbot in a Discord server. Keep your responses to 5 or fewer sentences.";

// Ignore messages with a specific prefix
const ignoreMessagePrefix = process.env.IGNORE_MESSAGE_PREFIX;
let chatChannels = process.env.CHANNEL_ID.split('-'); // Channels where the bot will respond

client.on('messageCreate', async (message) => {
  if (message.author.bot) return; // Ignore bot messages
  if (!chatChannels.includes(message.channelId)) return; // Ensure the bot responds only in specified channels
  if (message.content.startsWith(ignoreMessagePrefix)) return; // Ignore commands or prefixed messages

  // Prepare the conversation log with a system message
  let conversationLog = [{ role: 'system', content: systemMessage }];

  // Fetch recent messages to provide context to the chatbot
  let prevMessages = await message.channel.messages.fetch({ limit: 8 });
  prevMessages.reverse(); // Start with the oldest messages first

  let initialReply = await message.reply('<a:loading:1095759091869167747> Generating a response, please wait...');

  // Add each message to the conversation log, skipping other bots
  prevMessages.forEach((msg) => {
    if (msg.content.startsWith(ignoreMessagePrefix)) return;
    if (msg.author.bot && msg.author.id !== client.user.id) return; // Ignore other bots

    if (msg.author.id === client.user.id) {
      conversationLog.push({
        role: 'assistant',
        content: msg.content,
        name: msg.author.username.replace(/\s+/g, '_').replace(/[^\w\s]/gi, ''),
      });
    } else if (msg.author.id === message.author.id) {
      conversationLog.push({
        role: 'user',
        content: msg.content,
        name: message.author.username.replace(/\s+/g, '_').replace(/[^\w\s]/gi, ''),
      });
    }
  });

  // Make a request to OpenAI with the latest available model (GPT-4 or GPT-3.5-turbo)
  try {
    const response = await openai.createChatCompletion({
      model: process.env.OPENAI_MODEL || 'gpt-4', // Use GPT-4 or fallback to GPT-3.5 if needed
      messages: conversationLog,
      max_tokens: 256, // Adjust token limit to control response length
    });

    let gptReply = response.data.choices[0].message.content; // Get the response content

    if (gptReply.length > 2000) {
      gptReply = gptReply.slice(0, 1997) + '...'; // Ensure the message doesn't exceed Discord's 2000 character limit
    }

    initialReply.edit(gptReply); // Edit the initial loading message with the final response
  } catch (error) {
    console.error('Error generating response:', error);

    // Handle API errors and edit the reply to notify the user
    await initialReply.edit(
      `<:xmark:1055230112934674513> There was an error processing your request. Please try again later.`
    );

    setTimeout(() => {
      initialReply.delete();
    }, 5000);
  }
});

// Error handling for unhandled rejections and uncaught exceptions
process.on('unhandledRejection', (reason) => logErrors(reason));
process.on('uncaughtException', (reason) => logErrors(reason));

// Log the bot in using your Discord bot token
client.login(process.env.DISCORD_TOKEN);
