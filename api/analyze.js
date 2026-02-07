export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  try {
    const { provider, model, apiKey, prompt } = req.body;
    if (!apiKey) return res.status(400).json({ message: 'API key is required' });
    if (!prompt) return res.status(400).json({ message: 'Prompt is required' });

    let result;
    if (provider === 'gemini') {
      result = await callGemini(apiKey, model, prompt);
    } else if (provider === 'deepseek') {
      result = await callDeepSeek(apiKey, model, prompt);
    } else if (provider === 'openrouter') {
      result = await callOpenRouter(apiKey, model, prompt);
    } else {
      return res.status(400).json({ message: 'Unknown provider: ' + provider });
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
}

// ==================== Gemini ====================
async function callGemini(apiKey, model, prompt) {
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Gemini API request failed');
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('No response from Gemini');
  return parseAIResponse(text);
}

// ==================== DeepSeek ====================
async function callDeepSeek(apiKey, model, prompt) {
  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that analyzes English text and provides etymology information. Always respond with valid JSON only, no markdown.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3, max_tokens: 2048
    })
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'DeepSeek API request failed');
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response from DeepSeek');
  return parseAIResponse(text);
}

// ==================== OpenRouter (Claude etc.) ====================
async function callOpenRouter(apiKey, model, prompt) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://english-collector.vercel.app',
      'X-Title': 'English Collector'
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are a helpful assistant that analyzes English text and provides etymology information. Always respond with valid JSON only, no markdown code blocks.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const msg = errorData.error?.message || `OpenRouter error ${response.status}`;
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('No response from OpenRouter');
  return parseAIResponse(text);
}

// ==================== Parse ====================
function parseAIResponse(text) {
  let cleanText = text.trim();
  cleanText = cleanText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  const jsonMatch = cleanText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Could not parse AI response as JSON');

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.translation) parsed.translation = '';
    if (!Array.isArray(parsed.keywords)) parsed.keywords = [];

    parsed.keywords = parsed.keywords.map(k => ({
      word: k.word || '',
      phonetic: k.phonetic || '',
      roots: k.roots || '',
      origin: k.origin || '',
      meaning: k.meaning || ''
    })).slice(0, 5);

    return parsed;
  } catch (e) {
    throw new Error('Failed to parse AI response: ' + e.message);
  }
}
