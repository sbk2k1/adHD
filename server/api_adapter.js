require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Groq = require('groq-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = process.env.PORT || 3000;

// Security middleware
app.use(helmet());

app.use(cors()); // This allows all origins by default

// Rate limiting - Different limits for different endpoints
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: true,
    message: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const summarizeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 summarize requests per minute
  message: {
    error: true,
    message: 'Too many summarization requests. Please wait before trying again.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting
app.use(generalLimiter);
app.use(express.json({ limit: '10mb' }));

// Simple API key authentication
const API_KEYS = new Set([
  process.env.API_KEY_1 || 'your-secret-api-key-1',
  process.env.API_KEY_2 || 'your-secret-api-key-2',
  // Add more API keys as needed
]);

// API Key middleware
function authenticateApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'] || req.query.apikey;
  
  if (!apiKey || !API_KEYS.has(apiKey)) {
    return res.status(401).json({
      error: true,
      message: 'Invalid or missing API key'
    });
  }
  
  next();
}

// Request validation middleware
const validateSummarizeRequest = [
  body('text')
    .isLength({ min: 10, max: 50000 })
    .withMessage('Text must be between 10 and 50,000 characters')
    .escape(),
  body('provider')
    .optional()
    .isIn(['groq', 'gemini'])
    .withMessage('Provider must be either "groq" or "gemini"'),
];

// Initialize providers
const groq = process.env.GROQ_API_KEY ? new Groq({ apiKey: process.env.GROQ_API_KEY }) : null;
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;

// Routes
app.get('/api/health', (req, res) => {
  return res.json({
    error: false,
    message: 'adHD Reading API is running securely',
    time: new Date().toISOString(),
    providers: {
      groq: !!groq,
      gemini: !!genAI
    },
    version: '1.0.0'
  });
});

// Protected summarize endpoint
app.post('/api/summarize', 
  summarizeLimiter,
  authenticateApiKey,
  validateSummarizeRequest,
  async (req, res) => {
    try {
      // Check validation results
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: true,
          message: 'Validation failed',
          details: errors.array()
        });
      }

      const { text, provider = 'groq' } = req.body;
      const requestId = uuidv4();
      

      // Check if provider is available
      if (provider === 'groq' && !groq) {
        return res.status(400).json({ 
          error: true, 
          message: 'Groq provider not available' 
        });
      }
      if (provider === 'gemini' && !genAI) {
        return res.status(400).json({ 
          error: true, 
          message: 'Gemini provider not available' 
        });
      }

      let summaryResponse, highlightResponse;

      // Add timeout to prevent hanging requests
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), 30000); // 30 seconds
      });

      if (provider === 'groq') {
        [summaryResponse, highlightResponse] = await Promise.race([
          Promise.all([
            getGroqSummary(text, requestId),
            getGroqHighlights(text, requestId)
          ]),
          timeoutPromise
        ]);
      } else if (provider === 'gemini') {
        [summaryResponse, highlightResponse] = await Promise.race([
          Promise.all([
            getGeminiSummary(text, requestId),
            getGeminiHighlights(text, requestId)
          ]),
          timeoutPromise
        ]);
      }

      // Process responses
      let summary = summaryResponse || '';
      let highlightedText = text;
      
      try {
        const phrasesToHighlight = Array.isArray(highlightResponse) 
          ? highlightResponse 
          : JSON.parse(highlightResponse || '[]');
        
        // Apply highlights safely
        phrasesToHighlight.slice(0, 20).forEach(phrase => { // Limit to 20 highlights
          if (phrase && phrase.length > 2 && phrase.length < 100) {
            const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
            highlightedText = highlightedText.replace(regex, `<mark>$&</mark>`);
          }
        });
      } catch (e) {
        console.warn(`[${requestId}] Could not parse highlight phrases:`, e.message);
      }

      // Clean up summary
      summary = summary.replace(/Key takeaways:|Here are|Summary:/gi, '').trim();
      if (!summary.includes('•')) {
        summary = summary.split('\n').filter(line => line.trim())
          .slice(0, 10) // Limit to 10 bullets
          .map(line => `• ${line.replace(/^-\s*/, '').trim()}`)
          .join('\n');
      }


      res.json({
        success: true,
        keyTakeaways: summary,
        highlightedText: highlightedText,
        provider: provider,
        requestId: requestId
      });

    } catch (error) {
      console.error('API Error:', error);
      res.status(500).json({
        error: true,
        message: 'Processing failed',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
);

// Helper functions remain the same but with request ID logging
async function getGroqSummary(text, requestId) {
  try {
    const summaryPrompt = `Extract the key takeaways from this text as short bullet points.
Each bullet should be 5-10 words and capture one main concept.
Use this format:
- [key concept]
- [key concept]

Text:
${text}

Key takeaways:`;

    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You extract key concepts as very short bullet points for ADHD reading assistance." },
        { role: "user", content: summaryPrompt }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 200
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error(`[${requestId}] Groq summary error:`, error);
    throw error;
  }
}

async function getGroqHighlights(text, requestId) {
  try {
    const highlightPrompt = `Identify the most important phrases and technical terms in this text that should be highlighted for ADHD readers.
Return ONLY a JSON array of the exact phrases to highlight (5-15 words each).
Focus on key concepts, definitions, and important relationships.

Example: ["Central Processing Unit", "independent processing units", "simultaneous multithreading"]

Text:
${text}

Important phrases to highlight:`;

    const response = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "You identify key phrases to highlight for ADHD reading assistance. Return only a JSON array of phrases." },
        { role: "user", content: highlightPrompt }
      ],
      model: "llama-3.1-8b-instant",
      temperature: 0.1,
      max_tokens: 300
    });

    return response.choices[0]?.message?.content || '[]';
  } catch (error) {
    console.error(`[${requestId}] Groq highlights error:`, error);
    return '[]';
  }
}

async function getGeminiSummary(text, requestId) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Extract the key takeaways from this text as short bullet points.
Each bullet should be 5-10 words and capture one main concept.
Use this format:
- [key concept]
- [key concept]

Text:
${text}

Key takeaways:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    return response.text();
  } catch (error) {
    console.error(`[${requestId}] Gemini summary error:`, error);
    throw error;
  }
}

async function getGeminiHighlights(text, requestId) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
    
    const prompt = `Identify the most important phrases and technical terms in this text that should be highlighted for ADHD readers.
Return ONLY a JSON array of the exact phrases to highlight (3-15 words each).
Focus on key concepts, definitions, and important relationships.

Example response format:
["Central Processing Unit", "independent processing units", "simultaneous multithreading"]

Text:
${text}

JSON array of phrases to highlight:`;

    const result = await model.generateContent(prompt);
    const response = result.response;
    const responseText = response.text();
    
    const jsonMatch = responseText.match(/\[.*\]/s);
    if (jsonMatch) {
      return jsonMatch[0];
    }
    return '[]';
  } catch (error) {
    console.error(`[${requestId}] Gemini highlights error:`, error);
    return '[]';
  }
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: true,
    message: 'Something went wrong!'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: true,
    message: 'Endpoint not found'
  });
});

app.listen(port, () => {
  console.log(`🧠 adHD Reading API running securely at http://localhost:${port}`);
  console.log(`🔒 Rate limiting: 10 requests/minute for /summarize`);
  console.log(`🔑 API Key authentication enabled`);
  console.log(`🚀 Providers: Groq ${groq ? '✅' : '❌'}, Gemini ${genAI ? '✅' : '❌'}`);
});