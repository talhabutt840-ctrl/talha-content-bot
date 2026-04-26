require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const cron = require('node-cron');

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

let myChatId = null;
let pendingPost = null;

async function generateCaption(niche, trend) {
  const response = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
    model: 'llama-3.3-70b-versatile',
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: `Create an Instagram post caption for a ${niche} page about "${trend}". 
      Include:
      - Engaging caption (2-3 lines)
      - 5 relevant keywords
      - 10 hashtags
      Format: Caption first, then Keywords:, then Hashtags:`
    }]
  }, {
    headers: {
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  return response.data.choices[0].message.content;
}

async function generateImageUrl(prompt) {
  try {
    const response = await axios.post('https://api.openai.com/v1/images/generations', {
      model: 'dall-e-3',
      prompt: `Professional social media post image: ${prompt}. Modern, clean design, vibrant colors, no text.`,
      n: 1,
      size: '1024x1024',
      quality: 'standard'
    }, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data.data[0].url;
  } catch (err) {
    console.error('DALL-E error:', err.response?.data || err.message);
    const encoded = encodeURIComponent(prompt);
    const seed = Math.floor(Math.random() * 1000000);
    return `https://image.pollinations.ai/prompt/${encoded}?width=1080&height=1080&nologo=true&seed=${seed}`;
  }
}

async function postToInstagram(imageUrl, caption) {
  try {
    const container = await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/media`,
      {
        image_url: imageUrl,
        caption: caption,
        access_token: process.env.INSTAGRAM_TOKEN
      }
    );
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/media_publish`,
      {
        creation_id: container.data.id,
        access_token: process.env.INSTAGRAM_TOKEN
      }
    );
    return true;
  } catch (err) {
    console.error('Instagram error:', err.response?.data || err.message);
    return false;
  }
}

async function postToFacebook(imageUrl, caption) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${process.env.FB_PAGE_ID}/photos`,
      {
        url: imageUrl,
        message: caption,
        access_token: process.env.FB_PAGE_TOKEN
      }
    );
    return true;
  } catch (err) {
    console.error('Facebook error:', err.response?.data || err.message);
    return false;
  }
}

const niches = ['ecommerce', 'personal branding', 'motivational'];
const trends = {
  ecommerce: ['dropshipping tips', 'Etsy selling', 'product photography', 'online store growth', 'print on demand'],
  'personal branding': ['content creation', 'Instagram growth', 'personal brand story', 'audience building', 'thought leadership'],
  motivational: ['morning routine', 'success mindset', 'productivity hacks', 'self discipline', 'goal setting']
};

async function sendDailyContent() {
  if (!myChatId) return;

  const niche = niches[Math.floor(Math.random() * niches.length)];
  const trendList = trends[niche];
  const trend = trendList[Math.floor(Math.random() * trendList.length)];

  bot.sendMessage(myChatId, `🎨 *Generating today's post...*\n\nNiche: ${niche}\nTrend: ${trend}`, { parse_mode: 'Markdown' });

  const caption = await generateCaption(niche, trend);
  const imagePrompt = `${trend} for ${niche}, professional, modern, high quality`;
  const imageUrl = await generateImageUrl(imagePrompt);

  pendingPost = { imageUrl, caption, niche, trend };

  await bot.sendPhoto(myChatId, imageUrl, {
    caption: `📝 *Caption Preview:*\n\n${caption}\n\n✅ Approve karo? Reply karo:\n*yes* - Post kar do\n*no* - Skip karo\n*new* - Naya generate karo`,
    parse_mode: 'Markdown'
  });
}

bot.onText(/\/start/, (msg) => {
  myChatId = msg.chat.id;
  bot.sendMessage(msg.chat.id, `🚀 *Talha Content Bot Active!*\n\nRoz subah 9 baje aapko post design mil jaega approval ke liye!\n\n/generate - Abhi generate karo\n/status - Bot status`, { parse_mode: 'Markdown' });
});

bot.onText(/\/generate/, async (msg) => {
  myChatId = msg.chat.id;
  await sendDailyContent();
});

bot.onText(/\/status/, (msg) => {
  bot.sendMessage(msg.chat.id, `✅ Bot chal raha hai!\nChat ID: ${msg.chat.id}`);
});

bot.on('message', async (msg) => {
  const text = msg.text?.toLowerCase();
  if (!pendingPost) return;
  if (text === '/start' || text === '/generate' || text === '/status') return;

  if (text === 'yes') {
    bot.sendMessage(msg.chat.id, '📤 *Posting...*', { parse_mode: 'Markdown' });
    const igSuccess = await postToInstagram(pendingPost.imageUrl, pendingPost.caption);
    const fbSuccess = await postToFacebook(pendingPost.imageUrl, pendingPost.caption);
    let result = '✅ *Posted!*\n\n';
    result += igSuccess ? '✅ Instagram - Done!\n' : '❌ Instagram - Failed\n';
    result += fbSuccess ? '✅ Facebook - Done!' : '❌ Facebook - Failed';
    bot.sendMessage(msg.chat.id, result, { parse_mode: 'Markdown' });
    pendingPost = null;

  } else if (text === 'no') {
    bot.sendMessage(msg.chat.id, '⏭ Skipped! Kal naya post ayega.');
    pendingPost = null;

  } else if (text === 'new') {
    bot.sendMessage(msg.chat.id, '🔄 Naya generate kar raha hoon...');
    await sendDailyContent();
  }
});

cron.schedule('0 9 * * *', () => {
  sendDailyContent();
}, { timezone: 'Asia/Karachi' });

console.log('🤖 Talha Content Bot chal raha hai!');