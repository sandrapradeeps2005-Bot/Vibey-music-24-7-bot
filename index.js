const { Client, GatewayIntentBits } = require('discord.js');
const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');
const ytdl = require('ytdl-core');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent
  ]
});

const TOKEN = "DISCORD_BOT_TOKEN";

const queue = new Map();
const stay24_7 = new Map(); // stores guilds with 24/7 mode

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (!message.content.startsWith('!') || message.author.bot) return;

  const args = message.content.split(' ');
  const cmd = args[0];

  const voiceChannel = message.member.voice.channel;

  // JOIN
  if (cmd === '!join') {
    if (!voiceChannel) return message.reply('Join a VC first');

    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: message.guild.id,
      adapterCreator: message.guild.voiceAdapterCreator
    });

    message.reply('✅ Joined VC');
  }

  // LEAVE
  if (cmd === '!leave') {
    const serverQueue = queue.get(message.guild.id);
    if (serverQueue?.connection) {
      serverQueue.connection.destroy();
      queue.delete(message.guild.id);
    }
    stay24_7.delete(message.guild.id);
    message.reply('👋 Left VC');
  }

  // 24/7 MODE
  if (cmd === '!247') {
    if (args[1] === 'on') {
      stay24_7.set(message.guild.id, true);
      message.reply('🔁 24/7 mode enabled');
    } else if (args[1] === 'off') {
      stay24_7.delete(message.guild.id);
      message.reply('⛔ 24/7 mode disabled');
    }
  }

  // PLAY
  if (cmd === '!play') {
    const url = args[1];
    if (!url) return message.reply('Give a YouTube URL');
    if (!voiceChannel) return message.reply('Join VC first');

    let serverQueue = queue.get(message.guild.id);

    if (!serverQueue) {
      const newQueue = {
        voiceChannel,
        connection: null,
        player: createAudioPlayer(),
        songs: []
      };

      queue.set(message.guild.id, newQueue);
      newQueue.songs.push(url);

      try {
        const connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: message.guild.id,
          adapterCreator: message.guild.voiceAdapterCreator
        });

        newQueue.connection = connection;
        connection.subscribe(newQueue.player);

        playSong(message.guild, newQueue.songs[0]);

      } catch (err) {
        console.error(err);
        queue.delete(message.guild.id);
        return message.reply('Error joining VC');
      }

    } else {
      serverQueue.songs.push(url);
      message.reply('🎶 Added to queue');
    }
  }

  // SKIP
  if (cmd === '!skip') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue) return;
    serverQueue.player.stop();
  }

  // STOP
  if (cmd === '!stop') {
    const serverQueue = queue.get(message.guild.id);
    if (!serverQueue) return;
    serverQueue.songs = [];
    serverQueue.player.stop();
  }
});

function playSong(guild, song) {
  const serverQueue = queue.get(guild.id);

  if (!song) {
    // if 24/7 enabled → stay in VC
    if (!stay24_7.get(guild.id)) {
      serverQueue.connection.destroy();
      queue.delete(guild.id);
    }
    return;
  }

  const stream = ytdl(song, {
    filter: 'audioonly',
    quality: 'highestaudio',
    highWaterMark: 1 << 25
  });

  const resource = createAudioResource(stream);

  serverQueue.player.play(resource);

  serverQueue.player.once(AudioPlayerStatus.Idle, () => {
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });

  serverQueue.player.on('error', err => {
    console.error(err);
    serverQueue.songs.shift();
    playSong(guild, serverQueue.songs[0]);
  });
}

client.login(TOKEN);
