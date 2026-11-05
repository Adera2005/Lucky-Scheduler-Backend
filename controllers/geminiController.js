const { GoogleGenerativeAI } = require('@google/generative-ai');
const Groq = require('groq-sdk');

// ── Shared AI dispatcher ───────────────────────────────────────
// Tries Gemini first; falls back to Groq.
// pdfText is intentionally NOT passed here — callers pre-trim it
// to a safe length before building the prompt.
const getAIResponse = async (prompt) => {
  // ── 1. Gemini ──────────────────────────────────────────────
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.6-flash',
      systemInstruction: {
        parts: [
          {
            text:
              'You are a distinguished university professor and master tutor. ' +
              'Your goal is to provide exceptionally clear, structured, and easy-to-read explanations. ' +
              'Always structure your responses using GitHub Flavored Markdown:\n' +
              '- Use clean headings (### Heading) for logical sections.\n' +
              '- Use structured bullet points (•) for definitions, key concepts, and takeaways.\n' +
              '- Highlight core terms in **bold**.\n' +
              '- Use formatted code blocks with syntax highlighting (e.g. ```java) for all code.\n' +
              '- Break down complex ideas into simple, intuitive, step-by-step explanations with analogies.\n' +
              '- Do NOT write walls of unstructured text or conversational filler.',
          },
        ],
      },
      generationConfig: {
        temperature: 0.3,
      },
    });

    const result = await model.generateContent(prompt);
    console.log('✅ Gemini responded');

    return {
      answer:   result.response.text(),
      provider: 'Gemini',
    };
  } catch (geminiError) {
    console.log('⚠️ Gemini failed:', geminiError.message);
    console.log('🔄 Trying Groq as fallback...');
  }

  // ── 2. Groq fallback ───────────────────────────────────────
  try {
    const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'You are an expert academic tutor and university professor. ' +
            'Provide clear, well-structured, authoritative responses using GitHub Flavored Markdown. ' +
            'Organize your answers with bold headers (### Header), structured bullet points, clear spacing, ' +
            'and clean code blocks where relevant. Avoid filler, fluff, or conversational preamble.',
        },
        { role: 'user', content: prompt },
      ],
      model:       'openai/gpt-oss-20b',
      temperature: 0.3,
    });

    console.log('✅ Groq responded');

    return {
      answer:   completion.choices[0].message.content,
      provider: 'Groq',
    };
  } catch (groqError) {
    console.log('⚠️ Groq failed:', groqError.message);
    throw new Error('AI assistant is temporarily unavailable. Please try again in a moment.');
  }
};

// ── How many characters of PDF text to include in a prompt ────
// Groq on-demand tier for `openai/gpt-oss-20b` has a TPM limit of 8,000 tokens.
// 12,000 chars ≈ 3,000 tokens, which easily fits within 8,000 TPM limit
// even when Gemini fails and we fallback to Groq.
const GROQ_SAFE_CHARS = 12000;

/**
 * Trims the pdfText to a length safe for Groq.
 * We always pass the trimmed version to the prompt-builder so both
 * Gemini and Groq receive the same string (Gemini has headroom to spare).
 */
function safePdfSlice(pdfText) {
  if (!pdfText) return '';
  return pdfText.length > GROQ_SAFE_CHARS
    ? pdfText.substring(0, GROQ_SAFE_CHARS) + '\n[…text truncated for length…]'
    : pdfText;
}


