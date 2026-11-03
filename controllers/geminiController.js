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

FORMATTING RULES — follow these strictly:
- Write in clean, readable plain text with proper paragraphs.
- Use bullet points (•) or numbered lists only when listing multiple items.
- Use **bold** only to highlight key terms or headings.
- Do NOT use excessive asterisks, symbols, or markdown decorations.
- Do NOT repeat the question back to the student.
- Keep the tone friendly, clear, and academic.
- Be concise and directly answer the question.

Question: ${question}`;

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

Here is the content extracted from their uploaded study material:
---
${context}
---

FORMATTING RULES — follow these strictly:
- Write in clean, readable plain text with proper paragraphs.
- Use bullet points (•) or numbered lists only when listing multiple items.
- Use **bold** only to highlight key terms or headings.
- Do NOT use excessive asterisks, symbols, or markdown decorations.
- Do NOT repeat the question back to the student.
- Keep the tone friendly, clear, and academic.
- Limit your response to what is relevant to pages ${pages} of the material.
- If the answer is not in the material, say so honestly rather than guessing.

Question: ${question}`;

    } else {

      // No PDF text available
      prompt = `You are a helpful study assistant for university students.

The student is currently studying: ${course}.
They are currently reading pages: ${pages}.

FORMATTING RULES — follow these strictly:
- Write in clean, readable plain text with proper paragraphs.
- Use bullet points (•) or numbered lists only when listing multiple items.
- Use **bold** only to highlight key terms or headings.
- Do NOT use excessive asterisks, symbols, or markdown decorations.
- Do NOT repeat the question back to the student.
- Keep the tone friendly, clear, and academic.

Question: ${question}`;
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