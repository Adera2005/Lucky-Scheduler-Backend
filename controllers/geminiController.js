const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

const getAIResponse = async (prompt) => {
  // Try Gemini first
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-3.6-flash' });

    const result = await model.generateContent(prompt);

    console.log('✅ Gemini responded');

    return {
      answer: result.response.text(),
      provider: 'Gemini',
    };
  } catch (geminiError) {
    console.log('⚠️ Gemini failed:', geminiError.message);
    console.log('🔄 Trying Groq as fallback...');
  }

  // Fall back to Groq
  try {
    const groq = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      model: 'openai/gpt-oss-20b',
    });

    console.log('✅ Groq responded');

    return {
      answer: completion.choices[0].message.content,
      provider: 'Groq',
    };
  } catch (groqError) {
    console.log('⚠️ Groq failed:', groqError.message);

    throw new Error(
      'AI assistant is temporarily unavailable. Please try again in a moment.'
    );
  }
};


// STANDARD QUESTION
// Used by the normal Assistant page
exports.askGemini = async (req, res) => {
  try {
    const { question, course } = req.body;

    if (!question || !course) {
      return res.status(400).json({
        status: 'fail',
        message: 'Kindly enter your query and course.',
      });
    }

    const prompt = `You are a helpful study assistant for university students.

The student is currently studying: ${course}.

Answer the following question clearly, simply, and with relevance to the question being asked.

Question:
${question}`;

    const { answer, provider } = await getAIResponse(prompt);

    res.status(200).json({
      status: 'success',
      message: `Answered by ${provider}`,
      data: {
        question,
        answer,
        course,
        provider,
      },
    });
  } catch (error) {
    console.error('AI error:', error.message);

    res.status(503).json({
      status: 'error',
      message: error.message,
    });
  }
};


// CONTEXT-AWARE QUESTION
// Uses the uploaded PDF content
exports.askWithContext = async (req, res) => {
  try {
    const {
      question,
      course,
      pdfText,
      pages,
    } = req.body;

    if (!question || !course) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please provide a question and course.',
      });
    }

    let prompt;

    if (pdfText && pdfText.length > 0) {

      // Use the PDF text as context
      const context = pdfText;

      prompt = `You are a helpful study assistant for university students.

The student is studying: ${course}.

They are currently reading pages: ${pages}.

Here is the actual content extracted from their uploaded study material:

---
${context}
---

IMPORTANT:
- Use the uploaded study material as your main source.
- Focus specifically on the pages the student asked about: ${pages}.
- Do not pretend that you have information that is not present in the uploaded material.
- Explain things clearly and simply because the student is learning the topic.

Question:
${question}`;

    } else {

      // No PDF text available
      prompt = `You are a helpful study assistant for university students.

The student is currently studying: ${course}.

They are currently reading pages: ${pages}.

Answer the following question clearly and simply.

Question:
${question}`;
    }

    const { answer, provider } = await getAIResponse(prompt);

    res.status(200).json({
      status: 'success',
      data: {
        question,
        answer,
        course,
        provider,
      },
    });

  } catch (error) {

    console.error('AI error:', error.message);

    res.status(503).json({
      status: 'error',
      message: error.message,
    });
  }
};