// ── STANDARD QUESTION ─────────────────────────────────────────
// Used by the normal Assistant page (no PDF context)
exports.askGemini = async (req, res) => {
  try {
    const { question, course } = req.body;

    if (!question || !course) {
      return res.status(400).json({
        status:  'fail',
        message: 'Kindly enter your query and course.',
      });
    }

    const prompt = `You are a world-class university professor and interactive tutor specializing in ${course}.

Your objective is to provide a master-class, deeply educational, and intellectually engaging response to the student's question.

STUDENT QUESTION:
"${question}"

PEDAGOGICAL & FORMATTING GUIDELINES:
1. DEPTH & RIGOR: Provide an authoritative, insightful answer. Do not give shallow, generic, or robotic responses. Unpack underlying mechanisms and explain the "why" and "how".
2. STRUCTURE & FLOW: Organize with clear thematic headings (**Bold Headings**), short intuitive paragraphs, and structured bullet points (•) or numbered lists for sequential steps.
3. CONCRETE ILLUSTRATIONS: Where applicable (especially in programming, STEM, or technical subjects), include precise, clean, well-annotated code snippets or concrete illustrative examples.
4. INTELLECTUAL CLARITY: Use precise terminology, but unpack abstract jargon through intuitive explanations or analogies.
5. NO REDUNDANCIES: Do NOT repeat the question back to the student. Jump directly into the explanation with a strong, insightful opening.`;

    const { answer, provider } = await getAIResponse(prompt);

    res.status(200).json({
      status:  'success',
      message: `Answered by ${provider}`,
      data:    { question, answer, course, provider },
    });
  } catch (error) {
    console.error('AI error:', error.message);

    // 503 with a clear, friendly message the front-end can display
    res.status(503).json({
      status:  'error',
      message: error.message,
    });
  }
};


// ── CONTEXT-AWARE QUESTION ────────────────────────────────────
// Uses the uploaded PDF content (safely trimmed for Groq fallback)
exports.askWithContext = async (req, res) => {
  try {
    const { question, course, pdfText, pages } = req.body;

    if (!question || !course) {
      return res.status(400).json({
        status:  'fail',
        message: 'Please provide a question and course.',
      });
    }

    // Trim PDF text to a length that is safe for BOTH Gemini AND Groq
    const safeContext = safePdfSlice(pdfText);

    let prompt;

    if (safeContext.length > 0) {
      prompt = `You are an elite academic mentor and university tutor guiding a student through their study material for ${course}.
The student is actively working on pages: ${pages}.

Below is the extracted context from their study document for these pages:
=== DOCUMENT CONTEXT ===
${safeContext}
=== END CONTEXT ===

STUDENT REQUEST / TASK:
"${question}"

PEDAGOGICAL & FORMATTING STANDARDS:
1. SCHOLARLY PRECISION: Ground your explanations directly in the facts, methods, and terminology presented in the study document.
2. EXPLANATORY EXCELLENCE: If explaining or summarizing, synthesize the concepts into clear, engaging, high-retention insights rather than merely regurgitating text. Break down complex mechanisms step-by-step.
3. CONCRETE EXAMPLES: When code, algorithms, or formulas are discussed, provide well-commented, error-free examples demonstrating the exact principle.
4. CLEAN MARKDOWN STRUCTURE:
   - Use bold headers (**Section Title**) for distinct parts of your answer.
   - Use crisp bullet points (•) or numbered lists for steps, rules, or takeaways.
   - Use inline code formatting (\`like this\`) or fenced code blocks for technical terms and code.
5. RELEVANCE & HONESTY: Focus on the assigned scope (pages ${pages}). If a question asks about details omitted from the text, state what is known from the text and supplement with sound general principles from ${course}. Do NOT hallucinate absent facts.`;

    } else {
      prompt = `You are an elite academic mentor and university tutor guiding a student in ${course}.
The student is studying content corresponding to pages: ${pages}.

STUDENT REQUEST / TASK:
"${question}"

PEDAGOGICAL & FORMATTING STANDARDS:
1. SCHOLARLY PRECISION: Provide a rigorous, thorough, and articulate explanation tailored to ${course}.
2. STEP-BY-STEP BREAKDOWN: Explain foundational principles first, then progress to practical application or deeper nuances.
3. CONCRETE EXAMPLES: Provide clear, concrete code snippets or real-world technical illustrations where appropriate.
4. CLEAN MARKDOWN STRUCTURE:
   - Use bold headers (**Section Title**) for distinct parts of your answer.
   - Use bullet points (•) or numbered lists for sequential steps and takeaways.
   - Avoid fluff, introductory filler, or repeating the prompt.`;
    }

    const { answer, provider } = await getAIResponse(prompt);

    res.status(200).json({
      status: 'success',
      data:   { question, answer, course, provider },
    });

  } catch (error) {
    console.error('AI error:', error.message);

    res.status(503).json({
      status:  'error',
      message: error.message,
    });
  }
};
